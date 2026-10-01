import { Router } from 'express';
import pool from '../db/pool.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import { ensureCategoryColumns } from '../utils/ensureCategorySchema.js';
import { assertUploadedFileKind } from '../utils/uploadValidation.js';
import { requireRoles } from '../middleware/auth.js';

const router = Router();

// Make sure schema columns exist so routes don't crash if a migration was missed.
ensureCategoryColumns().catch((e) => console.error('ensureCategoryColumns:', e));

// Also ensure schema is ready before serving requests (prevents first-request race).
router.use(async (_req, _res, next) => {
  try {
    await ensureCategoryColumns();
    next();
  } catch (e) {
    next(e);
  }
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const categoryImagesDir = path.join(__dirname, '..', 'uploads', 'categories');
const CATEGORY_SELECT = 'id, nom, nom_ar, nom_en, nom_zh, description, image_url, ai_image_cost_usd, ai_image_cost_estimated, ai_image_model, ai_image_quality, parent_id, created_by, updated_by, created_at, updated_at';
const IMAGE_MODEL = 'gpt-image-2';
const IMAGE_QUALITY = 'medium';
const IMAGE_OUTPUT_ESTIMATE_USD = 0.053;
const generatingCategories = new Set();

function imageCost(result) {
  const details = result?.usage?.input_tokens_details;
  const textTokens = Number(details?.text_tokens);
  const imageTokens = Number(details?.image_tokens ?? 0);
  const outputTokens = Number(result?.usage?.output_tokens);
  if ([textTokens, imageTokens, outputTokens].every(Number.isFinite)) {
    return { usd: (textTokens * 5 + imageTokens * 8 + outputTokens * 30) / 1_000_000, estimated: false };
  }
  return { usd: IMAGE_OUTPUT_ESTIMATE_USD, estimated: true };
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'categories');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype) || !['.jpg', '.jpeg', '.png', '.webp'].includes(extension)) {
      return cb(new Error('Seules les images JPG, PNG et WebP sont autorisées'));
    }
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 30 },
});

function maybeUploadSingle(fieldName) {
  const mw = upload.single(fieldName);
  return (req, res, next) => {
    const ct = String(req.headers['content-type'] || '');
    if (!ct.toLowerCase().includes('multipart/form-data')) return next();
    return mw(req, res, next);
  };
}

function normalizeNullableText(value) {
  if (value === undefined) return undefined;
  const s = String(value ?? '').trim();
  return s ? s : null;
}

function toNullableNumber(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT ${CATEGORY_SELECT} FROM categories ORDER BY id DESC`);
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const [rows] = await pool.query(`SELECT ${CATEGORY_SELECT} FROM categories WHERE id = ?`, [id]);
    const cat = rows[0];
    if (!cat) return res.status(404).json({ message: 'Catégorie introuvable' });
    res.json(cat);
  } catch (err) { next(err); }
});

router.post('/', maybeUploadSingle('image'), async (req, res, next) => {
  try {
    if (req.file) await assertUploadedFileKind(req.file, ['jpeg', 'png', 'webp']);
    const { nom, nom_ar, nom_en, nom_zh, description, parent_id, created_by, image_url: image_url_body } = req.body;
    if (!nom || !nom.trim()) return res.status(400).json({ message: 'Nom requis' });

    const image_url_from_upload = req.file ? `/uploads/categories/${req.file.filename}` : null;
    const image_url_from_body = normalizeNullableText(image_url_body);
    const image_url = image_url_from_upload || image_url_from_body || null;

    const parentId = toNullableNumber(parent_id);
    const createdBy = toNullableNumber(created_by);

    const nextAr = normalizeNullableText(nom_ar) ?? null;
    const nextEn = normalizeNullableText(nom_en) ?? null;
    const nextZh = normalizeNullableText(nom_zh) ?? null;
    if (!nextAr) return res.status(400).json({ message: 'Nom arabe requis' });
    
    // Prevent circular references
    if (parentId) {
      const [parentCheck] = await pool.query('SELECT id FROM categories WHERE id = ?', [parentId]);
      if (parentCheck.length === 0) {
        return res.status(400).json({ message: 'Catégorie parente introuvable' });
      }
    }
    
    const now = new Date();
    const [result] = await pool.query(
      'INSERT INTO categories (nom, nom_ar, nom_en, nom_zh, description, image_url, parent_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        nom.trim(),
        nextAr,
        nextEn,
        nextZh,
        normalizeNullableText(description) ?? null,
        image_url,
        parentId ?? null,
        createdBy ?? null,
        now,
        now,
      ]
    );
    const id = result.insertId;
    const [rows] = await pool.query(`SELECT ${CATEGORY_SELECT} FROM categories WHERE id = ?`, [id]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', maybeUploadSingle('image'), async (req, res, next) => {
  try {
    if (req.file) await assertUploadedFileKind(req.file, ['jpeg', 'png', 'webp']);
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const { nom, nom_ar, nom_en, nom_zh, description, parent_id, updated_by, image_url: image_url_body } = req.body;
    const [exists] = await pool.query('SELECT id, parent_id, image_url FROM categories WHERE id = ?', [id]);
    if (exists.length === 0) return res.status(404).json({ message: 'Catégorie introuvable' });
    
    const currentCategory = exists[0];
    
    // Prevent circular references and self-parenting
    const parentId = toNullableNumber(parent_id);
    if (parentId !== undefined && parentId !== null) {
      if (parentId === id) {
        return res.status(400).json({ message: 'Une catégorie ne peut pas être son propre parent' });
      }
      
      // Check if parent exists
      const [parentCheck] = await pool.query('SELECT id FROM categories WHERE id = ?', [parentId]);
      if (parentCheck.length === 0) {
        return res.status(400).json({ message: 'Catégorie parente introuvable' });
      }
      
      // Prevent circular reference: check if parent_id is a descendant of id
      async function isDescendant(ancestorId, potentialDescendantId) {
        if (ancestorId === potentialDescendantId) return true;
        const [children] = await pool.query('SELECT id FROM categories WHERE parent_id = ?', [ancestorId]);
        for (const child of children) {
          if (await isDescendant(child.id, potentialDescendantId)) return true;
        }
        return false;
      }
      
      if (await isDescendant(id, parentId)) {
        return res.status(400).json({ message: 'Impossible: cela créerait une référence circulaire' });
      }
    }
    
    // Load current values so omitted translation fields can be preserved.
    const [curRows] = await pool.query('SELECT nom, nom_ar, nom_en, nom_zh FROM categories WHERE id = ?', [id]);
    const cur = curRows?.[0] || {};

    const nextNom = nom !== undefined ? normalizeNullableText(nom) : normalizeNullableText(cur.nom);
    const providedAr = nom_ar !== undefined;
    const providedEn = nom_en !== undefined;
    const providedZh = nom_zh !== undefined;

    let nextAr = providedAr ? (normalizeNullableText(nom_ar) ?? null) : (normalizeNullableText(cur.nom_ar) ?? null);
    let nextEn = providedEn ? (normalizeNullableText(nom_en) ?? null) : (normalizeNullableText(cur.nom_en) ?? null);
    let nextZh = providedZh ? (normalizeNullableText(nom_zh) ?? null) : (normalizeNullableText(cur.nom_zh) ?? null);
    if (!nextAr) return res.status(400).json({ message: 'Nom arabe requis' });

    const now = new Date();
    const fields = [];
    const values = [];
    if (nom !== undefined) { fields.push('nom = ?'); values.push(nextNom); }
    if (nom_ar !== undefined) { fields.push('nom_ar = ?'); values.push(nextAr); }
    if (nom_en !== undefined) { fields.push('nom_en = ?'); values.push(nextEn); }
    if (nom_zh !== undefined) { fields.push('nom_zh = ?'); values.push(nextZh); }
    if (description !== undefined) { fields.push('description = ?'); values.push(normalizeNullableText(description)); }
    if (parentId !== undefined) { fields.push('parent_id = ?'); values.push(parentId); }
    if (updated_by !== undefined) { fields.push('updated_by = ?'); values.push(toNullableNumber(updated_by)); }

    const image_url_from_upload = req.file ? `/uploads/categories/${req.file.filename}` : null;
    if (image_url_from_upload) {
      fields.push('image_url = ?');
      values.push(image_url_from_upload);
    } else if (image_url_body !== undefined) {
      fields.push('image_url = ?');
      values.push(normalizeNullableText(image_url_body));
    }
    if (image_url_from_upload || (image_url_body !== undefined && normalizeNullableText(image_url_body) !== currentCategory.image_url)) {
      fields.push('ai_image_cost_usd = NULL', 'ai_image_cost_estimated = 0', 'ai_image_model = NULL', 'ai_image_quality = NULL');
    }
    fields.push('updated_at = ?'); values.push(now);
    const sql = `UPDATE categories SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);
    await pool.query(sql, values);
    const [rows] = await pool.query(`SELECT ${CATEGORY_SELECT} FROM categories WHERE id = ?`, [id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/:id/generate-image', requireRoles('PDG', 'Manager', 'ManagerPlus'), async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'ID invalide' });
  if (generatingCategories.has(id)) return res.status(409).json({ message: 'Une image est déjà en cours de création pour cette catégorie' });
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return res.status(503).json({ message: 'OPENAI_API_KEY non configurée côté serveur' });

  generatingCategories.add(id);
  let savedPath = null;
  try {
    const [rows] = await pool.query('SELECT id, nom, nom_ar, nom_en, description FROM categories WHERE id = ?', [id]);
    const category = rows[0];
    if (!category) return res.status(404).json({ message: 'Catégorie introuvable' });

    const label = String(category.nom || '').trim();
    const details = String(category.description || '').trim().slice(0, 400);
    const prompt = [
      'Create one photorealistic square ecommerce category thumbnail for a hardware and home-improvement shop in Morocco.',
      `Category: ${label}.`,
      details ? `Category context: ${details}.` : '',
      'Show a clear, tasteful arrangement of representative real products or materials for this category.',
      'Clean studio lighting, neutral light background, centered composition, realistic colors.',
      'No words, labels, logos, watermarks, people, or UI. Avoid depicting unrelated products.'
    ].filter(Boolean).join(' ');

    const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 120000 });
    const result = await client.images.generate({
      model: IMAGE_MODEL,
      prompt,
      size: '1024x1024',
      quality: IMAGE_QUALITY,
      n: 1,
    });
    const encoded = result?.data?.[0]?.b64_json;
    if (!encoded) throw new Error('Réponse IA sans image');

    const filename = `ai-category-${id}-${randomUUID()}.png`;
    fs.mkdirSync(categoryImagesDir, { recursive: true });
    savedPath = path.join(categoryImagesDir, filename);
    await fs.promises.writeFile(savedPath, Buffer.from(encoded, 'base64'));
    const imageUrl = `/uploads/categories/${filename}`;
    const cost = imageCost(result);

    const [update] = await pool.query(`
      UPDATE categories SET image_url = ?, ai_image_cost_usd = ?, ai_image_cost_estimated = ?,
        ai_image_model = ?, ai_image_quality = ?, updated_by = ?, updated_at = ?
      WHERE id = ?
    `, [imageUrl, cost.usd, cost.estimated ? 1 : 0, IMAGE_MODEL, IMAGE_QUALITY, req.user.id, new Date(), id]);
    if (!update.affectedRows) return res.status(404).json({ message: 'Catégorie introuvable' });
    savedPath = null;
    const [updated] = await pool.query(`SELECT ${CATEGORY_SELECT} FROM categories WHERE id = ?`, [id]);
    res.json(updated[0]);
  } catch (err) {
    if (err?.status === 429) {
      const headerValue = err.headers?.get?.('retry-after') ?? err.headers?.['retry-after'];
      const retryAfter = Math.max(1, Math.min(120, Number(headerValue) || 60));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ message: 'Limite temporaire de génération IA. Nouvelle tentative automatique possible.', retry_after_seconds: retryAfter });
    }
    next(err);
  } finally {
    if (savedPath) await fs.promises.unlink(savedPath).catch(() => {});
    generatingCategories.delete(id);
  }
});

// Check if category is used by products
router.get('/:id/usage', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const [products] = await pool.query('SELECT COUNT(*) as count FROM products WHERE categorie_id = ?', [id]);
    const [children] = await pool.query('SELECT COUNT(*) as count FROM categories WHERE parent_id = ?', [id]);
    res.json({ 
      productCount: products[0].count,
      subcategoryCount: children[0].count,
      canDelete: products[0].count === 0 && children[0].count === 0
    });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    if (id === 1) {
      return res.status(400).json({ message: "Impossible de supprimer la catégorie par défaut (UNCATEGORIZED)" });
    }
    
    // Check if category has products
    const [products] = await pool.query('SELECT COUNT(*) as count FROM products WHERE categorie_id = ?', [id]);
    if (products[0].count > 0) {
      return res.status(400).json({ 
        message: `Impossible de supprimer cette catégorie car elle est utilisée par ${products[0].count} produit(s)`,
        productCount: products[0].count
      });
    }
    
    // Check if category has subcategories
    const [children] = await pool.query('SELECT COUNT(*) as count FROM categories WHERE parent_id = ?', [id]);
    if (children[0].count > 0) {
      return res.status(400).json({ 
        message: `Impossible de supprimer cette catégorie car elle contient ${children[0].count} sous-catégorie(s)`,
        subcategoryCount: children[0].count
      });
    }
    
    // Delete the category
    await pool.query('DELETE FROM categories WHERE id = ?', [id]);
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
