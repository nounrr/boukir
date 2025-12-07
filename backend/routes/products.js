import { Router } from 'express';
import pool from '../db/pool.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configure Multer for product images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log('Multer destination called for file:', file.originalname);
    // Save to backend/uploads/products
    const dir = path.join(__dirname, '..', 'uploads', 'products');
    console.log('Target directory:', dir);
    if (!fs.existsSync(dir)) {
      console.log('Creating directory...');
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Ensure soft-delete and image_url columns exist
let ensuredProductsColumns = false;
async function ensureProductsColumns() {
  if (ensuredProductsColumns) return;
  
  // Check is_deleted
  const [colsDeleted] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'is_deleted'`
  );
  if (!colsDeleted.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0 AFTER est_service`);
  }

  // Check image_url
  const [colsImage] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'image_url'`
  );
  if (!colsImage.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN image_url VARCHAR(255) DEFAULT NULL`);
  }

  // Check ecom_published
  const [colsEcomPublished] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'ecom_published'`
  );
  if (!colsEcomPublished.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN ecom_published TINYINT(1) NOT NULL DEFAULT 0`);
  }

  // Check stock_partage_ecom
  const [colsStockPartage] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'stock_partage_ecom'`
  );
  if (!colsStockPartage.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN stock_partage_ecom TINYINT(1) NOT NULL DEFAULT 0`);
  }

  // Check stock_partage_ecom_qty
  const [colsStockPartageQty] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'stock_partage_ecom_qty'`
  );
  if (!colsStockPartageQty.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN stock_partage_ecom_qty INT NOT NULL DEFAULT 0`);
  }

  ensuredProductsColumns = true;
}
ensureProductsColumns().catch((e) => console.error('ensureProductsColumns:', e));

router.get('/', async (_req, res, next) => {
  try {
    await ensureProductsColumns();
    const [rows] = await pool.query(`
      SELECT p.*, c.id as c_id, c.nom as c_nom, c.description as c_description
      FROM products p
      LEFT JOIN categories c ON p.categorie_id = c.id
      WHERE COALESCE(p.is_deleted, 0) = 0
      ORDER BY p.id DESC
    `);
    const data = rows.map((r) => ({
      id: r.id,
  // reference is now derived from id for compatibility with frontend displays
  reference: String(r.id),
      designation: r.designation,
      categorie_id: r.categorie_id,
      categorie: r.c_id ? { id: r.c_id, nom: r.c_nom, description: r.c_description } : undefined,
      quantite: Number(r.quantite),
    kg: r.kg !== null && r.kg !== undefined ? Number(r.kg) : null,
      prix_achat: Number(r.prix_achat),
      cout_revient_pourcentage: Number(r.cout_revient_pourcentage),
      cout_revient: Number(r.cout_revient),
      prix_gros_pourcentage: Number(r.prix_gros_pourcentage),
      prix_gros: Number(r.prix_gros),
      prix_vente_pourcentage: Number(r.prix_vente_pourcentage),
      prix_vente: Number(r.prix_vente),
      est_service: !!r.est_service,
      image_url: r.image_url,
      ecom_published: !!r.ecom_published,
      stock_partage_ecom: !!r.stock_partage_ecom,
      stock_partage_ecom_qty: Number(r.stock_partage_ecom_qty ?? 0),
      created_by: r.created_by,
      updated_by: r.updated_by,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
    res.json(data);
  } catch (err) { next(err); }
});

// List soft-deleted products
router.get('/archived/list', async (_req, res, next) => {
  try {
    await ensureProductsColumns();
    const [rows] = await pool.query(
      `SELECT p.*, c.id as c_id, c.nom as c_nom
       FROM products p
       LEFT JOIN categories c ON p.categorie_id = c.id
       WHERE COALESCE(p.is_deleted, 0) = 1
       ORDER BY p.updated_at DESC`
    );
    res.json(rows.map((r) => ({
      id: r.id,
      reference: String(r.id),
      designation: r.designation,
      categorie_id: r.categorie_id,
      categorie: r.c_id ? { id: r.c_id, nom: r.c_nom } : undefined,
      updated_at: r.updated_at,
    })));
  } catch (err) { next(err); }
});

// Restore a soft-deleted product
router.post('/:id/restore', async (req, res, next) => {
  try {
    await ensureProductsColumns();
    const id = Number(req.params.id);
    const now = new Date();
    const [exists] = await pool.query('SELECT id FROM products WHERE id = ? AND COALESCE(is_deleted,0) = 1', [id]);
    if (!exists.length) return res.status(404).json({ message: 'Produit archivé introuvable' });
    await pool.query('UPDATE products SET is_deleted = 0, updated_at = ? WHERE id = ?', [now, id]);
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    const r = rows[0];
    res.json({ ...r, reference: String(r.id) });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    await ensureProductsColumns();
    const id = Number(req.params.id);
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    const r = rows[0];
    if (!r) return res.status(404).json({ message: 'Produit introuvable' });
    res.json({
      id: r.id,
      reference: String(r.id),
      designation: r.designation,
      categorie_id: r.categorie_id,
      quantite: Number(r.quantite),
      kg: r.kg !== null && r.kg !== undefined ? Number(r.kg) : null,
      prix_achat: Number(r.prix_achat),
      cout_revient_pourcentage: Number(r.cout_revient_pourcentage),
      cout_revient: Number(r.cout_revient),
      prix_gros_pourcentage: Number(r.prix_gros_pourcentage),
      prix_gros: Number(r.prix_gros),
      prix_vente_pourcentage: Number(r.prix_vente_pourcentage),
      prix_vente: Number(r.prix_vente),
      est_service: !!r.est_service,
      ecom_published: !!r.ecom_published,
      stock_partage_ecom: !!r.stock_partage_ecom,
      created_by: r.created_by,
      updated_by: r.updated_by,
      created_at: r.created_at,
      updated_at: r.updated_at,
    });
  } catch (err) { next(err); }
});

router.post('/', (req, res, next) => {
  console.log('POST /products hit');
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Raw flags (POST):', {
    est_service: req.body?.est_service,
    ecom_published: req.body?.ecom_published,
    stock_partage_ecom: req.body?.stock_partage_ecom,
    stock_partage_ecom_qty: req.body?.stock_partage_ecom_qty,
  });
  next();
}, upload.single('image'), async (req, res, next) => {
  try {
    console.log('Inside POST /products handler');
    console.log('req.file:', req.file);
    console.log('req.body:', req.body);
  await ensureProductsColumns();
    const {
      designation,
      categorie_id,
      quantite,
      kg,
      prix_achat,
      cout_revient_pourcentage,
      prix_gros_pourcentage,
      prix_vente_pourcentage,
      est_service,
      ecom_published,
      stock_partage_ecom,
      created_by,
    } = req.body;

    const image_url = req.file ? `/uploads/products/${req.file.filename}` : null;
    console.log('image_url:', image_url);

    // Ensure we have a category: use provided one, else first category or create a default
    let catId = Number(categorie_id);
    if (!catId) {
      const [catRows] = await pool.query('SELECT id FROM categories ORDER BY id ASC LIMIT 1');
      if (catRows.length > 0) {
        catId = catRows[0].id;
      } else {
        const nowCat = new Date();
        const [insCat] = await pool.query(
          'INSERT INTO categories (nom, description, created_at, updated_at) VALUES (?, ?, ?, ?)',
          ['Divers', 'Catégorie par défaut', nowCat, nowCat]
        );
        catId = insCat.insertId;
      }
    }

    const pa = Number(prix_achat ?? 0);
    const crp = Number(cout_revient_pourcentage ?? 0);
    const pgp = Number(prix_gros_pourcentage ?? 0);
    const pvp = Number(prix_vente_pourcentage ?? 0);
    
    const isService = est_service === 'true' || est_service === true || est_service === '1' || est_service === 1;
    const isEcomPublished = ecom_published === 'true' || ecom_published === true || ecom_published === '1' || ecom_published === 1;
    const isStockPartage = stock_partage_ecom === 'true' || stock_partage_ecom === true || stock_partage_ecom === '1' || stock_partage_ecom === 1;

    const totalQuantite = Number(isService ? 0 : (quantite ?? 0));
    const shareQty = Number(req.body?.stock_partage_ecom_qty ?? 0);
    if (shareQty > totalQuantite) {
      return res.status(400).json({ message: 'La quantité partagée ne peut pas dépasser la quantité totale' });
    }

  // Align with frontend display: prix = prix_achat * (1 + pourcentage/100)
  const cr = pa * (1 + crp / 100);
  const pg = pa * (1 + pgp / 100);
  const pv = pa * (1 + pvp / 100);

    const now = new Date();
    const [result] = await pool.query(
  `INSERT INTO products
     (designation, categorie_id, quantite, kg, prix_achat, cout_revient_pourcentage, cout_revient, prix_gros_pourcentage, prix_gros, prix_vente_pourcentage, prix_vente, est_service, image_url, ecom_published, stock_partage_ecom, stock_partage_ecom_qty, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        (designation && String(designation).trim()) || 'Sans désignation',
        catId,
        totalQuantite,
        kg !== undefined && kg !== null ? Number(kg) : null,
        pa,
        crp,
        cr,
        pgp,
        pg,
        pvp,
        pv,
        isService ? 1 : 0,
        image_url,
        isEcomPublished ? 1 : 0,
        isStockPartage ? 1 : 0,
          Number(req.body?.stock_partage_ecom_qty ?? 0),
        created_by ?? null,
        now,
        now,
      ]
    );
    const id = result.insertId;
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    const r = rows[0];
    res.status(201).json({ ...r, reference: String(r.id) });
  } catch (err) { 
    console.error('Error in POST /products:', err);
    next(err); 
  }
});

router.put('/:id', upload.single('image'), async (req, res, next) => {
  try {
  await ensureProductsColumns();
    const id = Number(req.params.id);
    const [exists] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    if (exists.length === 0) return res.status(404).json({ message: 'Produit introuvable' });

    console.log('PUT /products/:id flags:', {
      est_service: req.body?.est_service,
      ecom_published: req.body?.ecom_published,
      stock_partage_ecom: req.body?.stock_partage_ecom,
      stock_partage_ecom_qty: req.body?.stock_partage_ecom_qty,
    });

    const fields = [];
    const values = [];
    const now = new Date();

    const {
      designation,
      categorie_id,
      quantite,
  kg,
      prix_achat,
      cout_revient_pourcentage,
      prix_gros_pourcentage,
      prix_vente_pourcentage,
      est_service,
      ecom_published,
      stock_partage_ecom,
      stock_partage_ecom_qty,
      updated_by,
    } = req.body;
    // Validate shared qty does not exceed total quantity after changes
    const existing = exists[0];
    let targetQuantite = quantite !== undefined ? Number(quantite) : Number(existing.quantite);
    const isServiceUpdate = (
      est_service !== undefined && (
        est_service === true ||
        est_service === 'true' ||
        est_service === 1 ||
        est_service === '1'
      )
    );
    if (isServiceUpdate) {
      targetQuantite = 0;
    }
    if (stock_partage_ecom_qty !== undefined) {
      const v = Number(stock_partage_ecom_qty) || 0;
      if (v > targetQuantite) {
        return res.status(400).json({ message: 'La quantité partagée ne peut pas dépasser la quantité totale' });
      }
    }

    const image_url = req.file ? `/uploads/products/${req.file.filename}` : null;

    if (designation !== undefined) { fields.push('designation = ?'); values.push(designation ? designation.trim() : null); }
    if (categorie_id !== undefined) { fields.push('categorie_id = ?'); values.push(categorie_id); }
    if (quantite !== undefined) { fields.push('quantite = ?'); values.push(Number(quantite)); }
  if (kg !== undefined) { fields.push('kg = ?'); values.push(kg === null ? null : Number(kg)); }
    if (prix_achat !== undefined) { fields.push('prix_achat = ?'); values.push(Number(prix_achat)); }
    if (cout_revient_pourcentage !== undefined) { fields.push('cout_revient_pourcentage = ?'); values.push(Number(cout_revient_pourcentage)); }
    if (prix_gros_pourcentage !== undefined) { fields.push('prix_gros_pourcentage = ?'); values.push(Number(prix_gros_pourcentage)); }
    if (prix_vente_pourcentage !== undefined) { fields.push('prix_vente_pourcentage = ?'); values.push(Number(prix_vente_pourcentage)); }
    if (image_url) { fields.push('image_url = ?'); values.push(image_url); }
    if (ecom_published !== undefined) { fields.push('ecom_published = ?'); values.push(ecom_published === 'true' || ecom_published === true || ecom_published === '1' ? 1 : 0); }
    if (stock_partage_ecom !== undefined) { fields.push('stock_partage_ecom = ?'); values.push(stock_partage_ecom === 'true' || stock_partage_ecom === true || stock_partage_ecom === '1' ? 1 : 0); }
    if (stock_partage_ecom_qty !== undefined) { fields.push('stock_partage_ecom_qty = ?'); values.push(Number(stock_partage_ecom_qty) || 0); }

    // Recalculate derived prices if inputs provided
    if (prix_achat !== undefined || cout_revient_pourcentage !== undefined) {
      const pa = Number(prix_achat ?? exists[0].prix_achat);
      const crp = Number(cout_revient_pourcentage ?? exists[0].cout_revient_pourcentage);
      fields.push('cout_revient = ?'); values.push(pa * (1 + crp / 100));
    }
    if (prix_achat !== undefined || prix_gros_pourcentage !== undefined) {
      const pa = Number(prix_achat ?? exists[0].prix_achat);
      const pgp = Number(prix_gros_pourcentage ?? exists[0].prix_gros_pourcentage);
      fields.push('prix_gros = ?'); values.push(pa * (1 + pgp / 100));
    }
    if (prix_achat !== undefined || prix_vente_pourcentage !== undefined) {
      const pa = Number(prix_achat ?? exists[0].prix_achat);
      const pvp = Number(prix_vente_pourcentage ?? exists[0].prix_vente_pourcentage);
      fields.push('prix_vente = ?'); values.push(pa * (1 + pvp / 100));
    }

    if (est_service !== undefined) { 
      const isService = (
        est_service === true ||
        est_service === 'true' ||
        est_service === 1 ||
        est_service === '1'
      );
      fields.push('est_service = ?'); 
      values.push(isService ? 1 : 0); 
    }
    if (updated_by !== undefined) { fields.push('updated_by = ?'); values.push(updated_by); }

    fields.push('updated_at = ?'); values.push(now);
    const sql = `UPDATE products SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);
    await pool.query(sql, values);

  const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
  const r = rows[0];
  res.json({ ...r, reference: String(r.id) });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
  await ensureProductsColumns();
  const id = Number(req.params.id);
  const now = new Date();
  await pool.query('UPDATE products SET is_deleted = 1, updated_at = ? WHERE id = ?', [now, id]);
  res.status(204).send();
  } catch (err) { next(err); }
});

// Specific stock update endpoint
router.patch('/:id/stock', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { quantite, updated_by } = req.body;
    const [exists] = await pool.query('SELECT id FROM products WHERE id = ?', [id]);
    if (exists.length === 0) return res.status(404).json({ message: 'Produit introuvable' });
    const now = new Date();
    await pool.query('UPDATE products SET quantite = ?, updated_by = ?, updated_at = ? WHERE id = ?', [Number(quantite), updated_by ?? null, now, id]);
  const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
  const r = rows[0];
  res.json({ ...r, reference: String(r.id) });
  } catch (err) { next(err); }
});

export default router;
