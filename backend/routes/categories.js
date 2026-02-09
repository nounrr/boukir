import { Router } from 'express';
import pool from '../db/pool.js';
import OpenAI from 'openai';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ensureCategoryColumns } from '../utils/ensureCategorySchema.js';

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

const upload = multer({ storage });

function normalizeModelName(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const normalized = s.toLowerCase().replace(/\s+/g, '-');
  if (
    normalized === 'chatgpt-5-nano' ||
    normalized === 'chatgpt5-nano' ||
    normalized === 'chatgpt-5nano' ||
    normalized === 'chatgpt5nano' ||
    normalized === 'chat-gpt-5-nano' ||
    normalized === 'chat-gpt5-nano'
  ) {
    return 'gpt-5-nano';
  }
  if (normalized === 'gpt5-nano' || normalized === 'gpt-5nano') return 'gpt-5-nano';
  return s;
}

const AI_TR_MODEL = normalizeModelName(process.env.AI_TR_MODEL) || 'gpt-5-nano';

function sanitizeTemperature(model, temperature) {
  if (typeof temperature !== 'number' || !Number.isFinite(temperature)) return undefined;
  const m = String(model || '').toLowerCase();
  if (m.startsWith('gpt-5')) return undefined;
  if (m.startsWith('o1') || m.startsWith('o3')) return undefined;
  return temperature;
}

let cachedAiClient = null;
let cachedAiKey = null;

function getAiClient() {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) return null;
  if (!cachedAiClient || cachedAiKey !== key) {
    cachedAiKey = key;
    cachedAiClient = new OpenAI({ apiKey: key, maxRetries: 2 });
  }
  return cachedAiClient;
}

function safeJsonParse(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* ignore */ }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* ignore */ }
  }
  return null;
}

async function translateCategoryNameIfNeeded({ nom, nom_ar, nom_en, nom_zh, forceAll = false }) {
  const client = getAiClient();
  if (!client) return { nom_ar, nom_en, nom_zh, translated: false };

  const base = String(nom || '').trim();
  if (!base) return { nom_ar, nom_en, nom_zh, translated: false };

  const needsAr = forceAll ? true : !String(nom_ar || '').trim();
  const needsEn = forceAll ? true : !String(nom_en || '').trim();
  const needsZh = forceAll ? true : !String(nom_zh || '').trim();
  if (!needsAr && !needsEn && !needsZh) {
    return { nom_ar, nom_en, nom_zh, translated: false };
  }

  const system = {
    role: 'system',
    content: [
      'You translate e-commerce category names.',
      'Return JSON only with keys: nom_ar, nom_en, nom_zh.',
      'Keep translations short and natural.',
      'No extra words, no marketing text.',
    ].join(' '),
  };

  const user = {
    role: 'user',
    content: JSON.stringify({ nom: base, targets: { ar: needsAr, en: needsEn, zh: needsZh } }),
  };

  const temp = sanitizeTemperature(AI_TR_MODEL, 0.2);
  const reqPayload = {
    model: AI_TR_MODEL,
    messages: [system, user],
    ...(temp === undefined ? {} : { temperature: temp }),
  };

  const resp = await client.chat.completions.create(reqPayload);

  const txt = resp.choices?.[0]?.message?.content || '';
  const parsed = safeJsonParse(txt) || {};

  return {
    nom_ar: needsAr ? normalizeNullableText(parsed?.nom_ar) : nom_ar,
    nom_en: needsEn ? normalizeNullableText(parsed?.nom_en) : nom_en,
    nom_zh: needsZh ? normalizeNullableText(parsed?.nom_zh) : nom_zh,
    translated: true,
  };
}

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
    const [rows] = await pool.query('SELECT id, nom, nom_ar, nom_en, nom_zh, description, image_url, parent_id, created_by, updated_by, created_at, updated_at FROM categories ORDER BY id DESC');
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const [rows] = await pool.query('SELECT id, nom, nom_ar, nom_en, nom_zh, description, image_url, parent_id, created_by, updated_by, created_at, updated_at FROM categories WHERE id = ?', [id]);
    const cat = rows[0];
    if (!cat) return res.status(404).json({ message: 'Catégorie introuvable' });
    res.json(cat);
  } catch (err) { next(err); }
});

router.post('/', maybeUploadSingle('image'), async (req, res, next) => {
  try {
    const { nom, nom_ar, nom_en, nom_zh, description, parent_id, created_by, image_url: image_url_body } = req.body;
    if (!nom || !nom.trim()) return res.status(400).json({ message: 'Nom requis' });

    const image_url_from_upload = req.file ? `/uploads/categories/${req.file.filename}` : null;
    const image_url_from_body = normalizeNullableText(image_url_body);
    const image_url = image_url_from_upload || image_url_from_body || null;

    const parentId = toNullableNumber(parent_id);
    const createdBy = toNullableNumber(created_by);

    const tr = await translateCategoryNameIfNeeded({
      nom,
      nom_ar: normalizeNullableText(nom_ar) ?? null,
      nom_en: normalizeNullableText(nom_en) ?? null,
      nom_zh: normalizeNullableText(nom_zh) ?? null,
      forceAll: false,
    });
    
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
        tr.nom_ar ?? null,
        tr.nom_en ?? null,
        tr.nom_zh ?? null,
        normalizeNullableText(description) ?? null,
        image_url,
        parentId ?? null,
        createdBy ?? null,
        now,
        now,
      ]
    );
    const id = result.insertId;
    const [rows] = await pool.query('SELECT id, nom, nom_ar, nom_en, nom_zh, description, image_url, parent_id, created_by, updated_by, created_at, updated_at FROM categories WHERE id = ?', [id]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', maybeUploadSingle('image'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'ID invalide' });
    const { nom, nom_ar, nom_en, nom_zh, description, parent_id, updated_by, image_url: image_url_body } = req.body;
    const [exists] = await pool.query('SELECT id, parent_id FROM categories WHERE id = ?', [id]);
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
    
    // Load current values so we can auto-translate when nom changes
    const [curRows] = await pool.query('SELECT nom, nom_ar, nom_en, nom_zh FROM categories WHERE id = ?', [id]);
    const cur = curRows?.[0] || {};

    const nextNom = nom !== undefined ? normalizeNullableText(nom) : normalizeNullableText(cur.nom);
    const providedAr = nom_ar !== undefined;
    const providedEn = nom_en !== undefined;
    const providedZh = nom_zh !== undefined;

    let nextAr = providedAr ? (normalizeNullableText(nom_ar) ?? null) : (normalizeNullableText(cur.nom_ar) ?? null);
    let nextEn = providedEn ? (normalizeNullableText(nom_en) ?? null) : (normalizeNullableText(cur.nom_en) ?? null);
    let nextZh = providedZh ? (normalizeNullableText(nom_zh) ?? null) : (normalizeNullableText(cur.nom_zh) ?? null);

    const nomChanged = nextNom !== null && String(nextNom) !== String(normalizeNullableText(cur.nom) ?? '');

    // If user changed nom and did not explicitly provide translations, regenerate all 3.
    // Otherwise, only fill missing ones.
    const forceAll = Boolean(nomChanged && !providedAr && !providedEn && !providedZh);
    const tr = await translateCategoryNameIfNeeded({
      nom: nextNom,
      nom_ar: nextAr,
      nom_en: nextEn,
      nom_zh: nextZh,
      forceAll,
    });
    nextAr = tr.nom_ar;
    nextEn = tr.nom_en;
    nextZh = tr.nom_zh;

    const now = new Date();
    const fields = [];
    const values = [];
    if (nom !== undefined) { fields.push('nom = ?'); values.push(nextNom); }
    if (nom_ar !== undefined || (tr.translated && (forceAll || !String(cur.nom_ar || '').trim()))) { fields.push('nom_ar = ?'); values.push(nextAr); }
    if (nom_en !== undefined || (tr.translated && (forceAll || !String(cur.nom_en || '').trim()))) { fields.push('nom_en = ?'); values.push(nextEn); }
    if (nom_zh !== undefined || (tr.translated && (forceAll || !String(cur.nom_zh || '').trim()))) { fields.push('nom_zh = ?'); values.push(nextZh); }
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
    fields.push('updated_at = ?'); values.push(now);
    const sql = `UPDATE categories SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);
    await pool.query(sql, values);
    const [rows] = await pool.query('SELECT id, nom, nom_ar, nom_en, nom_zh, description, image_url, parent_id, created_by, updated_by, created_at, updated_at FROM categories WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
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
