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

  // Check fiche_technique
  const [colsFiche] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'fiche_technique'`
  );
  if (!colsFiche.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN fiche_technique TEXT DEFAULT NULL`);
  }

  // Check fiche_technique multilingual columns
  const [colsFicheAr] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'fiche_technique_ar'`
  );
  if (!colsFicheAr.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN fiche_technique_ar TEXT DEFAULT NULL`);
  }
  const [colsFicheEn] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'fiche_technique_en'`
  );
  if (!colsFicheEn.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN fiche_technique_en TEXT DEFAULT NULL`);
  }
  const [colsFicheZh] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'fiche_technique_zh'`
  );
  if (!colsFicheZh.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN fiche_technique_zh TEXT DEFAULT NULL`);
  }

  // Check description
  const [colsDesc] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'description'`
  );
  if (!colsDesc.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN description TEXT DEFAULT NULL`);
  }

  // Check pourcentage_promo
  const [colsPromo] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'pourcentage_promo'`
  );
  if (!colsPromo.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN pourcentage_promo DECIMAL(5,2) DEFAULT 0`);
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

  // Check has_variants
  const [colsHasVariants] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'has_variants'`
  );
  if (!colsHasVariants.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN has_variants TINYINT(1) DEFAULT 0`);
  }

  // Check base_unit
  const [colsBaseUnit] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'base_unit'`
  );
  if (!colsBaseUnit.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN base_unit VARCHAR(50) DEFAULT 'u'`);
  }

  // Check variant_type in product_variants
  const [colsVariantType] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants' AND COLUMN_NAME = 'variant_type'`
  );
  if (!colsVariantType.length) {
    await pool.query(`ALTER TABLE product_variants ADD COLUMN variant_type VARCHAR(50) DEFAULT 'Autre'`);
  }

  ensuredProductsColumns = true;
}
ensureProductsColumns().catch((e) => console.error('ensureProductsColumns:', e));

router.get('/', async (_req, res, next) => {
  try {
    await ensureProductsColumns();
    const [rows] = await pool.query(`
      SELECT p.*, c.id as c_id, c.nom as c_nom, c.description as c_description,
      (SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'id', pv.id, 
        'variant_name', pv.variant_name, 
        'variant_type', pv.variant_type, 
        'reference', pv.reference, 
        'prix_achat', pv.prix_achat, 
        'cout_revient', pv.cout_revient,
        'cout_revient_pourcentage', pv.cout_revient_pourcentage,
        'prix_gros', pv.prix_gros,
        'prix_gros_pourcentage', pv.prix_gros_pourcentage,
        'prix_vente_pourcentage', pv.prix_vente_pourcentage,
        'prix_vente', pv.prix_vente, 
        'stock_quantity', pv.stock_quantity
      )) FROM product_variants pv WHERE pv.product_id = p.id) as variants,
      (SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'id', pu.id, 
        'unit_name', pu.unit_name, 
        'conversion_factor', pu.conversion_factor, 
        'prix_vente', pu.prix_vente, 
        'is_default', pu.is_default
      )) FROM product_units pu WHERE pu.product_id = p.id) as units
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
      fiche_technique: r.fiche_technique,
      fiche_technique_ar: r.fiche_technique_ar,
      fiche_technique_en: r.fiche_technique_en,
      fiche_technique_zh: r.fiche_technique_zh,
      description: r.description,
      pourcentage_promo: Number(r.pourcentage_promo ?? 0),
      ecom_published: !!r.ecom_published,
      stock_partage_ecom: !!r.stock_partage_ecom,
      stock_partage_ecom_qty: Number(r.stock_partage_ecom_qty ?? 0),
      created_by: r.created_by,
      updated_by: r.updated_by,
      created_at: r.created_at,
      updated_at: r.updated_at,
      has_variants: !!r.has_variants,
      base_unit: r.base_unit,
      variants: typeof r.variants === 'string' ? JSON.parse(r.variants) : (r.variants || []),
      units: typeof r.units === 'string' ? JSON.parse(r.units) : (r.units || []),
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

    // Fetch variants and units
    const [variants] = await pool.query('SELECT * FROM product_variants WHERE product_id = ?', [id]);
    const [units] = await pool.query('SELECT * FROM product_units WHERE product_id = ?', [id]);

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
      image_url: r.image_url,
      fiche_technique: r.fiche_technique,
      fiche_technique_ar: r.fiche_technique_ar,
      fiche_technique_en: r.fiche_technique_en,
      fiche_technique_zh: r.fiche_technique_zh,
      description: r.description,
      pourcentage_promo: Number(r.pourcentage_promo ?? 0),
      ecom_published: !!r.ecom_published,
      stock_partage_ecom: !!r.stock_partage_ecom,
      created_by: r.created_by,
      updated_by: r.updated_by,
      created_at: r.created_at,
      updated_at: r.updated_at,
      has_variants: !!r.has_variants,
      base_unit: r.base_unit,
      variants: variants.map(v => ({
        ...v,
        prix_achat: Number(v.prix_achat),
        cout_revient: Number(v.cout_revient),
        cout_revient_pourcentage: Number(v.cout_revient_pourcentage),
        prix_gros: Number(v.prix_gros),
        prix_gros_pourcentage: Number(v.prix_gros_pourcentage),
        prix_vente_pourcentage: Number(v.prix_vente_pourcentage),
        prix_vente: Number(v.prix_vente),
        stock_quantity: Number(v.stock_quantity)
      })),
      units: units.map(u => ({
        ...u,
        conversion_factor: Number(u.conversion_factor),
        prix_vente: u.prix_vente ? Number(u.prix_vente) : null,
        is_default: !!u.is_default
      }))
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
}, upload.fields([
  { name: 'image', maxCount: 1 }
]), async (req, res, next) => {
  try {
    console.log('Inside POST /products handler');
    console.log('req.files:', req.files);
    console.log('req.body:', req.body);
  await ensureProductsColumns();
    const {
      designation,
      designation_ar,
      designation_en,
      designation_zh,
      categorie_id,
      quantite,
      kg,
      prix_achat,
      cout_revient_pourcentage,
      prix_gros_pourcentage,
      prix_vente_pourcentage,
      est_service,
      description,
      description_ar,
      description_en,
      description_zh,
      pourcentage_promo,
      ecom_published,
      stock_partage_ecom,
      created_by,
      has_variants,
      base_unit,
      variants, // JSON string or array
      units, // JSON string or array
    } = req.body;

    const image_url = req.files?.['image']?.[0] ? `/uploads/products/${req.files['image'][0].filename}` : null;
    const fiche_technique = req.body?.fiche_technique ?? null;
    const fiche_technique_ar = req.body?.fiche_technique_ar ?? null;
    const fiche_technique_en = req.body?.fiche_technique_en ?? null;
    const fiche_technique_zh = req.body?.fiche_technique_zh ?? null;
    
    console.log('image_url:', image_url);
    console.log('fiche_technique:', fiche_technique);

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
    const isHasVariants = has_variants === 'true' || has_variants === true || has_variants === '1' || has_variants === 1;

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
     (designation, designation_ar, designation_en, designation_zh, categorie_id, quantite, kg, prix_achat, cout_revient_pourcentage, cout_revient, prix_gros_pourcentage, prix_gros, prix_vente_pourcentage, prix_vente, est_service, image_url, fiche_technique, fiche_technique_ar, fiche_technique_en, fiche_technique_zh, description, description_ar, description_en, description_zh, pourcentage_promo, ecom_published, stock_partage_ecom, stock_partage_ecom_qty, has_variants, base_unit, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        (designation && String(designation).trim()) || 'Sans désignation',
        designation_ar || null,
        designation_en || null,
        designation_zh || null,
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
        fiche_technique,
        fiche_technique_ar,
        fiche_technique_en,
        fiche_technique_zh,
        description || null,
        description_ar || null,
        description_en || null,
        description_zh || null,
        Number(pourcentage_promo || 0),
        isEcomPublished ? 1 : 0,
        isStockPartage ? 1 : 0,
          Number(req.body?.stock_partage_ecom_qty ?? 0),
        isHasVariants ? 1 : 0,
        base_unit || 'u',
        created_by ?? null,
        now,
        now,
      ]
    );
    const id = result.insertId;

    // Handle Variants
    if (variants) {
      let parsedVariants = [];
      try {
        parsedVariants = typeof variants === 'string' ? JSON.parse(variants) : variants;
      } catch (e) {
        console.error('Error parsing variants:', e);
      }
      if (Array.isArray(parsedVariants)) {
        for (const v of parsedVariants) {
          await pool.query(
            `INSERT INTO product_variants (product_id, variant_name, variant_type, reference, prix_achat, cout_revient, cout_revient_pourcentage, prix_gros, prix_gros_pourcentage, prix_vente_pourcentage, prix_vente, stock_quantity, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id, 
              v.variant_name, 
              v.variant_type || 'Autre', 
              v.reference, 
              v.prix_achat, 
              v.cout_revient || 0,
              v.cout_revient_pourcentage || 0,
              v.prix_gros || 0,
              v.prix_gros_pourcentage || 0,
              v.prix_vente_pourcentage || 0,
              v.prix_vente, 
              v.stock_quantity, 
              now, 
              now
            ]
          );
        }
      }
    }

    // Handle Units
    if (units) {
      let parsedUnits = [];
      try {
        parsedUnits = typeof units === 'string' ? JSON.parse(units) : units;
      } catch (e) {
        console.error('Error parsing units:', e);
      }
      if (Array.isArray(parsedUnits)) {
        for (const u of parsedUnits) {
          await pool.query(
            `INSERT INTO product_units (product_id, unit_name, conversion_factor, prix_vente, is_default, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, u.unit_name, u.conversion_factor, u.prix_vente, u.is_default ? 1 : 0, now, now]
          );
        }
      }
    }

    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    const r = rows[0];
    res.status(201).json({ ...r, reference: String(r.id) });
  } catch (err) { 
    console.error('Error in POST /products:', err);
    next(err); 
  }
});

router.put('/:id', upload.fields([
  { name: 'image', maxCount: 1 }
]), async (req, res, next) => {
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
      designation_ar,
      designation_en,
      designation_zh,
      categorie_id,
      quantite,
  kg,
      prix_achat,
      cout_revient_pourcentage,
      prix_gros_pourcentage,
      prix_vente_pourcentage,
      est_service,
      description,
      description_ar,
      description_en,
      description_zh,
      pourcentage_promo,
      ecom_published,
      stock_partage_ecom,
      stock_partage_ecom_qty,
      updated_by,
      has_variants,
      base_unit,
      variants,
      units,
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

    const image_url = req.files?.['image']?.[0] ? `/uploads/products/${req.files['image'][0].filename}` : null;
    const fiche_technique = req.body?.fiche_technique ?? null;

    if (designation !== undefined) { fields.push('designation = ?'); values.push(designation ? designation.trim() : null); }
    if (designation_ar !== undefined) { fields.push('designation_ar = ?'); values.push(designation_ar ? designation_ar.trim() : null); }
    if (designation_en !== undefined) { fields.push('designation_en = ?'); values.push(designation_en ? designation_en.trim() : null); }
    if (designation_zh !== undefined) { fields.push('designation_zh = ?'); values.push(designation_zh ? designation_zh.trim() : null); }

    if (categorie_id !== undefined) { fields.push('categorie_id = ?'); values.push(categorie_id); }
    if (quantite !== undefined) { fields.push('quantite = ?'); values.push(Number(quantite)); }
  if (kg !== undefined) { fields.push('kg = ?'); values.push(kg === null ? null : Number(kg)); }
    if (prix_achat !== undefined) { fields.push('prix_achat = ?'); values.push(Number(prix_achat)); }
    if (cout_revient_pourcentage !== undefined) { fields.push('cout_revient_pourcentage = ?'); values.push(Number(cout_revient_pourcentage)); }
    if (prix_gros_pourcentage !== undefined) { fields.push('prix_gros_pourcentage = ?'); values.push(Number(prix_gros_pourcentage)); }
    if (prix_vente_pourcentage !== undefined) { fields.push('prix_vente_pourcentage = ?'); values.push(Number(prix_vente_pourcentage)); }
    
    if (image_url) { fields.push('image_url = ?'); values.push(image_url); }
    if (fiche_technique !== null && fiche_technique !== undefined) { fields.push('fiche_technique = ?'); values.push(fiche_technique); }
    if (req.body?.fiche_technique_ar !== undefined) { fields.push('fiche_technique_ar = ?'); values.push(req.body.fiche_technique_ar); }
    if (req.body?.fiche_technique_en !== undefined) { fields.push('fiche_technique_en = ?'); values.push(req.body.fiche_technique_en); }
    if (req.body?.fiche_technique_zh !== undefined) { fields.push('fiche_technique_zh = ?'); values.push(req.body.fiche_technique_zh); }

    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (description_ar !== undefined) { fields.push('description_ar = ?'); values.push(description_ar); }
    if (description_en !== undefined) { fields.push('description_en = ?'); values.push(description_en); }
    if (description_zh !== undefined) { fields.push('description_zh = ?'); values.push(description_zh); }

    if (pourcentage_promo !== undefined) { fields.push('pourcentage_promo = ?'); values.push(Number(pourcentage_promo)); }
    if (ecom_published !== undefined) { fields.push('ecom_published = ?'); values.push(ecom_published === 'true' || ecom_published === true || ecom_published === '1' ? 1 : 0); }
    if (stock_partage_ecom !== undefined) { fields.push('stock_partage_ecom = ?'); values.push(stock_partage_ecom === 'true' || stock_partage_ecom === true || stock_partage_ecom === '1' ? 1 : 0); }
    if (stock_partage_ecom_qty !== undefined) { fields.push('stock_partage_ecom_qty = ?'); values.push(Number(stock_partage_ecom_qty) || 0); }
    if (has_variants !== undefined) { fields.push('has_variants = ?'); values.push(has_variants === 'true' || has_variants === true || has_variants === '1' ? 1 : 0); }
    if (base_unit !== undefined) { fields.push('base_unit = ?'); values.push(base_unit); }

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

    // Update Variants
    if (variants) {
      let parsedVariants = [];
      try {
        parsedVariants = typeof variants === 'string' ? JSON.parse(variants) : variants;
      } catch (e) {
        console.error('Error parsing variants:', e);
      }
      if (Array.isArray(parsedVariants)) {
        const incomingIds = parsedVariants.map(v => v.id).filter(id => id);
        if (incomingIds.length > 0) {
          await pool.query(`DELETE FROM product_variants WHERE product_id = ? AND id NOT IN (?)`, [id, incomingIds]);
        } else {
          await pool.query(`DELETE FROM product_variants WHERE product_id = ?`, [id]);
        }

        for (const v of parsedVariants) {
          if (v.id) {
            await pool.query(
              `UPDATE product_variants SET variant_name=?, variant_type=?, reference=?, prix_achat=?, cout_revient=?, cout_revient_pourcentage=?, prix_gros=?, prix_gros_pourcentage=?, prix_vente_pourcentage=?, prix_vente=?, stock_quantity=?, updated_at=? WHERE id=? AND product_id=?`,
              [
                v.variant_name, 
                v.variant_type || 'Autre', 
                v.reference, 
                v.prix_achat, 
                v.cout_revient || 0,
                v.cout_revient_pourcentage || 0,
                v.prix_gros || 0,
                v.prix_gros_pourcentage || 0,
                v.prix_vente_pourcentage || 0,
                v.prix_vente, 
                v.stock_quantity, 
                now, 
                v.id, 
                id
              ]
            );
          } else {
            await pool.query(
              `INSERT INTO product_variants (product_id, variant_name, variant_type, reference, prix_achat, cout_revient, cout_revient_pourcentage, prix_gros, prix_gros_pourcentage, prix_vente_pourcentage, prix_vente, stock_quantity, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                id, 
                v.variant_name, 
                v.variant_type || 'Autre', 
                v.reference, 
                v.prix_achat, 
                v.cout_revient || 0,
                v.cout_revient_pourcentage || 0,
                v.prix_gros || 0,
                v.prix_gros_pourcentage || 0,
                v.prix_vente_pourcentage || 0,
                v.prix_vente, 
                v.stock_quantity, 
                now, 
                now
              ]
            );
          }
        }
      }
    }

    // Update Units
    if (units) {
      let parsedUnits = [];
      try {
        parsedUnits = typeof units === 'string' ? JSON.parse(units) : units;
      } catch (e) {
        console.error('Error parsing units:', e);
      }
      if (Array.isArray(parsedUnits)) {
        const incomingIds = parsedUnits.map(u => u.id).filter(id => id);
        if (incomingIds.length > 0) {
          await pool.query(`DELETE FROM product_units WHERE product_id = ? AND id NOT IN (?)`, [id, incomingIds]);
        } else {
          await pool.query(`DELETE FROM product_units WHERE product_id = ?`, [id]);
        }

        for (const u of parsedUnits) {
          if (u.id) {
            await pool.query(
              `UPDATE product_units SET unit_name=?, conversion_factor=?, prix_vente=?, is_default=?, updated_at=? WHERE id=? AND product_id=?`,
              [u.unit_name, u.conversion_factor, u.prix_vente, u.is_default ? 1 : 0, now, u.id, id]
            );
          } else {
            await pool.query(
              `INSERT INTO product_units (product_id, unit_name, conversion_factor, prix_vente, is_default, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [id, u.unit_name, u.conversion_factor, u.prix_vente, u.is_default ? 1 : 0, now, now]
            );
          }
        }
      }
    }

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
