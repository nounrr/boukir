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

// Optional schema support (product_snapshot)
let cachedHasProductSnapshotTable = null;
async function hasProductSnapshotTable() {
  if (cachedHasProductSnapshotTable !== null) return cachedHasProductSnapshotTable;
  try {
    const [rows] = await pool.query(
      `SELECT TABLE_NAME
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_snapshot'`
    );
    cachedHasProductSnapshotTable = rows?.length > 0;
  } catch {
    cachedHasProductSnapshotTable = false;
  }
  return cachedHasProductSnapshotTable;
}

// Optional column support (product_snapshot.en_validation)
let cachedHasProductSnapshotEnValidationColumn = null;
async function hasProductSnapshotEnValidationColumn() {
  if (cachedHasProductSnapshotEnValidationColumn !== null) return cachedHasProductSnapshotEnValidationColumn;
  try {
    await pool.query('SELECT en_validation FROM product_snapshot LIMIT 1');
    cachedHasProductSnapshotEnValidationColumn = true;
  } catch (e) {
    const msg = String(e?.sqlMessage || e?.message || '').toLowerCase();
    if (msg.includes('unknown column') || msg.includes("doesn't exist") || msg.includes('does not exist')) {
      cachedHasProductSnapshotEnValidationColumn = false;
    } else {
      cachedHasProductSnapshotEnValidationColumn = false;
    }
  }
  return cachedHasProductSnapshotEnValidationColumn;
}

// Ensure soft-delete and image_url columns exist
let ensuredProductsColumns = false;
async function ensureProductsColumns() {
  if (ensuredProductsColumns) return;

  // Ensure product_units has prix_vente column (nullable override; when NULL => auto compute from factor)
  try {
    const [tbl] = await pool.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_units'`
    );
    if (tbl?.length) {
      const [col] = await pool.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_units' AND COLUMN_NAME = 'prix_vente'`
      );
      if (!col.length) {
        await pool.query(`ALTER TABLE product_units ADD COLUMN prix_vente DECIMAL(10,2) DEFAULT NULL AFTER conversion_factor`);
      }

      // Ensure facteur_isNormal column (1 => default/auto price, 0 => manual override)
      const [colFlag] = await pool.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_units' AND COLUMN_NAME = 'facteur_isNormal'`
      );
      if (!colFlag.length) {
        await pool.query(
          `ALTER TABLE product_units ADD COLUMN facteur_isNormal TINYINT(1) NOT NULL DEFAULT 1 AFTER prix_vente`
        );
        // Best-effort backfill: if a unit has an explicit price, it's not normal/auto
        try {
          await pool.query(`UPDATE product_units SET facteur_isNormal = 0 WHERE prix_vente IS NOT NULL`);
        } catch { }
      }
    }
  } catch (e) {
    console.log('ensureProductsColumns: product_units.prix_vente check skipped', e?.message || e);
  }

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
    `SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'fiche_technique'`
  );
  if (!colsFiche.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN fiche_technique LONGTEXT DEFAULT NULL`);
  } else {
    // Ensure it is LONGTEXT to avoid "Data too long"
    await pool.query(`ALTER TABLE products MODIFY COLUMN fiche_technique LONGTEXT DEFAULT NULL`);
  }

  // Check fiche_technique multilingual columns
  const [colsFicheAr] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'fiche_technique_ar'`
  );
  if (!colsFicheAr.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN fiche_technique_ar LONGTEXT DEFAULT NULL`);
  } else {
    await pool.query(`ALTER TABLE products MODIFY COLUMN fiche_technique_ar LONGTEXT DEFAULT NULL`);
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
    await pool.query(`ALTER TABLE products ADD COLUMN description LONGTEXT DEFAULT NULL`);
  } else {
    await pool.query(`ALTER TABLE products MODIFY COLUMN description LONGTEXT DEFAULT NULL`);
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

  // Check is_obligatoire_variant
  const [colsObligVar] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'is_obligatoire_variant'`
  );
  if (!colsObligVar.length) {
    await pool.query(`ALTER TABLE products ADD COLUMN is_obligatoire_variant TINYINT(1) NOT NULL DEFAULT 0`);
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

  // Check pricing fields in product_variants
  const [colsVarCout] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants' AND COLUMN_NAME = 'cout_revient'`
  );
  if (!colsVarCout.length) {
    await pool.query(`ALTER TABLE product_variants ADD COLUMN cout_revient DECIMAL(10,2) DEFAULT 0`);
  }
  const [colsVarCoutPct] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants' AND COLUMN_NAME = 'cout_revient_pourcentage'`
  );
  if (!colsVarCoutPct.length) {
    await pool.query(`ALTER TABLE product_variants ADD COLUMN cout_revient_pourcentage DECIMAL(5,2) DEFAULT 0`);
  }
  const [colsVarGros] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants' AND COLUMN_NAME = 'prix_gros'`
  );
  if (!colsVarGros.length) {
    await pool.query(`ALTER TABLE product_variants ADD COLUMN prix_gros DECIMAL(10,2) DEFAULT 0`);
  }
  const [colsVarGrosPct] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants' AND COLUMN_NAME = 'prix_gros_pourcentage'`
  );
  if (!colsVarGrosPct.length) {
    await pool.query(`ALTER TABLE product_variants ADD COLUMN prix_gros_pourcentage DECIMAL(5,2) DEFAULT 0`);
  }
  const [colsVarVentePct] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants' AND COLUMN_NAME = 'prix_vente_pourcentage'`
  );
  if (!colsVarVentePct.length) {
    await pool.query(`ALTER TABLE product_variants ADD COLUMN prix_vente_pourcentage DECIMAL(5,2) DEFAULT 0`);
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

// Search / Filter / Paginate endpoint
router.get('/search', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const { q, category_id, brand_id, missing_lang } = req.query;

    const conditions = ['COALESCE(p.is_deleted, 0) = 0'];
    const params = [];

    if (q) {
      conditions.push('(p.designation LIKE ? OR p.id LIKE ?)');
      const wild = `%${q}%`;
      params.push(wild, wild);
    }

    if (category_id) {
      conditions.push('p.categorie_id = ?');
      params.push(category_id);
    }

    if (brand_id) {
      conditions.push('p.brand_id = ?');
      params.push(brand_id);
    }

    if (missing_lang) {
      if (missing_lang === 'ar') conditions.push("(p.designation_ar IS NULL OR p.designation_ar = '')");
      else if (missing_lang === 'en') conditions.push("(p.designation_en IS NULL OR p.designation_en = '')");
      else if (missing_lang === 'zh') conditions.push("(p.designation_zh IS NULL OR p.designation_zh = '')");
      else if (missing_lang === 'desc') conditions.push("(p.description IS NULL OR p.description = '')");
      else if (missing_lang === 'fiche') conditions.push("(p.fiche_technique IS NULL OR p.fiche_technique = '')");
    }

    const whereSql = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    // Count total
    const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM products p ${whereSql}`, params);
    const total = countRows[0]?.total || 0;

    // Fetch data
    const querySql = `
      SELECT p.*, b.id as b_id, b.nom as b_nom, c.nom as categorie_nom
      FROM products p
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN categories c ON p.categorie_id = c.id
      ${whereSql}
      ORDER BY p.id DESC
      LIMIT ? OFFSET ?
    `;
    
    // LIMIT/OFFSET must be integers
    const [rows] = await pool.query(querySql, [...params, limit, offset]);

    const products = rows.map((r) => ({
      id: r.id,
      reference: String(r.id),
      designation: r.designation,
      designation_ar: r.designation_ar,
      designation_en: r.designation_en,
      designation_zh: r.designation_zh,
      description: r.description,
      description_ar: r.description_ar || null,
      description_en: r.description_en || null,
      description_zh: r.description_zh || null,
      fiche_technique: r.fiche_technique,
      fiche_technique_ar: r.fiche_technique_ar || null,
      fiche_technique_en: r.fiche_technique_en || null,
      fiche_technique_zh: r.fiche_technique_zh || null,
      categorie: r.categorie_id ? { id: r.categorie_id, nom: r.categorie_nom } : undefined,
      brand: r.b_id ? { id: r.b_id, nom: r.b_nom } : undefined,
      image_url: r.image_url,
      has_variants: !!r.has_variants,
    }));

    res.json({
      data: products,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    next(err);
  }
});

// GET /products/with-snapshots — returns products with snapshot entries expanded
// Each snapshot becomes a separate selectable entry (including qty <= 0)
// Used by BonFormModal for Sortie/Comptant/Avoir to select snapshot-based stock
router.get('/with-snapshots', async (req, res, next) => {
  try {
    await ensureProductsColumns();
    const useSnapshot = await hasProductSnapshotTable();
    if (!useSnapshot) {
      // Fallback: just return normal product list without snapshot expansion
      const [rows] = await pool.query(
        `SELECT p.id, p.designation, p.prix_achat, p.prix_vente, p.cout_revient,
                p.cout_revient_pourcentage, p.prix_gros, p.prix_gros_pourcentage,
                p.prix_vente_pourcentage, p.quantite, p.est_service, p.image_url,
                p.kg, p.base_unit, p.has_variants, p.is_obligatoire_variant,
                p.remise_client, p.remise_artisan
         FROM products p WHERE COALESCE(p.is_deleted, 0) = 0 ORDER BY p.id DESC`
      );
      return res.json(rows.map(r => ({
        ...r,
        reference: String(r.id),
        snapshot_id: null,
        snapshot_quantite: null,
        snapshot_prix_achat: null,
        snapshot_label: null,
        variants: [],
        units: [],
      })));
    }

    const hasEnValidation = await hasProductSnapshotEnValidationColumn();

    // Get all snapshots (including qty <= 0), joined with product info
    const [snapRows] = await pool.query(`
      SELECT
        ps.id AS snapshot_id,
        ps.product_id,
        ps.variant_id,
        ${hasEnValidation ? 'ps.en_validation' : '1'} AS snapshot_en_validation,
        ps.prix_achat AS snapshot_prix_achat,
        ps.prix_vente AS snapshot_prix_vente,
        ps.cout_revient AS snapshot_cout_revient,
        ps.cout_revient_pourcentage AS snapshot_cout_revient_pourcentage,
        ps.prix_gros AS snapshot_prix_gros,
        ps.prix_gros_pourcentage AS snapshot_prix_gros_pourcentage,
        ps.prix_vente_pourcentage AS snapshot_prix_vente_pourcentage,
        ps.quantite AS snapshot_quantite,
        ps.bon_commande_id,
        ps.created_at AS snapshot_created_at,
        p.designation,
        p.image_url,
        p.est_service,
        p.kg,
        p.base_unit,
        p.has_variants,
        p.is_obligatoire_variant,
        p.remise_client,
        p.remise_artisan,
        pv.variant_name,
        pv.prix_achat AS variant_prix_achat,
        pv.prix_vente AS variant_prix_vente
      FROM product_snapshot ps
      JOIN products p ON p.id = ps.product_id
      LEFT JOIN product_variants pv ON pv.id = ps.variant_id
      WHERE COALESCE(p.is_deleted, 0) = 0
      ORDER BY p.id ASC, ps.created_at ASC, ps.id ASC
    `);

    // Also get all products (for items that don't have snapshots, or services)
    const [allProducts] = await pool.query(`
      SELECT p.id, p.designation, p.prix_achat, p.prix_vente, p.cout_revient,
             p.cout_revient_pourcentage, p.prix_gros, p.prix_gros_pourcentage,
             p.prix_vente_pourcentage, p.quantite, p.est_service, p.image_url,
             p.kg, p.base_unit, p.has_variants, p.is_obligatoire_variant,
             p.remise_client, p.remise_artisan,
             (SELECT JSON_ARRAYAGG(JSON_OBJECT(
               'id', pv2.id, 'variant_name', pv2.variant_name,
               'prix_achat', pv2.prix_achat, 'prix_vente', pv2.prix_vente,
               'stock_quantity', pv2.stock_quantity
             )) FROM product_variants pv2 WHERE pv2.product_id = p.id) AS variants,
             (SELECT JSON_ARRAYAGG(JSON_OBJECT(
               'id', pu.id, 'unit_name', pu.unit_name,
               'conversion_factor', pu.conversion_factor,
               'prix_vente', pu.prix_vente,
               'facteur_isNormal', pu.facteur_isNormal,
               'is_default', pu.is_default
             )) FROM product_units pu WHERE pu.product_id = p.id) AS units
      FROM products p
      WHERE COALESCE(p.is_deleted, 0) = 0
      ORDER BY p.id DESC
    `);

    // Build result: products that have snapshots get one entry per snapshot
    // Products without snapshots (e.g. services) get a single entry
    const productIdsWithSnapshots = new Set(snapRows.map(s => s.product_id));

    const result = [];

    // FIFO priority counters per product+variant
    const fifoCounts = new Map(); // key "productId:variantId" -> counter

    // Add snapshot entries
    for (const snap of snapRows) {
      const bonLabel = snap.bon_commande_id ? `Bon #${snap.bon_commande_id}` : `Snap #${snap.snapshot_id}`;
      const variantLabel = snap.variant_name ? ` - ${snap.variant_name}` : '';

      // Compute FIFO priority: 1 = oldest (should be used first)
      const fifoKey = `${snap.product_id}:${snap.variant_id || 0}`;
      const fifoNum = (fifoCounts.get(fifoKey) || 0) + 1;
      fifoCounts.set(fifoKey, fifoNum);

      result.push({
        id: snap.product_id,
        reference: String(snap.product_id),
        designation: snap.designation,
        variant_id: snap.variant_id || null,
        variant_name: snap.variant_name || null,
        snapshot_id: snap.snapshot_id,
        snapshot_en_validation: Number(snap.snapshot_en_validation ?? 1),
        snapshot_quantite: Number(snap.snapshot_quantite),
        snapshot_prix_achat: snap.snapshot_prix_achat !== null ? Number(snap.snapshot_prix_achat) : null,
        snapshot_prix_vente: snap.snapshot_prix_vente !== null ? Number(snap.snapshot_prix_vente) : null,
        snapshot_cout_revient: snap.snapshot_cout_revient !== null ? Number(snap.snapshot_cout_revient) : null,
        snapshot_cout_revient_pourcentage: snap.snapshot_cout_revient_pourcentage !== null ? Number(snap.snapshot_cout_revient_pourcentage) : null,
        snapshot_prix_gros: snap.snapshot_prix_gros !== null ? Number(snap.snapshot_prix_gros) : null,
        snapshot_prix_gros_pourcentage: snap.snapshot_prix_gros_pourcentage !== null ? Number(snap.snapshot_prix_gros_pourcentage) : null,
        snapshot_prix_vente_pourcentage: snap.snapshot_prix_vente_pourcentage !== null ? Number(snap.snapshot_prix_vente_pourcentage) : null,
        snapshot_label: `${bonLabel}${variantLabel} (Qté: ${Number(snap.snapshot_quantite)})`,
        fifo_priority: fifoNum,
        bon_commande_id: snap.bon_commande_id,
        prix_achat: snap.snapshot_prix_achat !== null ? Number(snap.snapshot_prix_achat) : Number(snap.variant_prix_achat || 0),
        prix_vente: snap.snapshot_prix_vente !== null ? Number(snap.snapshot_prix_vente) : Number(snap.variant_prix_vente || 0),
        cout_revient: snap.snapshot_cout_revient !== null ? Number(snap.snapshot_cout_revient) : 0,
        cout_revient_pourcentage: snap.snapshot_cout_revient_pourcentage !== null ? Number(snap.snapshot_cout_revient_pourcentage) : 0,
        prix_gros: snap.snapshot_prix_gros !== null ? Number(snap.snapshot_prix_gros) : 0,
        prix_gros_pourcentage: snap.snapshot_prix_gros_pourcentage !== null ? Number(snap.snapshot_prix_gros_pourcentage) : 0,
        prix_vente_pourcentage: snap.snapshot_prix_vente_pourcentage !== null ? Number(snap.snapshot_prix_vente_pourcentage) : 0,
        quantite: Number(snap.snapshot_quantite),
        est_service: !!snap.est_service,
        image_url: snap.image_url,
        kg: snap.kg !== null ? Number(snap.kg) : null,
        base_unit: snap.base_unit,
        has_variants: !!snap.has_variants,
        isObligatoireVariant: !!snap.is_obligatoire_variant,
        remise_client: Number(snap.remise_client ?? 0),
        remise_artisan: Number(snap.remise_artisan ?? 0),
        variants: [],
        units: [],
      });
    }

    // Add products without snapshots (services, or products that were never purchased via bon de commande)
    for (const p of allProducts) {
      if (productIdsWithSnapshots.has(p.id)) continue; // Skip: already represented via snapshots
      const variants = typeof p.variants === 'string' ? JSON.parse(p.variants) : (p.variants || []);
      const units = typeof p.units === 'string' ? JSON.parse(p.units) : (p.units || []);
      result.push({
        id: p.id,
        reference: String(p.id),
        designation: p.designation,
        variant_id: null,
        variant_name: null,
        snapshot_id: null,
        snapshot_quantite: null,
        snapshot_prix_achat: null,
        snapshot_prix_vente: null,
        snapshot_label: null,
        bon_commande_id: null,
        prix_achat: Number(p.prix_achat || 0),
        prix_vente: Number(p.prix_vente || 0),
        cout_revient: Number(p.cout_revient || 0),
        cout_revient_pourcentage: Number(p.cout_revient_pourcentage || 0),
        prix_gros: Number(p.prix_gros || 0),
        prix_gros_pourcentage: Number(p.prix_gros_pourcentage || 0),
        prix_vente_pourcentage: Number(p.prix_vente_pourcentage || 0),
        quantite: Number(p.quantite),
        est_service: !!p.est_service,
        image_url: p.image_url,
        kg: p.kg !== null ? Number(p.kg) : null,
        base_unit: p.base_unit,
        has_variants: !!p.has_variants,
        isObligatoireVariant: !!p.is_obligatoire_variant,
        remise_client: Number(p.remise_client ?? 0),
        remise_artisan: Number(p.remise_artisan ?? 0),
        variants: Array.isArray(variants) ? variants : [],
        units: Array.isArray(units) ? units : [],
      });
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    await ensureProductsColumns();

    const useSnapshot = await hasProductSnapshotTable();
    const sql = useSnapshot ? `
      SELECT p.*, b.id as b_id, b.nom as b_nom, b.image_url as b_image_url,
      (SELECT COALESCE(SUM(ps.quantite), 0)
         FROM product_snapshot ps
        WHERE ps.product_id = p.id) as snapshot_quantite_total,
      (SELECT ps2.prix_achat
         FROM product_snapshot ps2
        WHERE ps2.product_id = p.id
          AND ps2.quantite > 0
          AND COALESCE(ps2.prix_achat, 0) > 0
        ORDER BY ps2.created_at ASC, ps2.id ASC
        LIMIT 1) as snapshot_prix_achat_old,
      (SELECT ps2.prix_vente
         FROM product_snapshot ps2
        WHERE ps2.product_id = p.id
          AND ps2.quantite > 0
          AND COALESCE(ps2.prix_vente, 0) > 0
        ORDER BY ps2.created_at ASC, ps2.id ASC
        LIMIT 1) as snapshot_prix_vente_old,
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
        'stock_quantity', pv.stock_quantity,
        'snapshot_quantite_total', (SELECT COALESCE(SUM(psv.quantite), 0)
           FROM product_snapshot psv
          WHERE psv.variant_id = pv.id),
        'snapshot_prix_achat_old', (SELECT ps3.prix_achat
           FROM product_snapshot ps3
          WHERE ps3.variant_id = pv.id
            AND ps3.quantite > 0
            AND COALESCE(ps3.prix_achat, 0) > 0
          ORDER BY ps3.created_at ASC, ps3.id ASC
          LIMIT 1),
        'snapshot_prix_vente_old', (SELECT ps3.prix_vente
           FROM product_snapshot ps3
          WHERE ps3.variant_id = pv.id
            AND ps3.quantite > 0
            AND COALESCE(ps3.prix_vente, 0) > 0
          ORDER BY ps3.created_at ASC, ps3.id ASC
          LIMIT 1)
      )) FROM product_variants pv WHERE pv.product_id = p.id) as variants,
      (SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'id', pu.id,
        'unit_name', pu.unit_name,
        'conversion_factor', pu.conversion_factor,
        'prix_vente', pu.prix_vente,
        'facteur_isNormal', pu.facteur_isNormal,
        'is_default', pu.is_default
      )) FROM product_units pu WHERE pu.product_id = p.id) as units,
      c.nom as categorie_nom
      FROM products p
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN categories c ON p.categorie_id = c.id
      WHERE COALESCE(p.is_deleted, 0) = 0
      ORDER BY p.id DESC
    ` : `
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
        'facteur_isNormal', pu.facteur_isNormal,
        'is_default', pu.is_default
      )) FROM product_units pu WHERE pu.product_id = p.id) as units,
      c.nom as categorie_nom
      FROM products p
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN categories c ON p.categorie_id = c.id
      WHERE COALESCE(p.is_deleted, 0) = 0
      ORDER BY p.id DESC
    `;

    const [rows] = await pool.query(sql);
    const data = rows.map((r) => {
      const gallery = typeof r.gallery === 'string' ? JSON.parse(r.gallery) : (r.gallery || []);
      const variants = typeof r.variants === 'string' ? JSON.parse(r.variants) : (r.variants || []);
      const variantsWithSnapshot = Array.isArray(variants) ? variants.map((v) => ({
        ...v,
        snapshot_quantite_total: v?.snapshot_quantite_total !== null && v?.snapshot_quantite_total !== undefined ? Number(v.snapshot_quantite_total) : null,
        snapshot_prix_achat_old: v?.snapshot_prix_achat_old !== null && v?.snapshot_prix_achat_old !== undefined ? Number(v.snapshot_prix_achat_old) : null,
        snapshot_prix_vente_old: v?.snapshot_prix_vente_old !== null && v?.snapshot_prix_vente_old !== undefined ? Number(v.snapshot_prix_vente_old) : null,
      })) : [];
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
        snapshot_quantite_total: useSnapshot ? Number(r.snapshot_quantite_total ?? 0) : null,
        kg: r.kg !== null && r.kg !== undefined ? Number(r.kg) : null,
        prix_achat: Number(r.prix_achat),
        snapshot_prix_achat_old: useSnapshot && r.snapshot_prix_achat_old !== null && r.snapshot_prix_achat_old !== undefined ? Number(r.snapshot_prix_achat_old) : null,
        cout_revient_pourcentage: Number(r.cout_revient_pourcentage),
        cout_revient: Number(r.cout_revient),
        prix_gros_pourcentage: Number(r.prix_gros_pourcentage),
        prix_gros: Number(r.prix_gros),
        prix_vente_pourcentage: Number(r.prix_vente_pourcentage),
        prix_vente: Number(r.prix_vente),
        snapshot_prix_vente_old: useSnapshot && r.snapshot_prix_vente_old !== null && r.snapshot_prix_vente_old !== undefined ? Number(r.snapshot_prix_vente_old) : null,
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
        isObligatoireVariant: !!r.is_obligatoire_variant,
        base_unit: r.base_unit,
        categorie_base: r.categorie_base,
        variants: variantsWithSnapshot,
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

// ---------------------------------------------------------------------
// Products Translations (server-side search + pagination)
// GET /api/products/translations?q=&page=&limit=
// GET /api/products/translations/:id
// ---------------------------------------------------------------------
const clampInt = (v, fallback, min, max) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return Math.max(min, Math.min(max, i));
};

router.get('/translations', async (req, res, next) => {
  try {
    await ensureProductsColumns();

    const qRaw = String(req.query.q ?? '').trim();
    const q = qRaw.length > 100 ? qRaw.slice(0, 100) : qRaw;
    const page = clampInt(req.query.page, 1, 1, 1000000);
    const limit = clampInt(req.query.limit, 30, 5, 200);
    const offset = (page - 1) * limit;

    const qLike = `%${q}%`;
    const qNum = Number(q);
    const hasNumeric = q !== '' && Number.isFinite(qNum);

    const where = [
      'COALESCE(p.is_deleted, 0) = 0',
      'COALESCE(p.est_service, 0) = 0',
    ];
    const params = [];

    if (q) {
      where.push(
        `(
          ${hasNumeric ? 'p.id = ? OR' : ''}
          p.designation LIKE ? OR p.designation_en LIKE ? OR p.designation_ar LIKE ? OR p.designation_zh LIKE ?
        )`
      );
      if (hasNumeric) params.push(qNum);
      params.push(qLike, qLike, qLike, qLike);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM products p ${whereSql}`,
      params
    );
    const total = Number(countRows?.[0]?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const [rows] = await pool.query(
      `
        SELECT p.id, p.designation, p.designation_en, p.designation_ar, p.designation_zh
        FROM products p
        ${whereSql}
        ORDER BY p.id DESC
        LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    res.json({
      page,
      limit,
      total,
      totalPages,
      items: rows,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/translations/:id', async (req, res, next) => {
  try {
    await ensureProductsColumns();
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'ID invalide' });

    const [rows] = await pool.query(
      `
        SELECT
          p.id,
          p.designation, p.designation_en, p.designation_ar, p.designation_zh,
          p.description, p.description_en, p.description_ar, p.description_zh,
          p.fiche_technique, p.fiche_technique_en, p.fiche_technique_ar, p.fiche_technique_zh,
          p.est_service, COALESCE(p.is_deleted,0) as is_deleted
        FROM products p
        WHERE p.id = ?
        LIMIT 1
      `,
      [id]
    );

    const r = rows?.[0];
    if (!r || Number(r.is_deleted) === 1) return res.status(404).json({ message: 'Produit introuvable' });

    res.json({
      ...r,
      est_service: !!r.est_service,
    });
  } catch (err) {
    next(err);
  }
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

    const useSnapshot = await hasProductSnapshotTable();

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

    // Snapshot finance (optional)
    let snapshot_finance = null;
    let snapshot_quantite_total = null;
    let snapshot_rows = null;
    let variantSnapshotFinanceById = {};
    let variantSnapshotTotalById = {};
    let variantSnapshotRowsById = {};
    if (useSnapshot) {
      try {
        const [totRows] = await pool.query(
          `SELECT COALESCE(SUM(ps.quantite), 0) AS total
           FROM product_snapshot ps
           WHERE ps.product_id = ?`,
          [id]
        );
        snapshot_quantite_total = Number(totRows?.[0]?.total ?? 0);

        const [pSnaps] = await pool.query(
          `SELECT ps.id, ps.prix_achat, ps.prix_vente,
                  ps.cout_revient, ps.cout_revient_pourcentage,
                  ps.prix_gros, ps.prix_gros_pourcentage,
                  ps.prix_vente_pourcentage,
                  ps.quantite, ps.bon_commande_id, ps.created_at
           FROM product_snapshot ps
           WHERE ps.product_id = ?
             AND ps.variant_id IS NULL
           ORDER BY ps.created_at DESC, ps.id DESC`,
          [id]
        );
        snapshot_rows = (pSnaps || []).map((s) => ({
          id: Number(s.id),
          prix_achat: s.prix_achat === null || s.prix_achat === undefined ? null : Number(s.prix_achat),
          prix_vente: s.prix_vente === null || s.prix_vente === undefined ? null : Number(s.prix_vente),
          cout_revient: s.cout_revient === null || s.cout_revient === undefined ? null : Number(s.cout_revient),
          cout_revient_pourcentage: s.cout_revient_pourcentage === null || s.cout_revient_pourcentage === undefined ? null : Number(s.cout_revient_pourcentage),
          prix_gros: s.prix_gros === null || s.prix_gros === undefined ? null : Number(s.prix_gros),
          prix_gros_pourcentage: s.prix_gros_pourcentage === null || s.prix_gros_pourcentage === undefined ? null : Number(s.prix_gros_pourcentage),
          prix_vente_pourcentage: s.prix_vente_pourcentage === null || s.prix_vente_pourcentage === undefined ? null : Number(s.prix_vente_pourcentage),
          quantite: Number(s.quantite ?? 0),
          bon_commande_id: s.bon_commande_id ?? null,
          created_at: s.created_at,
        }));

        const [oldRows] = await pool.query(
          `SELECT ps.id, ps.prix_achat, ps.prix_vente, ps.quantite, ps.bon_commande_id, ps.created_at
           FROM product_snapshot ps
           WHERE ps.product_id = ?
             AND ps.variant_id IS NULL
             AND ps.quantite > 0
           ORDER BY ps.created_at ASC, ps.id ASC
           LIMIT 1`,
          [id]
        );
        const [newRows] = await pool.query(
          `SELECT ps.id, ps.prix_achat, ps.prix_vente, ps.quantite, ps.bon_commande_id, ps.created_at
           FROM product_snapshot ps
           WHERE ps.product_id = ?
             AND ps.variant_id IS NULL
             AND ps.quantite > 0
           ORDER BY ps.created_at DESC, ps.id DESC
           LIMIT 1`,
          [id]
        );

        const oldest = oldRows?.[0] || null;
        const newest = newRows?.[0] || null;
        snapshot_finance = {
          oldest: oldest
            ? {
                id: Number(oldest.id),
                prix_achat: oldest.prix_achat === null || oldest.prix_achat === undefined ? null : Number(oldest.prix_achat),
                prix_vente: oldest.prix_vente === null || oldest.prix_vente === undefined ? null : Number(oldest.prix_vente),
                quantite: Number(oldest.quantite ?? 0),
                bon_commande_id: oldest.bon_commande_id ?? null,
                created_at: oldest.created_at,
              }
            : null,
          newest: newest
            ? {
                id: Number(newest.id),
                prix_achat: newest.prix_achat === null || newest.prix_achat === undefined ? null : Number(newest.prix_achat),
                prix_vente: newest.prix_vente === null || newest.prix_vente === undefined ? null : Number(newest.prix_vente),
                quantite: Number(newest.quantite ?? 0),
                bon_commande_id: newest.bon_commande_id ?? null,
                created_at: newest.created_at,
              }
            : null,
        };

        if (variantIds.length > 0) {
          const [vtot] = await pool.query(
            `SELECT ps.variant_id, COALESCE(SUM(ps.quantite), 0) AS total
             FROM product_snapshot ps
             WHERE ps.variant_id IN (?)
             GROUP BY ps.variant_id`,
            [variantIds]
          );
          for (const row of vtot) {
            variantSnapshotTotalById[row.variant_id] = Number(row.total ?? 0);
          }

          const [vsnapsAsc] = await pool.query(
            `SELECT ps.id, ps.variant_id, ps.prix_achat, ps.prix_vente,
                    ps.cout_revient, ps.cout_revient_pourcentage,
                    ps.prix_gros, ps.prix_gros_pourcentage,
                    ps.prix_vente_pourcentage,
                    ps.quantite, ps.bon_commande_id, ps.created_at
             FROM product_snapshot ps
             WHERE ps.variant_id IN (?)
             ORDER BY ps.variant_id ASC, ps.created_at ASC, ps.id ASC`,
            [variantIds]
          );

          // oldest/newest + collect list
          for (const row of vsnapsAsc) {
            const vid = row.variant_id;
            if (!variantSnapshotRowsById[vid]) variantSnapshotRowsById[vid] = [];
            // push later in DESC order; we collect then reverse per-variant after loop
            variantSnapshotRowsById[vid].push({
              id: Number(row.id),
              prix_achat: row.prix_achat === null || row.prix_achat === undefined ? null : Number(row.prix_achat),
              prix_vente: row.prix_vente === null || row.prix_vente === undefined ? null : Number(row.prix_vente),
              cout_revient: row.cout_revient === null || row.cout_revient === undefined ? null : Number(row.cout_revient),
              cout_revient_pourcentage: row.cout_revient_pourcentage === null || row.cout_revient_pourcentage === undefined ? null : Number(row.cout_revient_pourcentage),
              prix_gros: row.prix_gros === null || row.prix_gros === undefined ? null : Number(row.prix_gros),
              prix_gros_pourcentage: row.prix_gros_pourcentage === null || row.prix_gros_pourcentage === undefined ? null : Number(row.prix_gros_pourcentage),
              prix_vente_pourcentage: row.prix_vente_pourcentage === null || row.prix_vente_pourcentage === undefined ? null : Number(row.prix_vente_pourcentage),
              quantite: Number(row.quantite ?? 0),
              bon_commande_id: row.bon_commande_id ?? null,
              created_at: row.created_at,
            });

            if (!variantSnapshotFinanceById[vid]) {
              variantSnapshotFinanceById[vid] = { oldest: null, newest: null };
              variantSnapshotFinanceById[vid].oldest = {
                id: Number(row.id),
                prix_achat: row.prix_achat === null || row.prix_achat === undefined ? null : Number(row.prix_achat),
                prix_vente: row.prix_vente === null || row.prix_vente === undefined ? null : Number(row.prix_vente),
                quantite: Number(row.quantite ?? 0),
                bon_commande_id: row.bon_commande_id ?? null,
                created_at: row.created_at,
              };
            }
            variantSnapshotFinanceById[vid].newest = {
              id: Number(row.id),
              prix_achat: row.prix_achat === null || row.prix_achat === undefined ? null : Number(row.prix_achat),
              prix_vente: row.prix_vente === null || row.prix_vente === undefined ? null : Number(row.prix_vente),
              quantite: Number(row.quantite ?? 0),
              bon_commande_id: row.bon_commande_id ?? null,
              created_at: row.created_at,
            };
          }

          // convert variant rows to DESC per variant for UI
          for (const vid of Object.keys(variantSnapshotRowsById)) {
            variantSnapshotRowsById[vid] = (variantSnapshotRowsById[vid] || []).slice().sort((a, b) => {
              const da = new Date(a.created_at).getTime();
              const db = new Date(b.created_at).getTime();
              if (da !== db) return db - da;
              return Number(b.id) - Number(a.id);
            });
          }
        }
      } catch {
        snapshot_finance = null;
        snapshot_quantite_total = null;
        snapshot_rows = null;
        variantSnapshotFinanceById = {};
        variantSnapshotTotalById = {};
        variantSnapshotRowsById = {};
      }
    }

    const finalCategories = r.c_id ? [{ id: r.c_id, nom: r.c_nom }] : [];

    res.json({
      id: r.id,
      reference: String(r.id),
      designation: r.designation,
      designation_ar: r.designation_ar,
      designation_en: r.designation_en,
      designation_zh: r.designation_zh,
      categorie_id: r.categorie_id || 0,
      categorie: r.c_id ? { id: r.c_id, nom: r.c_nom } : undefined,
      categories: finalCategories,
      brand_id: r.brand_id ?? null,
      brand: r.b_id ? { id: r.b_id, nom: r.b_nom, image_url: r.b_image_url } : undefined,
      quantite: Number(r.quantite),
      snapshot_quantite_total,
      snapshot_finance,
      snapshot_rows,
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
      stock_partage_ecom_qty: Number(r.stock_partage_ecom_qty ?? 0),
      created_by: r.created_by,
      updated_by: r.updated_by,
      created_at: r.created_at,
      updated_at: r.updated_at,
      has_variants: !!r.has_variants,
      isObligatoireVariant: !!r.is_obligatoire_variant,
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
        snapshot_quantite_total: useSnapshot ? Number(variantSnapshotTotalById[v.id] ?? 0) : null,
        snapshot_finance: useSnapshot ? (variantSnapshotFinanceById[v.id] || null) : null,
        snapshot_rows: useSnapshot ? (variantSnapshotRowsById[v.id] || []) : null,
        gallery: variantGalleriesById[v.id] || []
      })),
      units: units.map(u => ({
        ...u,
        conversion_factor: Number(u.conversion_factor),
        prix_vente: u.prix_vente === null || u.prix_vente === undefined ? null : Number(u.prix_vente),
        facteur_isNormal: u.facteur_isNormal === null || u.facteur_isNormal === undefined ? 1 : Number(u.facteur_isNormal) ? 1 : 0,
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

    const obligVarRaw = req.body?.isObligatoireVariant ?? req.body?.is_obligatoire_variant;
    const isObligatoireVariant = obligVarRaw === 'true' || obligVarRaw === true || obligVarRaw === '1' || obligVarRaw === 1;
    const isObligatoireVariantEffective = isHasVariants ? isObligatoireVariant : false;

    const totalQuantite = Number(isService ? 0 : (quantite ?? 0));
    const shareQty = Number(req.body?.stock_partage_ecom_qty ?? 0);
    if (shareQty > totalQuantite) {
      return res.status(400).json({ message: 'La quantité partagée ne peut pas dépasser la quantité totale' });
    }

    const cr = pa * (1 + crp / 100);
    const pg = pa * (1 + pgp / 100);
    const pv = pa * (1 + pvp / 100);

    // Variant pricing rule:
    // If product has exactly one unit and that unit is manual (facteur_isNormal=0),
    // force variants to have the same selling price as the product's effective unit price.
    let parsedUnitsForInsert = null;
    if (units) {
      try {
        const parsed = typeof units === 'string' ? JSON.parse(units) : units;
        if (Array.isArray(parsed)) parsedUnitsForInsert = parsed;
      } catch { }
    }

    const lockVariantPrixVente =
      Array.isArray(parsedUnitsForInsert) &&
      parsedUnitsForInsert.length === 1 &&
      Number(parsedUnitsForInsert?.[0]?.facteur_isNormal ?? 1) === 0;

    let lockedVariantPrixVente = null;
    if (lockVariantPrixVente) {
      const u0 = parsedUnitsForInsert?.[0] || {};
      const pvRaw = u0?.prix_vente;
      const pvNum = pvRaw === '' || pvRaw === null || pvRaw === undefined ? null : Number(pvRaw);
      const pvVal = pvNum !== null && Number.isFinite(pvNum) ? pvNum : null;
      const conv = Number(u0?.conversion_factor ?? 1);
      const convVal = Number.isFinite(conv) && conv > 0 ? conv : 1;
      lockedVariantPrixVente = pvVal !== null ? pvVal : (pv * convVal);
    }

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
      (designation, designation_ar, designation_en, designation_zh, categorie_id, brand_id, quantite, kg, prix_achat, cout_revient_pourcentage, cout_revient, prix_gros_pourcentage, prix_gros, prix_vente_pourcentage, prix_vente, remise_client, remise_artisan, est_service, image_url, fiche_technique, fiche_technique_ar, fiche_technique_en, fiche_technique_zh, description, description_ar, description_en, description_zh, pourcentage_promo, ecom_published, stock_partage_ecom, stock_partage_ecom_qty, has_variants, is_obligatoire_variant, base_unit, categorie_base, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        isObligatoireVariantEffective ? 1 : 0,
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
      try { parsed = typeof variants === 'string' ? JSON.parse(variants) : variants; } catch { }
      if (Array.isArray(parsed)) {
        // Ensure multilingual columns exist (created lazily).
        {
          const cols = ['variant_name_ar', 'variant_name_en', 'variant_name_zh'];
          for (const col of cols) {
            const [rows] = await pool.query(
              `SELECT COLUMN_NAME FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants' AND COLUMN_NAME = ?`,
              [col]
            );
            if (!rows?.length) {
              await pool.query(`ALTER TABLE product_variants ADD COLUMN ${col} VARCHAR(255) NULL`);
            }
          }
        }

        for (const v of parsed) {
          const variantPrixVentePourcentage = lockVariantPrixVente ? 0 : Number(v.prix_vente_pourcentage ?? 0);
          const variantPrixVente = lockVariantPrixVente
            ? Number(lockedVariantPrixVente ?? 0)
            : Number(v.prix_vente ?? 0);
          await pool.query(
            `INSERT INTO product_variants (
                  product_id,
                  variant_name, variant_name_ar, variant_name_en, variant_name_zh,
                  variant_type, reference,
                  prix_achat, cout_revient, cout_revient_pourcentage,
                  prix_gros, prix_gros_pourcentage,
                  prix_vente_pourcentage, prix_vente,
                  remise_client, remise_artisan, stock_quantity,
                  created_at, updated_at
                )
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
            [
              id,
              v.variant_name,
              v.variant_name_ar || null,
              v.variant_name_en || null,
              v.variant_name_zh || null,
              v.variant_type || 'Autre',
              v.reference,
              Number(v.prix_achat ?? 0),
              Number(v.cout_revient ?? 0),
              Number(v.cout_revient_pourcentage ?? 0),
              Number(v.prix_gros ?? 0),
              Number(v.prix_gros_pourcentage ?? 0),
              variantPrixVentePourcentage,
              variantPrixVente,
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
    if (Array.isArray(parsedUnitsForInsert)) {
      for (const u of parsedUnitsForInsert) {
        const pvRaw = u?.prix_vente;
        const pvNum = pvRaw === '' || pvRaw === null || pvRaw === undefined ? null : Number(pvRaw);
        const pvVal = pvNum !== null && Number.isFinite(pvNum) ? pvNum : null;
        // Normalize flag: presence of an explicit unit selling price => manual override (0), otherwise auto (1).
        const facteur_isNormal = pvVal === null ? 1 : 0;
        await pool.query(
          `INSERT INTO product_units (product_id, unit_name, conversion_factor, prix_vente, facteur_isNormal, is_default, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, u.unit_name, Number(u.conversion_factor), pvVal, facteur_isNormal, u.is_default ? 1 : 0, now, now]
        );
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
        prix_vente: u.prix_vente === null || u.prix_vente === undefined ? null : Number(u.prix_vente),
        facteur_isNormal: u.facteur_isNormal === null || u.facteur_isNormal === undefined ? 1 : Number(u.facteur_isNormal) ? 1 : 0,
        is_default: !!u.is_default,
      })),
    });
  } catch (err) { next(err); }
});

// Update a product (basic fields + optional image/gallery). Variants/units are synced if provided.
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
      is_obligatoire_variant,
      base_unit,
      categorie_base,
      fiche_technique,
      fiche_technique_ar,
      fiche_technique_en,
      fiche_technique_zh,
      variants: variantsJson,
      units: unitsJson,
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

    const obligVarRaw = req.body?.isObligatoireVariant ?? is_obligatoire_variant;
    const isObligatoireVariant = (obligVarRaw !== undefined)
      ? (obligVarRaw === 'true' || obligVarRaw === true || obligVarRaw === '1' || obligVarRaw === 1)
      : !!existing.is_obligatoire_variant;

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

    // Variant pricing rule:
    // If (desired OR current) units are exactly 1 and it's manual (facteur_isNormal=0),
    // force variants prix_vente to the product effective unit price.
    const computeVariantPriceLock = (unitsArr) => {
      if (!Array.isArray(unitsArr) || unitsArr.length !== 1) return { lock: false, forcedPrixVente: null };
      const u0 = unitsArr[0] || {};
      const flag = Number(u0?.facteur_isNormal ?? 1);
      const pvRaw = u0?.prix_vente;
      const pvNum = pvRaw === '' || pvRaw === null || pvRaw === undefined ? null : Number(pvRaw);
      const pvVal = pvNum !== null && Number.isFinite(pvNum) ? pvNum : null;
      const isManual = flag === 0;
      if (!isManual) return { lock: false, forcedPrixVente: null };
      const conv = Number(u0?.conversion_factor ?? 1);
      const convVal = Number.isFinite(conv) && conv > 0 ? conv : 1;
      const forced = pvVal !== null ? pvVal : (pv * convVal);
      return { lock: true, forcedPrixVente: forced };
    };

    let lockVariantPrixVente = false;
    let lockedVariantPrixVente = null;
    if (unitsJson !== undefined) {
      let parsedUnits = [];
      try { parsedUnits = typeof unitsJson === 'string' ? JSON.parse(unitsJson) : unitsJson; } catch { }
      const r = computeVariantPriceLock(parsedUnits);
      lockVariantPrixVente = r.lock;
      lockedVariantPrixVente = r.forcedPrixVente;
    } else {
      // No new units sent => decide based on current DB units
      const [dbUnits] = await pool.query(
        'SELECT prix_vente, facteur_isNormal, conversion_factor FROM product_units WHERE product_id = ? ORDER BY id ASC',
        [id]
      );
      const r = computeVariantPriceLock(dbUnits);
      lockVariantPrixVente = r.lock;
      lockedVariantPrixVente = r.forcedPrixVente;
    }

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
      is_obligatoire_variant: (isHasVariants && isObligatoireVariant) ? 1 : 0,
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

    // Variants + Units (optional sync) 
    // If the client sends these fields, treat them as the desired state and sync DB accordingly.
    if (variantsJson !== undefined) {
      let parsed = [];
      try { parsed = typeof variantsJson === 'string' ? JSON.parse(variantsJson) : variantsJson; } catch { }
      if (Array.isArray(parsed)) {
        // Ensure multilingual columns exist (created lazily).
        {
          const cols = ['variant_name_ar', 'variant_name_en', 'variant_name_zh'];
          for (const col of cols) {
            const [rows] = await pool.query(
              `SELECT COLUMN_NAME FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants' AND COLUMN_NAME = ?`,
              [col]
            );
            if (!rows?.length) {
              await pool.query(`ALTER TABLE product_variants ADD COLUMN ${col} VARCHAR(255) NULL`);
            }
          }
        }

        const desiredIds = parsed
          .map(v => Number(v?.id ?? 0))
          .filter(n => Number.isFinite(n) && n > 0);

        if (parsed.length === 0) {
          await pool.query('DELETE FROM product_variants WHERE product_id = ?', [id]);
        } else {
          if (desiredIds.length > 0) {
            await pool.query(
              'DELETE FROM product_variants WHERE product_id = ? AND id NOT IN (?)',
              [id, desiredIds]
            );
          } else {
            // All variants are new (no IDs) => replace any existing variants.
            await pool.query('DELETE FROM product_variants WHERE product_id = ?', [id]);
          }

          for (const v of parsed) {
            const variantId = Number(v?.id ?? 0);
            const variantPrixVentePourcentage = lockVariantPrixVente ? 0 : Number(v?.prix_vente_pourcentage ?? 0);
            const variantPrixVente = lockVariantPrixVente
              ? Number(lockedVariantPrixVente ?? 0)
              : Number(v?.prix_vente ?? 0);
            const payloadVals = [
              v?.variant_name,
              v?.variant_name_ar || null,
              v?.variant_name_en || null,
              v?.variant_name_zh || null,
              v?.variant_type || 'Autre',
              v?.reference,
              Number(v?.prix_achat ?? 0),
              Number(v?.cout_revient ?? 0),
              Number(v?.cout_revient_pourcentage ?? 0),
              Number(v?.prix_gros ?? 0),
              Number(v?.prix_gros_pourcentage ?? 0),
              variantPrixVentePourcentage,
              variantPrixVente,
              Number(v?.remise_client ?? 0),
              Number(v?.remise_artisan ?? 0),
              Number(v?.stock_quantity ?? 0),
            ];

            if (variantId && Number.isFinite(variantId)) {
              const [updated] = await pool.query(
                `UPDATE product_variants
                 SET variant_name = ?, variant_name_ar = ?, variant_name_en = ?, variant_name_zh = ?,
                     variant_type = ?, reference = ?,
                     prix_achat = ?, cout_revient = ?, cout_revient_pourcentage = ?,
                     prix_gros = ?, prix_gros_pourcentage = ?,
                     prix_vente_pourcentage = ?, prix_vente = ?,
                     remise_client = ?, remise_artisan = ?, stock_quantity = ?,
                     updated_at = ?
                 WHERE id = ? AND product_id = ?`,
                [...payloadVals, now, variantId, id]
              );

              // If the provided ID doesn't belong to this product, fall back to insert.
              if (!(updated && updated.affectedRows > 0)) {
                await pool.query(
                  `INSERT INTO product_variants (
                    product_id,
                    variant_name, variant_name_ar, variant_name_en, variant_name_zh,
                    variant_type, reference,
                    prix_achat, cout_revient, cout_revient_pourcentage,
                    prix_gros, prix_gros_pourcentage,
                    prix_vente_pourcentage, prix_vente,
                    remise_client, remise_artisan, stock_quantity,
                    created_at, updated_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
                  [id, ...payloadVals, now, now]
                );
              }
            } else {
              await pool.query(
                `INSERT INTO product_variants (
                  product_id,
                  variant_name, variant_name_ar, variant_name_en, variant_name_zh,
                  variant_type, reference,
                  prix_achat, cout_revient, cout_revient_pourcentage,
                  prix_gros, prix_gros_pourcentage,
                  prix_vente_pourcentage, prix_vente,
                  remise_client, remise_artisan, stock_quantity,
                  created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
                [id, ...payloadVals, now, now]
              );
            }
          }
        }
      }
    }

    if (unitsJson !== undefined) {
      let parsed = [];
      try { parsed = typeof unitsJson === 'string' ? JSON.parse(unitsJson) : unitsJson; } catch { }
      if (Array.isArray(parsed)) {
        const desiredIds = parsed
          .map(u => Number(u?.id ?? 0))
          .filter(n => Number.isFinite(n) && n > 0);

        if (parsed.length === 0) {
          await pool.query('DELETE FROM product_units WHERE product_id = ?', [id]);
        } else {
          if (desiredIds.length > 0) {
            await pool.query(
              'DELETE FROM product_units WHERE product_id = ? AND id NOT IN (?)',
              [id, desiredIds]
            );
          } else {
            await pool.query('DELETE FROM product_units WHERE product_id = ?', [id]);
          }

          for (const u of parsed) {
            const unitId = Number(u?.id ?? 0);
            const pvRaw = u?.prix_vente;
            const pvNum = pvRaw === '' || pvRaw === null || pvRaw === undefined ? null : Number(pvRaw);
            const pvVal = pvNum !== null && Number.isFinite(pvNum) ? pvNum : null;
            // Normalize flag: presence of an explicit unit selling price => manual override (0), otherwise auto (1).
            const facteur_isNormal = pvVal === null ? 1 : 0;
            const unitVals = [
              u?.unit_name,
              Number(u?.conversion_factor ?? 0),
              pvVal,
              facteur_isNormal,
              u?.is_default ? 1 : 0,
            ];

            if (unitId && Number.isFinite(unitId)) {
              const [updated] = await pool.query(
                `UPDATE product_units
                 SET unit_name = ?, conversion_factor = ?, prix_vente = ?, facteur_isNormal = ?, is_default = ?, updated_at = ?
                 WHERE id = ? AND product_id = ?`,
                [...unitVals, now, unitId, id]
              );
              if (!(updated && updated.affectedRows > 0)) {
                await pool.query(
                  `INSERT INTO product_units (product_id, unit_name, conversion_factor, prix_vente, facteur_isNormal, is_default, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                  [id, ...unitVals, now, now]
                );
              }
            } else {
              await pool.query(
                `INSERT INTO product_units (product_id, unit_name, conversion_factor, prix_vente, facteur_isNormal, is_default, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, ...unitVals, now, now]
              );
            }
          }
        }
      }
    }

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
        facteur_isNormal: u.facteur_isNormal === null || u.facteur_isNormal === undefined ? 1 : Number(u.facteur_isNormal) ? 1 : 0,
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
// Toggle ecom stock (checkbox from stock page)
// When enabled: ecom_published = 1, stock_partage_ecom = 1, stock_partage_ecom_qty = quantite (max stock)
// When disabled: ecom_published = 0, stock_partage_ecom = 0, stock_partage_ecom_qty = 0
router.patch('/:id/ecom-stock', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { enabled } = req.body;
    const [exists] = await pool.query('SELECT id, quantite FROM products WHERE id = ? AND is_deleted = 0', [id]);
    if (exists.length === 0) return res.status(404).json({ message: 'Produit introuvable' });

    const product = exists[0];
    const isEnabled = enabled === true || enabled === 'true' || enabled === 1 || enabled === '1';
    const shareQty = isEnabled ? Number(product.quantite || 0) : 0;
    const now = new Date();

    await pool.query(
      'UPDATE products SET ecom_published = ?, stock_partage_ecom = ?, stock_partage_ecom_qty = ?, updated_at = ? WHERE id = ?',
      [isEnabled ? 1 : 0, isEnabled ? 1 : 0, shareQty, now, id]
    );

    res.json({ id, ecom_published: isEnabled, stock_partage_ecom: isEnabled, stock_partage_ecom_qty: shareQty });
  } catch (err) { next(err); }
});

// PATCH /products/snapshots - Bulk update snapshot rows
router.patch('/snapshots', async (req, res, next) => {
  try {
    const { snapshots } = req.body || {};
    if (!Array.isArray(snapshots) || snapshots.length === 0) {
      return res.status(400).json({ message: 'snapshots array requis' });
    }

    const hasTable = await hasProductSnapshotTable();
    if (!hasTable) {
      return res.status(400).json({ message: 'Table product_snapshot introuvable' });
    }

    let updated = 0;
    for (const s of snapshots) {
      const id = Number(s.id);
      if (!Number.isFinite(id)) continue;

      const sets = [];
      const params = [];

      const fields = [
        'prix_achat', 'prix_vente',
        'cout_revient', 'cout_revient_pourcentage',
        'prix_gros', 'prix_gros_pourcentage',
        'prix_vente_pourcentage',
        'quantite',
      ];

      for (const f of fields) {
        if (s[f] !== undefined && s[f] !== null) {
          sets.push(`${f} = ?`);
          params.push(Number(s[f]));
        }
      }

      if (sets.length === 0) continue;

      params.push(id);
      await pool.query(
        `UPDATE product_snapshot SET ${sets.join(', ')} WHERE id = ?`,
        params
      );
      updated++;
    }

    res.json({ success: true, updated });
  } catch (err) { next(err); }
});

// ==================== VARIANT IMAGE ROUTES ====================

// POST /products/:id/variants/:variantId/image — Upload / replace variant main image
router.post('/:id/variants/:variantId/image', upload.single('image'), async (req, res, next) => {
  try {
    await ensureProductsColumns();
    const productId = Number(req.params.id);
    const variantId = Number(req.params.variantId);
    if (isNaN(productId) || isNaN(variantId)) {
      return res.status(400).json({ message: 'IDs invalides' });
    }

    // Verify the variant belongs to the product
    const [rows] = await pool.query(
      'SELECT * FROM product_variants WHERE id = ? AND product_id = ?',
      [variantId, productId]
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'Variante introuvable pour ce produit' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Aucune image fournie' });
    }

    const imageUrl = `/uploads/products/${req.file.filename}`;

    // Delete old image file if exists
    const oldImageUrl = rows[0].image_url;
    if (oldImageUrl) {
      const oldPath = path.join(__dirname, '..', oldImageUrl);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    await pool.query('UPDATE product_variants SET image_url = ? WHERE id = ?', [imageUrl, variantId]);

    res.json({ success: true, image_url: imageUrl });
  } catch (err) { next(err); }
});

// PUT /products/:id/variants/:variantId/gallery — Upload new gallery images & delete specified ones
router.put('/:id/variants/:variantId/gallery', upload.array('gallery', 10), async (req, res, next) => {
  try {
    await ensureProductsColumns();
    const productId = Number(req.params.id);
    const variantId = Number(req.params.variantId);
    if (isNaN(productId) || isNaN(variantId)) {
      return res.status(400).json({ message: 'IDs invalides' });
    }

    // Verify the variant belongs to the product
    const [rows] = await pool.query(
      'SELECT * FROM product_variants WHERE id = ? AND product_id = ?',
      [variantId, productId]
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'Variante introuvable pour ce produit' });
    }

    // Handle deletions
    const deletedIdsRaw = req.body?.deleted_gallery_ids;
    if (deletedIdsRaw) {
      let deletedIds;
      try { deletedIds = JSON.parse(deletedIdsRaw); } catch { deletedIds = []; }
      if (Array.isArray(deletedIds) && deletedIds.length > 0) {
        const [oldImages] = await pool.query(
          'SELECT id, image_url FROM variant_images WHERE id IN (?) AND variant_id = ?',
          [deletedIds, variantId]
        );
        for (const img of oldImages) {
          const filePath = path.join(__dirname, '..', img.image_url);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        await pool.query('DELETE FROM variant_images WHERE id IN (?) AND variant_id = ?', [deletedIds, variantId]);
      }
    }

    // Handle new gallery uploads
    const files = req.files || [];
    const [maxPos] = await pool.query(
      'SELECT COALESCE(MAX(position), 0) AS maxPos FROM variant_images WHERE variant_id = ?',
      [variantId]
    );
    let pos = (maxPos[0]?.maxPos || 0) + 1;

    const inserted = [];
    for (const f of files) {
      const imageUrl = `/uploads/products/${f.filename}`;
      const [result] = await pool.query(
        'INSERT INTO variant_images (variant_id, image_url, position) VALUES (?, ?, ?)',
        [variantId, imageUrl, pos++]
      );
      inserted.push({ id: result.insertId, image_url: imageUrl });
    }

    // Return updated gallery
    const [gallery] = await pool.query(
      'SELECT * FROM variant_images WHERE variant_id = ? ORDER BY position ASC',
      [variantId]
    );

    res.json({ success: true, gallery, inserted });
  } catch (err) { next(err); }
});

// GET /products/last-commandes
// Retourne pour chaque product/variant le dernier bon de commande associé
router.get('/last-commandes', async (_req, res, next) => {
  try {
    const sql = `
      -- For each product + variant (variant NULL treated separately), find the latest bons_commande
      SELECT
        t.product_id,
        NULLIF(t.variant_key, 0) AS variant_id,
        b.id AS bon_id,
        b.numero,
        b.date_creation,
        ci.quantite AS item_quantite,
        ci.prix_unitaire AS item_prix_unitaire
      FROM (
        SELECT
          ci.product_id,
          COALESCE(ci.variant_id, 0) AS variant_key,
          MAX(CONCAT(b.date_creation, ' ', LPAD(b.id, 10, '0'))) AS max_key
        FROM commande_items ci
        JOIN bons_commande b ON ci.bon_commande_id = b.id
        GROUP BY ci.product_id, COALESCE(ci.variant_id, 0)
      ) t
      JOIN commande_items ci ON ci.product_id = t.product_id AND COALESCE(ci.variant_id, 0) = t.variant_key
      JOIN bons_commande b ON ci.bon_commande_id = b.id AND CONCAT(b.date_creation, ' ', LPAD(b.id, 10, '0')) = t.max_key
      ORDER BY t.product_id, t.variant_key;
    `;

    const [rows] = await pool.query(sql);
    res.json(rows.map(r => ({
      product_id: r.product_id,
      variant_id: r.variant_id,
      bon_id: r.bon_id,
      numero: r.numero,
      date_creation: r.date_creation,
      quantite: Number(r.item_quantite || 0),
      prix_unitaire: Number(r.item_prix_unitaire || 0)
    })));
  } catch (err) { next(err); }
});
export default router;
