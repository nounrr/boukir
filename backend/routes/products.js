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

  // Check designation multilingual
  const [colsDesAr] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'designation_ar'`
  );
  if (!colsDesAr.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN designation_ar VARCHAR(255) DEFAULT NULL`);
  }
  const [colsDesEn] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'designation_en'`
  );
  if (!colsDesEn.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN designation_en VARCHAR(255) DEFAULT NULL`);
  }
  const [colsDesZh] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'designation_zh'`
  );
  if (!colsDesZh.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN designation_zh VARCHAR(255) DEFAULT NULL`);
  }

  // Check description multilingual
  const [colsDescAr] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'description_ar'`
  );
  if (!colsDescAr.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN description_ar TEXT DEFAULT NULL`);
  }
  const [colsDescEn] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'description_en'`
  );
  if (!colsDescEn.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN description_en TEXT DEFAULT NULL`);
  }
  const [colsDescZh] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'description_zh'`
  );
  if (!colsDescZh.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN description_zh TEXT DEFAULT NULL`);
  }

  // Check kg
  const [colsKg] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'kg'`
  );
  if (!colsKg.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN kg DECIMAL(10,3) DEFAULT NULL`);
  }

  // Check pricing fields
  const [colsCout] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'cout_revient'`
  );
  if (!colsCout.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN cout_revient DECIMAL(10,2) DEFAULT 0`);
  }
  const [colsCoutPct] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'cout_revient_pourcentage'`
  );
  if (!colsCoutPct.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN cout_revient_pourcentage DECIMAL(5,2) DEFAULT 0`);
  }
  const [colsGros] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'prix_gros'`
  );
  if (!colsGros.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN prix_gros DECIMAL(10,2) DEFAULT 0`);
  }
  const [colsGrosPct] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'prix_gros_pourcentage'`
  );
  if (!colsGrosPct.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN prix_gros_pourcentage DECIMAL(5,2) DEFAULT 0`);
  }
  const [colsVentePct] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'prix_vente_pourcentage'`
  );
  if (!colsVentePct.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN prix_vente_pourcentage DECIMAL(5,2) DEFAULT 0`);
  }

  // Check remises in products
  const [colsRemiseClientProd] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'remise_client'`
  );
  if (!colsRemiseClientProd.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN remise_client DECIMAL(5,2) NOT NULL DEFAULT 0`);
  }
  const [colsRemiseArtisanProd] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'remise_artisan'`
  );
  if (!colsRemiseArtisanProd.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN remise_artisan DECIMAL(5,2) NOT NULL DEFAULT 0`);
  }

  // Check est_service
  const [colsService] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'est_service'`
  );
  if (!colsService.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN est_service TINYINT(1) DEFAULT 0`);
  }

  // Check created_by
  const [colsCreatedBy] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'created_by'`
  );
  if (!colsCreatedBy.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN created_by INT DEFAULT NULL`);
  }
  
  // Check updated_by
  const [colsUpdatedBy] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'updated_by'`
  );
  if (!colsUpdatedBy.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN updated_by INT DEFAULT NULL`);
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

  // Check categorie_base enum
  const [colsCategorieBase] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'categorie_base'`
  );
  if (!colsCategorieBase.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN categorie_base ENUM('Professionel','Maison') DEFAULT 'Maison'`);
  }

  // Check variant_type in product_variants
  const [colsVariantType] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants' AND COLUMN_NAME = 'variant_type'`
  );
  if (!colsVariantType.length) {
    await pool.query(`ALTER TABLE product_variants ADD COLUMN variant_type VARCHAR(50) DEFAULT 'Autre'`);
  }

  // Check image_url in product_variants
  const [colsVariantImage] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants' AND COLUMN_NAME = 'image_url'`
  );
  if (!colsVariantImage.length) {
    await pool.query(`ALTER TABLE product_variants ADD COLUMN image_url VARCHAR(255) NULL`);
  }

  // Check remises in product_variants
  const [colsRemiseClientVar] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants' AND COLUMN_NAME = 'remise_client'`
  );
  if (!colsRemiseClientVar.length) {
    await pool.query(`ALTER TABLE product_variants ADD COLUMN remise_client DECIMAL(5,2) NOT NULL DEFAULT 0`);
  }
  const [colsRemiseArtisanVar] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants' AND COLUMN_NAME = 'remise_artisan'`
  );
  if (!colsRemiseArtisanVar.length) {
    await pool.query(`ALTER TABLE product_variants ADD COLUMN remise_artisan DECIMAL(5,2) NOT NULL DEFAULT 0`);
  }

  // Create variant_images table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS variant_images (
      id INT AUTO_INCREMENT PRIMARY KEY,
      variant_id INT NOT NULL,
      image_url VARCHAR(255) NOT NULL,
      position INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_variant_images_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Ensure brands table exists for FK
  await pool.query(`
    CREATE TABLE IF NOT EXISTS brands (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nom VARCHAR(255) NOT NULL,
      description TEXT,
      image_url VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // Check brand_id
  const [colsBrand] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'brand_id'`
  );
  if (!colsBrand.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN brand_id INT DEFAULT NULL`);
    await pool.query(`ALTER TABLE products ADD CONSTRAINT fk_products_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL`);
  }

  // Drop product_categories table if exists (as requested)
  await pool.query(`DROP TABLE IF EXISTS product_categories`);

  // Ensure product_images table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_images (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      image_url VARCHAR(255) NOT NULL,
      position INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
  `);

  // Ensure categorie_id is INT (Single Category)
  const [colCatId] = await pool.query(
    `SELECT DATA_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'categorie_id'`
  );
  if (colCatId.length && (colCatId[0].DATA_TYPE === 'text' || colCatId[0].DATA_TYPE === 'varchar' || colCatId[0].DATA_TYPE === 'json')) {
    console.log('Converting categorie_id from TEXT/JSON to INT...');
    // Try to extract first ID if it's a JSON array string
    // This is a best-effort migration
    try {
      const [rows] = await pool.query(`SELECT id, categorie_id FROM products WHERE categorie_id LIKE '[%'`);
      for (const row of rows) {
        try {
          const parsed = JSON.parse(row.categorie_id);
          if (Array.isArray(parsed) && parsed.length > 0) {
            await pool.query(`UPDATE products SET categorie_id = ? WHERE id = ?`, [parsed[0], row.id]);
          } else {
            await pool.query(`UPDATE products SET categorie_id = NULL WHERE id = ?`, [row.id]);
          }
        } catch (e) {
           await pool.query(`UPDATE products SET categorie_id = NULL WHERE id = ?`, [row.id]);
        }
      }
    } catch (e) { console.error('Migration of categorie_id failed', e); }

    await pool.query(`ALTER TABLE products MODIFY COLUMN categorie_id INT DEFAULT NULL`);
    // Add FK
    try {
        await pool.query(`ALTER TABLE products ADD CONSTRAINT fk_products_category FOREIGN KEY (categorie_id) REFERENCES categories(id) ON DELETE SET NULL`);
    } catch (e) { console.log('FK creation failed', e); }
  }
};

router.get('/', async (req, res, next) => {
  try {
    await ensureProductsColumns();
    const [rows] = await pool.query(`
      SELECT p.*, b.id as b_id, b.nom as b_nom, b.image_url as b_image_url,
      (SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'id', pi.id, 
        'image_url', pi.image_url, 
        'position', pi.position
      )) FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position ASC) as gallery,
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
        'image_url', pv.image_url,
        'remise_client', pv.remise_client,
        'remise_artisan', pv.remise_artisan,
        'stock_quantity', pv.stock_quantity
      )) FROM product_variants pv WHERE pv.product_id = p.id) as variants,
      (SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'id', pu.id, 
        'unit_name', pu.unit_name, 
        'conversion_factor', pu.conversion_factor, 
        'prix_vente', pu.prix_vente, 
        'is_default', pu.is_default
      )) FROM product_units pu WHERE pu.product_id = p.id) as units,
      c.nom as categorie_nom
      FROM products p
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN categories c ON p.categorie_id = c.id
      WHERE COALESCE(p.is_deleted, 0) = 0
      ORDER BY p.id DESC
    `);
    const data = rows.map((r) => {
      const gallery = typeof r.gallery === 'string' ? JSON.parse(r.gallery) : (r.gallery || []);
      return {
      id: r.id,
  // reference is now derived from id for compatibility with frontend displays
  reference: String(r.id),
      designation: r.designation,
      categorie_id: r.categorie_id || 0,
      categorie: r.categorie_id ? { id: r.categorie_id, nom: r.categorie_nom } : undefined,
      categories: r.categorie_id ? [{ id: r.categorie_id, nom: r.categorie_nom }] : [],
      brand: r.b_id ? { id: r.b_id, nom: r.b_nom, image_url: r.b_image_url } : undefined,
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
      remise_client: Number(r.remise_client ?? 0),
      remise_artisan: Number(r.remise_artisan ?? 0),
      gallery: gallery,
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
      categorie_base: r.categorie_base,
      variants: typeof r.variants === 'string' ? JSON.parse(r.variants) : (r.variants || []),
      units: typeof r.units === 'string' ? JSON.parse(r.units) : (r.units || []),
    };
  });
    res.json(data);
  } catch (err) { next(err); }
});

// List soft-deleted products
router.get('/archived/list', async (_req, res, next) => {
  try {
    await ensureProductsColumns();
    const [rows] = await pool.query(
      `SELECT p.*
       FROM products p
       WHERE COALESCE(p.is_deleted, 0) = 1
       ORDER BY p.updated_at DESC`
    );
    res.json(rows.map((r) => ({
      id: r.id,
      reference: String(r.id),
      designation: r.designation,
      categorie_id: 0, // Archived list simplified
      categorie: undefined,
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

// Soft-delete a product
// DELETE /api/products/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await ensureProductsColumns();
    const id = Number(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    const [exists] = await pool.query(
      'SELECT id FROM products WHERE id = ? AND COALESCE(is_deleted,0) = 0',
      [id]
    );
    if (!exists.length) {
      return res.status(404).json({ message: 'Produit introuvable' });
    }

    const now = new Date();
    const updatedBy = req.user?.id || null;

    // updated_by column is ensured in ensureProductsColumns()
    await pool.query(
      'UPDATE products SET is_deleted = 1, updated_at = ?, updated_by = ? WHERE id = ?',
      [now, updatedBy, id]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    await ensureProductsColumns();
    const id = Number(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ message: 'ID invalide' });
    }
    
    const [rows] = await pool.query(`
      SELECT p.*, b.id as b_id, b.nom as b_nom, b.image_url as b_image_url,
      c.id as c_id, c.nom as c_nom
      FROM products p 
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN categories c ON p.categorie_id = c.id
      WHERE p.id = ?
    `, [id]);
    const r = rows[0];
    if (!r) return res.status(404).json({ message: 'Produit introuvable' });

    // Fetch variants and units
    const [variants] = await pool.query('SELECT * FROM product_variants WHERE product_id = ?', [id]);
    const variantIds = variants.map(v => v.id);
    let variantGalleriesById = {};
    if (variantIds.length > 0) {
      const [vimgs] = await pool.query(
        `SELECT * FROM variant_images WHERE variant_id IN (?) ORDER BY position ASC`,
        [variantIds]
      );
      for (const img of vimgs) {
        if (!variantGalleriesById[img.variant_id]) variantGalleriesById[img.variant_id] = [];
        variantGalleriesById[img.variant_id].push(img);
      }
    }
    const [units] = await pool.query('SELECT * FROM product_units WHERE product_id = ?', [id]);
    const [gallery] = await pool.query('SELECT * FROM product_images WHERE product_id = ? ORDER BY position ASC', [id]);
    
    const finalCategories = r.c_id ? [{ id: r.c_id, nom: r.c_nom }] : [];

    res.json({
      id: r.id,
      reference: String(r.id),
      designation: r.designation,
      categorie_id: r.categorie_id || 0,
      categorie: r.c_id ? { id: r.c_id, nom: r.c_nom } : undefined,
      cout_revient_pourcentage: Number(r.cout_revient_pourcentage),
      cout_revient: Number(r.cout_revient),
      prix_gros_pourcentage: Number(r.prix_gros_pourcentage),
      prix_gros: Number(r.prix_gros),
      prix_vente_pourcentage: Number(r.prix_vente_pourcentage),
      prix_vente: Number(r.prix_vente),
      est_service: !!r.est_service,
      image_url: r.image_url,
      gallery: gallery,
      remise_client: Number(r.remise_client ?? 0),
      remise_artisan: Number(r.remise_artisan ?? 0),
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
      categorie_base: r.categorie_base,
      variants: variants.map(v => ({
        ...v,
        prix_achat: Number(v.prix_achat),
        cout_revient: Number(v.cout_revient),
        cout_revient_pourcentage: Number(v.cout_revient_pourcentage),
        prix_gros: Number(v.prix_gros),
        prix_gros_pourcentage: Number(v.prix_gros_pourcentage),
        prix_vente_pourcentage: Number(v.prix_vente_pourcentage),
        prix_vente: Number(v.prix_vente),
        stock_quantity: Number(v.stock_quantity),
        image_url: v.image_url,
        remise_client: Number(v.remise_client ?? 0),
        remise_artisan: Number(v.remise_artisan ?? 0),
        gallery: variantGalleriesById[v.id] || []
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

router.post('/', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'gallery', maxCount: 10 }
]), async (req, res, next) => {
  try {
    await ensureProductsColumns();
    const {
      designation,
      designation_ar,
      designation_en,
      designation_zh,
      categorie_id,
      brand_id,
      quantite,
      kg,
      prix_achat,
      cout_revient_pourcentage,
      prix_gros_pourcentage,
      prix_vente_pourcentage,
      remise_client,
      remise_artisan,
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
      categorie_base,
      variants,
      units,
    } = req.body;

    const image_url = req.files?.['image']?.[0] ? `/uploads/products/${req.files['image'][0].filename}` : null;
    const fiche_technique = req.body?.fiche_technique ?? null;
    const fiche_technique_ar = req.body?.fiche_technique_ar ?? null;
    const fiche_technique_en = req.body?.fiche_technique_en ?? null;
    const fiche_technique_zh = req.body?.fiche_technique_zh ?? null;

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

    const cr = pa * (1 + crp / 100);
    const pg = pa * (1 + pgp / 100);
    const pv = pa * (1 + pvp / 100);

    const now = new Date();
    const catId = categorie_id ? Number(categorie_id) : null;

    // Validate that categorie_id is a leaf category (no children)
    if (catId) {
      const [hasChildren] = await pool.query('SELECT COUNT(*) as count FROM categories WHERE parent_id = ?', [catId]);
      if (hasChildren[0].count > 0) {
        return res.status(400).json({ 
          message: 'Impossible: veuillez sélectionner une catégorie finale (sans sous-catégories)' 
        });
      }
    }

    const [result] = await pool.query(
      `INSERT INTO products
      (designation, designation_ar, designation_en, designation_zh, categorie_id, brand_id, quantite, kg, prix_achat, cout_revient_pourcentage, cout_revient, prix_gros_pourcentage, prix_gros, prix_vente_pourcentage, prix_vente, remise_client, remise_artisan, est_service, image_url, fiche_technique, fiche_technique_ar, fiche_technique_en, fiche_technique_zh, description, description_ar, description_en, description_zh, pourcentage_promo, ecom_published, stock_partage_ecom, stock_partage_ecom_qty, has_variants, base_unit, categorie_base, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        (designation && String(designation).trim()) || 'Sans désignation',
        designation_ar || null,
        designation_en || null,
        designation_zh || null,
        catId,
        brand_id ? Number(brand_id) : null,
        Number(isService ? 0 : (quantite ?? 0)),
        kg === undefined || kg === null ? null : Number(kg),
        pa,
        crp,
        cr,
        pgp,
        pg,
        pvp,
        pv,
        Number(remise_client ?? 0),
        Number(remise_artisan ?? 0),
        isService ? 1 : 0,
        image_url,
        fiche_technique,
        fiche_technique_ar,
        fiche_technique_en,
        fiche_technique_zh,
        description ?? null,
        description_ar ?? null,
        description_en ?? null,
        description_zh ?? null,
        Number(pourcentage_promo ?? 0),
        isEcomPublished ? 1 : 0,
        isStockPartage ? 1 : 0,
        shareQty,
        isHasVariants ? 1 : 0,
        base_unit || 'u',
        (categorie_base === 'Professionel' || categorie_base === 'Maison') ? categorie_base : 'Maison',
        created_by ?? null,
        now,
        now,
      ]
    );

    const id = result.insertId;

    // Gallery
    const newGallery = req.files?.['gallery'] || [];
    if (newGallery.length > 0) {
      let pos = 0;
      for (const file of newGallery) {
        const url = `/uploads/products/${file.filename}`;
        await pool.query(
          `INSERT INTO product_images (product_id, image_url, position) VALUES (?, ?, ?)`,
          [id, url, pos++]
        );
      }
    }

    // Variants
    if (variants) {
      let parsed = [];
      try { parsed = typeof variants === 'string' ? JSON.parse(variants) : variants; } catch {}
      if (Array.isArray(parsed)) {
        for (const v of parsed) {
          await pool.query(
            `INSERT INTO product_variants (product_id, variant_name, variant_type, reference, prix_achat, cout_revient, cout_revient_pourcentage, prix_gros, prix_gros_pourcentage, prix_vente_pourcentage, prix_vente, remise_client, remise_artisan, stock_quantity, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              v.variant_name,
              v.variant_type || 'Autre',
              v.reference,
              Number(v.prix_achat ?? 0),
              Number(v.cout_revient ?? 0),
              Number(v.cout_revient_pourcentage ?? 0),
              Number(v.prix_gros ?? 0),
              Number(v.prix_gros_pourcentage ?? 0),
              Number(v.prix_vente_pourcentage ?? 0),
              Number(v.prix_vente ?? 0),
              Number(v.remise_client ?? 0),
              Number(v.remise_artisan ?? 0),
              Number(v.stock_quantity ?? 0),
              now,
              now,
            ]
          );
        }
      }
    }

    // Units
    if (units) {
      let parsed = [];
      try { parsed = typeof units === 'string' ? JSON.parse(units) : units; } catch {}
      if (Array.isArray(parsed)) {
        for (const u of parsed) {
          await pool.query(
            `INSERT INTO product_units (product_id, unit_name, conversion_factor, prix_vente, is_default, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, u.unit_name, Number(u.conversion_factor), u.prix_vente !== null && u.prix_vente !== undefined ? Number(u.prix_vente) : null, u.is_default ? 1 : 0, now, now]
          );
        }
      }
    }

    // Return created product (basic payload)
    const [row] = await pool.query(
      `SELECT p.*, c.nom as categorie_nom, b.id as b_id, b.nom as b_nom, b.image_url as b_image_url
       FROM products p
       LEFT JOIN categories c ON p.categorie_id = c.id
       LEFT JOIN brands b ON p.brand_id = b.id
       WHERE p.id = ?`,
      [id]
    );
    const r = row[0];
    const [gallery] = await pool.query('SELECT * FROM product_images WHERE product_id = ? ORDER BY position ASC', [id]);
    const [vars] = await pool.query('SELECT * FROM product_variants WHERE product_id = ?', [id]);
    const [unts] = await pool.query('SELECT * FROM product_units WHERE product_id = ?', [id]);

    return res.json({
      id: r.id,
      reference: String(r.id),
      designation: r.designation,
      categorie_id: r.categorie_id || 0,
      categorie: r.categorie_id ? { id: r.categorie_id, nom: r.categorie_nom } : undefined,
      brand: r.b_id ? { id: r.b_id, nom: r.b_nom, image_url: r.b_image_url } : undefined,
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
      gallery,
      remise_client: Number(r.remise_client ?? 0),
      remise_artisan: Number(r.remise_artisan ?? 0),
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
      categorie_base: r.categorie_base,
      variants: vars.map(v => ({
        ...v,
        prix_achat: Number(v.prix_achat),
        cout_revient: Number(v.cout_revient),
        cout_revient_pourcentage: Number(v.cout_revient_pourcentage),
        prix_gros: Number(v.prix_gros),
        prix_gros_pourcentage: Number(v.prix_gros_pourcentage),
        prix_vente_pourcentage: Number(v.prix_vente_pourcentage),
        prix_vente: Number(v.prix_vente),
        stock_quantity: Number(v.stock_quantity),
        remise_client: Number(v.remise_client ?? 0),
        remise_artisan: Number(v.remise_artisan ?? 0),
      })),
      units: unts.map(u => ({
        ...u,
        conversion_factor: Number(u.conversion_factor),
        prix_vente: u.prix_vente !== null && u.prix_vente !== undefined ? Number(u.prix_vente) : null,
        is_default: !!u.is_default,
      })),
    });
  } catch (err) { next(err); }
});

// Update a product (basic fields + optional image/gallery). Variants/units not edited here.
router.put('/:id', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'gallery', maxCount: 10 }
]), async (req, res, next) => {
  try {
    await ensureProductsColumns();
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    const [existRows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
    if (!existRows.length) return res.status(404).json({ message: 'Produit introuvable' });
    const existing = existRows[0];

    const {
      designation,
      designation_ar,
      designation_en,
      designation_zh,
      categorie_id,
      brand_id,
      quantite,
      kg,
      prix_achat,
      cout_revient_pourcentage,
      prix_gros_pourcentage,
      prix_vente_pourcentage,
      remise_client,
      remise_artisan,
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
      categorie_base,
      fiche_technique,
      fiche_technique_ar,
      fiche_technique_en,
      fiche_technique_zh,
    } = req.body;

    const now = new Date();

    // Determine booleans
    const isService = (est_service !== undefined)
      ? (est_service === 'true' || est_service === true || est_service === '1' || est_service === 1)
      : !!existing.est_service;
    const isEcomPublished = (ecom_published !== undefined)
      ? (ecom_published === 'true' || ecom_published === true || ecom_published === '1' || ecom_published === 1)
      : !!existing.ecom_published;
    const isStockPartage = (stock_partage_ecom !== undefined)
      ? (stock_partage_ecom === 'true' || stock_partage_ecom === true || stock_partage_ecom === '1' || stock_partage_ecom === 1)
      : !!existing.stock_partage_ecom;
    const isHasVariants = (has_variants !== undefined)
      ? (has_variants === 'true' || has_variants === true || has_variants === '1' || has_variants === 1)
      : !!existing.has_variants;

    // Quantity, share
    const newQuantite = (quantite !== undefined && quantite !== null && quantite !== '')
      ? Number(isService ? 0 : quantite)
      : Number(isService ? 0 : existing.quantite);
    const shareQty = (stock_partage_ecom_qty !== undefined && stock_partage_ecom_qty !== null && stock_partage_ecom_qty !== '')
      ? Number(stock_partage_ecom_qty)
      : Number(existing.stock_partage_ecom_qty ?? 0);
    if (shareQty > newQuantite) {
      return res.status(400).json({ message: 'La quantité partagée ne peut pas dépasser la quantité totale' });
    }

    // Pricing
    const pa = (prix_achat !== undefined && prix_achat !== null && prix_achat !== '') ? Number(prix_achat) : Number(existing.prix_achat ?? 0);
    const crp = (cout_revient_pourcentage !== undefined && cout_revient_pourcentage !== null && cout_revient_pourcentage !== '') ? Number(cout_revient_pourcentage) : Number(existing.cout_revient_pourcentage ?? 0);
    const pgp = (prix_gros_pourcentage !== undefined && prix_gros_pourcentage !== null && prix_gros_pourcentage !== '') ? Number(prix_gros_pourcentage) : Number(existing.prix_gros_pourcentage ?? 0);
    const pvp = (prix_vente_pourcentage !== undefined && prix_vente_pourcentage !== null && prix_vente_pourcentage !== '') ? Number(prix_vente_pourcentage) : Number(existing.prix_vente_pourcentage ?? 0);
    const cr = pa * (1 + crp / 100);
    const pg = pa * (1 + pgp / 100);
    const pv = pa * (1 + pvp / 100);

    // Category handling and validation: allow null/0 to clear
    let newCatId = null;
    if (categorie_id === undefined) {
      newCatId = existing.categorie_id;
    } else {
      const tmp = Number(categorie_id);
      newCatId = tmp > 0 ? tmp : null;
    }
    if (newCatId) {
      const [hasChildren] = await pool.query('SELECT COUNT(*) as count FROM categories WHERE parent_id = ?', [newCatId]);
      if (hasChildren[0].count > 0) {
        return res.status(400).json({ message: 'Impossible: veuillez sélectionner une catégorie finale (sans sous-catégories)' });
      }
    }

    // Image handling
    const newImage = req.files?.['image']?.[0];
    const image_url_val = newImage ? `/uploads/products/${newImage.filename}` : existing.image_url;

    // Compute other fields
    const payload = {
      designation: (designation !== undefined) ? ((String(designation).trim()) || 'Sans désignation') : existing.designation,
      designation_ar: (designation_ar !== undefined) ? designation_ar : existing.designation_ar,
      designation_en: (designation_en !== undefined) ? designation_en : existing.designation_en,
      designation_zh: (designation_zh !== undefined) ? designation_zh : existing.designation_zh,
      categorie_id: newCatId,
      brand_id: (brand_id !== undefined && brand_id !== null && brand_id !== '') ? Number(brand_id) : existing.brand_id,
      quantite: newQuantite,
      kg: (kg === undefined || kg === null || kg === '') ? existing.kg : Number(kg),
      prix_achat: pa,
      cout_revient_pourcentage: crp,
      cout_revient: cr,
      prix_gros_pourcentage: pgp,
      prix_gros: pg,
      prix_vente_pourcentage: pvp,
      prix_vente: pv,
      remise_client: (remise_client !== undefined && remise_client !== null && remise_client !== '') ? Number(remise_client) : Number(existing.remise_client ?? 0),
      remise_artisan: (remise_artisan !== undefined && remise_artisan !== null && remise_artisan !== '') ? Number(remise_artisan) : Number(existing.remise_artisan ?? 0),
      est_service: isService ? 1 : 0,
      image_url: image_url_val,
      fiche_technique: (fiche_technique !== undefined) ? fiche_technique : existing.fiche_technique,
      fiche_technique_ar: (fiche_technique_ar !== undefined) ? fiche_technique_ar : existing.fiche_technique_ar,
      fiche_technique_en: (fiche_technique_en !== undefined) ? fiche_technique_en : existing.fiche_technique_en,
      fiche_technique_zh: (fiche_technique_zh !== undefined) ? fiche_technique_zh : existing.fiche_technique_zh,
      description: (description !== undefined) ? description : existing.description,
      description_ar: (description_ar !== undefined) ? description_ar : existing.description_ar,
      description_en: (description_en !== undefined) ? description_en : existing.description_en,
      description_zh: (description_zh !== undefined) ? description_zh : existing.description_zh,
      pourcentage_promo: (pourcentage_promo !== undefined && pourcentage_promo !== null && pourcentage_promo !== '') ? Number(pourcentage_promo) : Number(existing.pourcentage_promo ?? 0),
      ecom_published: isEcomPublished ? 1 : 0,
      stock_partage_ecom: isStockPartage ? 1 : 0,
      stock_partage_ecom_qty: shareQty,
      has_variants: isHasVariants ? 1 : 0,
      base_unit: (base_unit !== undefined && base_unit !== null && base_unit !== '') ? base_unit : (existing.base_unit || 'u'),
      categorie_base: (categorie_base === 'Professionel' || categorie_base === 'Maison') ? categorie_base : (existing.categorie_base || 'Maison'),
      updated_by: updated_by ?? existing.updated_by,
      updated_at: now,
    };

    // Build SQL dynamically to avoid overriding unspecified fields
    const fields = Object.keys(payload);
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => payload[f]);
    values.push(id);
    await pool.query(`UPDATE products SET ${setClause} WHERE id = ?`, values);

    // Append any new gallery images with incremental positions
    const newGallery = req.files?.['gallery'] || [];
    if (newGallery.length > 0) {
      const [posRow] = await pool.query('SELECT COALESCE(MAX(position), -1) as maxpos FROM product_images WHERE product_id = ?', [id]);
      let pos = Number(posRow[0]?.maxpos ?? -1) + 1;
      for (const file of newGallery) {
        const url = `/uploads/products/${file.filename}`;
        await pool.query(
          `INSERT INTO product_images (product_id, image_url, position) VALUES (?, ?, ?)`,
          [id, url, pos++]
        );
      }
    }

    // Return the updated product in the same shape as GET /:id
    const [rows] = await pool.query(`
      SELECT p.*, b.id as b_id, b.nom as b_nom, b.image_url as b_image_url,
      c.id as c_id, c.nom as c_nom
      FROM products p 
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN categories c ON p.categorie_id = c.id
      WHERE p.id = ?
    `, [id]);
    const r = rows[0];
    if (!r) return res.status(404).json({ message: 'Produit introuvable' });

    const [variants] = await pool.query('SELECT * FROM product_variants WHERE product_id = ?', [id]);
    const variantIds = variants.map(v => v.id);
    let variantGalleriesById = {};
    if (variantIds.length > 0) {
      const [vimgs] = await pool.query(
        `SELECT * FROM variant_images WHERE variant_id IN (?) ORDER BY position ASC`,
        [variantIds]
      );
      for (const img of vimgs) {
        if (!variantGalleriesById[img.variant_id]) variantGalleriesById[img.variant_id] = [];
        variantGalleriesById[img.variant_id].push(img);
      }
    }
    const [units] = await pool.query('SELECT * FROM product_units WHERE product_id = ?', [id]);
    const [gallery] = await pool.query('SELECT * FROM product_images WHERE product_id = ? ORDER BY position ASC', [id]);

    res.json({
      id: r.id,
      reference: String(r.id),
      designation: r.designation,
      categorie_id: r.categorie_id || 0,
      categorie: r.c_id ? { id: r.c_id, nom: r.c_nom } : undefined,
      cout_revient_pourcentage: Number(r.cout_revient_pourcentage),
      cout_revient: Number(r.cout_revient),
      prix_gros_pourcentage: Number(r.prix_gros_pourcentage),
      prix_gros: Number(r.prix_gros),
      prix_vente_pourcentage: Number(r.prix_vente_pourcentage),
      prix_vente: Number(r.prix_vente),
      est_service: !!r.est_service,
      image_url: r.image_url,
      gallery: gallery,
      remise_client: Number(r.remise_client ?? 0),
      remise_artisan: Number(r.remise_artisan ?? 0),
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
      categorie_base: r.categorie_base,
      variants: variants.map(v => ({
        ...v,
        prix_achat: Number(v.prix_achat),
        cout_revient: Number(v.cout_revient),
        cout_revient_pourcentage: Number(v.cout_revient_pourcentage),
        prix_gros: Number(v.prix_gros),
        prix_gros_pourcentage: Number(v.prix_gros_pourcentage),
        prix_vente_pourcentage: Number(v.prix_vente_pourcentage),
        prix_vente: Number(v.prix_vente),
        stock_quantity: Number(v.stock_quantity),
        image_url: v.image_url,
        remise_client: Number(v.remise_client ?? 0),
        remise_artisan: Number(v.remise_artisan ?? 0),
        gallery: variantGalleriesById[v.id] || []
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

// Specific stock update endpoint
router.patch('/:id/stock', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { quantite, updated_by } = req.body;
    const [exists] = await pool.query('SELECT id FROM products WHERE id = ?', [id]);
    if (exists.length === 0) return res.status(404).json({ message: 'Produit introuvable' });
    const now = new Date();
    await pool.query('UPDATE products SET quantite = ?, updated_by = ?, updated_at = ? WHERE id = ?', [Number(quantite), updated_by ?? null, now, id]);
    const [rows] = await pool.query(`
      SELECT p.*, 
      (SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'id', pi.id, 
        'image_url', pi.image_url, 
        'position', pi.position
      )) FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position ASC) as gallery,
      c.nom as categorie_nom
      FROM products p 
      LEFT JOIN categories c ON p.categorie_id = c.id
      WHERE p.id = ?
    `, [id]);
    const r = rows[0];
    const gallery = typeof r.gallery === 'string' ? JSON.parse(r.gallery) : (r.gallery || []);
    const categories = r.categorie_id ? [{ id: r.categorie_id, nom: r.categorie_nom }] : [];
    res.json({ ...r, categories, gallery, reference: String(r.id) });
  } catch (err) { next(err); }
});

export default router;
