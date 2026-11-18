import { ensureProductCategoriesSchema } from '../utils/productCategories.js';
import { Router } from 'express';
import pool from '../db/pool.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import OpenAI, { toFile } from 'openai';
import sharp from 'sharp';
import { ensureCategoryColumns, CATEGORY_ORDER_SQL } from '../utils/ensureCategorySchema.js';
import { assertUploadedFileKind } from '../utils/uploadValidation.js';
import { requireRoles } from '../middleware/auth.js';
import { optimizeImageFile } from '../utils/optimizeImage.js';
import { applyCategoryCover } from '../utils/categoryCoverFromCatalog.js';

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
const CATEGORY_SELECT = 'id, nom, nom_ar, nom_en, nom_zh, description, image_url, ai_image_cost_usd, ai_image_cost_estimated, ai_image_model, ai_image_quality, parent_id, sort_order, created_by, updated_by, created_at, updated_at';
const IMAGE_MODEL = 'gpt-image-2';
const IMAGE_QUALITY = 'medium';
const IMAGE_OUTPUT_ESTIMATE_USD = 0.053;
const generatingCategories = new Set();
// Real product photos given to the AI as references for a category cover.
const REFERENCE_PRODUCTS = 4;
const uploadsRoot = path.join(__dirname, '..', 'uploads');

/** The category and all its sub-categories (any depth). */
async function categoryWithDescendants(id) {
  const [rows] = await pool.query('SELECT id, parent_id FROM categories');
  const children = new Map();
  for (const row of rows) {
    if (!row.parent_id) continue;
    if (!children.has(row.parent_id)) children.set(row.parent_id, []);
    children.get(row.parent_id).push(row.id);
  }
  const ids = [id];
  for (let i = 0; i < ids.length; i += 1) ids.push(...(children.get(ids[i]) || []));
  return [...new Set(ids)];
}

/**
 * Up to REFERENCE_PRODUCTS published products of the category that have a photo on this server,
 * spread over its sub-categories (one per sub-category first), in-stock products first.
 */
async function referenceProducts(categoryId) {
  const ids = await categoryWithDescendants(categoryId);
  const marks = ids.map(() => '?').join(',');
  const [rows] = await pool.query(`
    SELECT p.id, p.designation, p.image_url, p.categorie_id
    FROM products p
    WHERE p.ecom_published = 1
      AND COALESCE(p.is_deleted, 0) = 0
      AND COALESCE(p.est_service, 0) = 0
      AND p.image_url IS NOT NULL AND p.image_url <> ''
      AND (p.categorie_id IN (${marks})
        OR EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id IN (${marks})))
    ORDER BY (COALESCE(p.stock_partage_ecom_qty, 0) > 0) DESC, p.id DESC
    LIMIT 80
  `, [...ids, ...ids]);

  const usable = rows.filter((row) => {
    const url = String(row.image_url || '');
    if (!url.startsWith('/uploads/')) return false;
    const file = path.resolve(uploadsRoot, url.replace(/^\/uploads\//, ''));
    return file.startsWith(uploadsRoot) && fs.existsSync(file);
  });
  // Round robin over sub-categories, so a univers cover mixes its departments.
  const groups = new Map();
  for (const row of usable) {
    const key = row.categorie_id ?? 0;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const picked = [];
  const seenImages = new Set();
  const queues = [...groups.values()];
  while (picked.length < REFERENCE_PRODUCTS && queues.some((queue) => queue.length)) {
    for (const queue of queues) {
      const row = queue.shift();
      if (!row || seenImages.has(row.image_url)) continue;
      seenImages.add(row.image_url);
      picked.push(row);
      if (picked.length >= REFERENCE_PRODUCTS) break;
    }
  }
  return picked;
}

/** A product photo as an upload for the image API, reduced to 768 px on a white background. */
async function referenceFile(product, index) {
  const file = path.resolve(uploadsRoot, String(product.image_url).replace(/^\/uploads\//, ''));
  const buffer = await sharp(file, { failOn: 'none' })
    .rotate()
    .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 88 })
    .toBuffer();
  return toFile(buffer, `product-${index + 1}.jpg`, { type: 'image/jpeg' });
}

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
    const [rows] = await pool.query(`SELECT ${CATEGORY_SELECT} FROM categories ORDER BY ${CATEGORY_ORDER_SQL()}`);
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
    if (req.file?.path) await optimizeImageFile(req.file.path);
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

// Reorder siblings (drag & drop): every id in ordered_ids becomes a child of parent_id,
// with sort_order = its position. Used both to reorder within a level and to move a
// category to another level at a precise position.
router.put('/reorder', async (req, res, next) => {
  const parentId = toNullableNumber(req.body?.parent_id) ?? null;
  const rawIds = Array.isArray(req.body?.ordered_ids) ? req.body.ordered_ids : null;
  if (!rawIds || rawIds.length === 0) return res.status(400).json({ message: 'ordered_ids requis' });
  const ids = rawIds.map(Number);
  if (ids.some((id) => !Number.isInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    return res.status(400).json({ message: 'ordered_ids invalides' });
  }
  if (parentId !== null && (!Number.isInteger(parentId) || parentId <= 0)) {
    return res.status(400).json({ message: 'parent_id invalide' });
  }

  const connection = await pool.getConnection();
  try {
    const [all] = await connection.query('SELECT id, parent_id FROM categories');
    const parentOf = new Map(all.map((c) => [Number(c.id), c.parent_id == null ? null : Number(c.parent_id)]));
    if (ids.some((id) => !parentOf.has(id))) return res.status(404).json({ message: 'Catégorie introuvable' });
    if (parentId !== null) {
      if (!parentOf.has(parentId)) return res.status(400).json({ message: 'Catégorie parente introuvable' });
      // The new parent must not be one of the moved categories nor one of their descendants.
      const moved = new Set(ids);
      const seen = new Set();
      for (let cur = parentId; cur != null && !seen.has(cur); cur = parentOf.get(cur)) {
        if (moved.has(cur)) return res.status(400).json({ message: 'Impossible: cela créerait une référence circulaire' });
        seen.add(cur);
      }
    }

    const updatedBy = req.user?.id ?? null;
    const now = new Date();
    await connection.beginTransaction();
    for (let i = 0; i < ids.length; i++) {
      await connection.query(
        'UPDATE categories SET parent_id = ?, sort_order = ?, updated_by = COALESCE(?, updated_by), updated_at = ? WHERE id = ?',
        [parentId, i, updatedBy, now, ids[i]]
      );
    }
    await connection.commit();

    const [rows] = await pool.query(`SELECT ${CATEGORY_SELECT} FROM categories ORDER BY ${CATEGORY_ORDER_SQL()}`);
    res.json(rows);
  } catch (err) {
    try { await connection.rollback(); } catch { /* ignore */ }
    next(err);
  } finally {
    connection.release();
  }
});

router.put('/:id', maybeUploadSingle('image'), async (req, res, next) => {
  try {
    if (req.file) await assertUploadedFileKind(req.file, ['jpeg', 'png', 'webp']);
    if (req.file?.path) await optimizeImageFile(req.file.path);
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
    if (parentId !== undefined) {
      fields.push('parent_id = ?'); values.push(parentId);
      if ((parentId ?? null) !== (currentCategory.parent_id ?? null)) fields.push('sort_order = NULL');
    }
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

    // Real products of the category as references; text-only only when it has no product photo.
    const references = await referenceProducts(id);
    const referenceFiles = [];
    for (const [index, product] of references.entries()) {
      try {
        referenceFiles.push(await referenceFile(product, index));
      } catch (error) {
        console.warn('[category image] reference skipped', product.image_url, error?.message || error);
      }
    }
    const fromProducts = referenceFiles.length > 0;
    const productNames = references.slice(0, referenceFiles.length).map((product) => String(product.designation || '').trim()).filter(Boolean);

    const productPrompt = [
      'Create one photorealistic square ecommerce category cover for a hardware, building materials and home-improvement shop in Morocco.',
      `Category: ${label}.`,
      details ? `Category context: ${details}.` : '',
      `The reference images are photos of real products sold in this category${productNames.length ? ` (${productNames.join('; ')})` : ''}.`,
      'Show these exact products together in one tasteful, balanced group: keep each product recognisable with its real shape, colors, materials and packaging as in its photo; do not invent other products.',
      'Clean professional studio lighting, soft natural shadows, light neutral background, centered composition with some breathing room around the group, realistic scale between the products.',
      'Do not add any words, captions, prices, watermarks, people or UI; only text already printed on the products themselves may remain.',
    ].filter(Boolean).join(' ');

    const prompt = [
      'Create one photorealistic square ecommerce category thumbnail for a hardware and home-improvement shop in Morocco.',
      `Category: ${label}.`,
      details ? `Category context: ${details}.` : '',
      'Show a clear, tasteful arrangement of representative real products or materials for this category.',
      'Clean studio lighting, neutral light background, centered composition, realistic colors.',
      'No words, labels, logos, watermarks, people, or UI. Avoid depicting unrelated products.'
    ].filter(Boolean).join(' ');

    const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 180000 });
    const result = fromProducts
      ? await client.images.edit({
        model: IMAGE_MODEL,
        image: referenceFiles,
        prompt: productPrompt,
        size: '1024x1024',
        quality: IMAGE_QUALITY,
        n: 1,
      })
      : await client.images.generate({
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
    await optimizeImageFile(savedPath);
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
    // Which real products were used (shown by the back office; empty when generated from text only).
    res.json({ ...updated[0], ai_image_source_products: references.slice(0, referenceFiles.length).map((product) => ({ id: product.id, designation: product.designation })) });
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

// Category image composed from our real products and brand logos (no AI, free).
const composingCategories = new Set();
router.post('/:id/compose-image', requireRoles('PDG', 'Manager', 'ManagerPlus'), async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'ID invalide' });
  if (composingCategories.has(id)) return res.status(409).json({ message: 'Image déjà en cours de création pour cette catégorie' });
  composingCategories.add(id);
  try {
    const result = await applyCategoryCover(id, req.user?.id ?? null);
    if (!result) return res.status(404).json({ message: 'Catégorie introuvable' });
    if (result.skipped) return res.status(422).json({ message: 'Aucun produit avec photo dans cette catégorie : image inchangée', code: 'NO_PRODUCT_PHOTO' });
    const [rows] = await pool.query(`SELECT ${CATEGORY_SELECT} FROM categories WHERE id = ?`, [id]);
    res.json({ ...rows[0], cover_products: result.products, cover_brands: result.brands, previous_image_url: result.previous_image_url });
  } catch (err) {
    next(err);
  } finally {
    composingCategories.delete(id);
  }
});

// Check if category is used by products
router.get('/:id/usage', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    await ensureProductCategoriesSchema(pool);
    const [products] = await pool.query('SELECT COUNT(*) as count FROM products p WHERE p.categorie_id = ? OR EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id = ?)', [id, id]);
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
    await ensureProductCategoriesSchema(pool);
    const [products] = await pool.query('SELECT COUNT(*) as count FROM products p WHERE p.categorie_id = ? OR EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id = ?)', [id, id]);
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
