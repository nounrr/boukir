import { Router } from 'express';
import pool from '../db/pool.js';
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
        normalizeNullableText(nom_ar) ?? null,
        normalizeNullableText(nom_en) ?? null,
        normalizeNullableText(nom_zh) ?? null,
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
    
    const now = new Date();
    const fields = [];
    const values = [];
    if (nom !== undefined) { fields.push('nom = ?'); values.push(normalizeNullableText(nom)); }
    if (nom_ar !== undefined) { fields.push('nom_ar = ?'); values.push(normalizeNullableText(nom_ar)); }
    if (nom_en !== undefined) { fields.push('nom_en = ?'); values.push(normalizeNullableText(nom_en)); }
    if (nom_zh !== undefined) { fields.push('nom_zh = ?'); values.push(normalizeNullableText(nom_zh)); }
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
