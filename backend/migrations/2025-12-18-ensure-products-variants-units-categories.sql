-- Ensure products / variants / units / categories columns exist (idempotent)
-- Date: 2025-12-18

-- Helper: add column if not exists
DROP PROCEDURE IF EXISTS AddColIfNotExists;
DELIMITER $$
CREATE PROCEDURE AddColIfNotExists(
  IN p_table_name VARCHAR(64),
  IN p_col_name VARCHAR(64),
  IN p_col_def TEXT
)
BEGIN
  DECLARE v_count INT DEFAULT 0;

  SELECT COUNT(*) INTO v_count
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = p_table_name
    AND COLUMN_NAME = p_col_name;

  IF v_count = 0 THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table_name, '` ADD COLUMN `', p_col_name, '` ', p_col_def);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$
DELIMITER ;

-- 1) Ensure base tables exist (minimal definition only if missing)
CREATE TABLE IF NOT EXISTS categories (
  id INT NOT NULL AUTO_INCREMENT,
  nom VARCHAR(255) NOT NULL,
  description TEXT NULL,
  created_by INT NULL,
  updated_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  id INT NOT NULL AUTO_INCREMENT,
  designation VARCHAR(255) NULL,
  categorie_id INT NULL,
  quantite INT DEFAULT 0,
  prix_achat DECIMAL(10,2) NULL,
  prix_vente DECIMAL(10,2) NULL,
  created_by INT NULL,
  updated_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_variants (
  id INT NOT NULL AUTO_INCREMENT,
  product_id INT NOT NULL,
  variant_name VARCHAR(255) NOT NULL,
  reference VARCHAR(255) NULL,
  prix_achat DECIMAL(10,2) NULL,
  prix_vente DECIMAL(10,2) NULL,
  stock_quantity DECIMAL(10,2) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_units (
  id INT NOT NULL AUTO_INCREMENT,
  product_id INT NOT NULL,
  unit_name VARCHAR(50) NOT NULL,
  conversion_factor DECIMAL(10,4) DEFAULT 1.0000,
  prix_vente DECIMAL(10,2) NULL,
  is_default TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

-- Gallery tables
CREATE TABLE IF NOT EXISTS product_images (
  id INT NOT NULL AUTO_INCREMENT,
  product_id INT NOT NULL,
  image_url VARCHAR(255) NOT NULL,
  position INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS variant_images (
  id INT NOT NULL AUTO_INCREMENT,
  variant_id INT NOT NULL,
  image_url VARCHAR(255) NOT NULL,
  position INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

-- Optional table used by products.brand_id
CREATE TABLE IF NOT EXISTS brands (
  id INT NOT NULL AUTO_INCREMENT,
  nom VARCHAR(255) NOT NULL,
  description TEXT NULL,
  image_url VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

-- 2) Ensure categories columns (including hierarchy)
CALL AddColIfNotExists('categories', 'description', 'TEXT NULL');
CALL AddColIfNotExists('categories', 'created_by', 'INT NULL');
CALL AddColIfNotExists('categories', 'updated_by', 'INT NULL');
CALL AddColIfNotExists('categories', 'created_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
CALL AddColIfNotExists('categories', 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
CALL AddColIfNotExists('categories', 'parent_id', 'INT NULL');

-- 3) Ensure products columns (backoffice + e-commerce fields)
-- Backoffice dump columns
CALL AddColIfNotExists('products', 'designation', 'VARCHAR(255) NULL');
CALL AddColIfNotExists('products', 'categorie_id', 'INT NULL');
CALL AddColIfNotExists('products', 'quantite', 'INT DEFAULT 0');
CALL AddColIfNotExists('products', 'prix_achat', 'DECIMAL(10,2) NULL');
CALL AddColIfNotExists('products', 'cout_revient_pourcentage', 'DECIMAL(5,2) DEFAULT 0.00');
CALL AddColIfNotExists('products', 'cout_revient', 'DECIMAL(10,2) DEFAULT 0.00');
CALL AddColIfNotExists('products', 'prix_gros_pourcentage', 'DECIMAL(5,2) DEFAULT 0.00');
CALL AddColIfNotExists('products', 'prix_gros', 'DECIMAL(10,2) DEFAULT 0.00');
CALL AddColIfNotExists('products', 'prix_vente_pourcentage', 'DECIMAL(5,2) DEFAULT 0.00');
CALL AddColIfNotExists('products', 'prix_vente', 'DECIMAL(10,2) DEFAULT 0.00');
CALL AddColIfNotExists('products', 'est_service', 'TINYINT(1) DEFAULT 0');
CALL AddColIfNotExists('products', 'remise_client', 'DECIMAL(5,2) NOT NULL DEFAULT 0');
CALL AddColIfNotExists('products', 'remise_artisan', 'DECIMAL(5,2) NOT NULL DEFAULT 0');
CALL AddColIfNotExists('products', 'created_by', 'INT NULL');
CALL AddColIfNotExists('products', 'updated_by', 'INT NULL');
CALL AddColIfNotExists('products', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
CALL AddColIfNotExists('products', 'updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

-- Extra product columns used by the app (ensure_all_products_columns.sql + migrations)
CALL AddColIfNotExists('products', 'designation_ar', 'VARCHAR(255) NULL');
CALL AddColIfNotExists('products', 'designation_en', 'VARCHAR(255) NULL');
CALL AddColIfNotExists('products', 'designation_zh', 'VARCHAR(255) NULL');
CALL AddColIfNotExists('products', 'description', 'TEXT NULL');
CALL AddColIfNotExists('products', 'description_ar', 'TEXT NULL');
CALL AddColIfNotExists('products', 'description_en', 'TEXT NULL');
CALL AddColIfNotExists('products', 'description_zh', 'TEXT NULL');
CALL AddColIfNotExists('products', 'kg', 'DECIMAL(10,3) NULL');
CALL AddColIfNotExists('products', 'is_deleted', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL AddColIfNotExists('products', 'image_url', 'VARCHAR(255) NULL');
CALL AddColIfNotExists('products', 'fiche_technique', 'TEXT NULL');
CALL AddColIfNotExists('products', 'fiche_technique_ar', 'TEXT NULL');
CALL AddColIfNotExists('products', 'fiche_technique_en', 'TEXT NULL');
CALL AddColIfNotExists('products', 'fiche_technique_zh', 'TEXT NULL');
CALL AddColIfNotExists('products', 'pourcentage_promo', 'DECIMAL(5,2) DEFAULT 0');
CALL AddColIfNotExists('products', 'ecom_published', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL AddColIfNotExists('products', 'stock_partage_ecom', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL AddColIfNotExists('products', 'stock_partage_ecom_qty', 'INT NOT NULL DEFAULT 0');
CALL AddColIfNotExists('products', 'has_variants', 'TINYINT(1) DEFAULT 0');
CALL AddColIfNotExists('products', 'base_unit', "VARCHAR(50) DEFAULT 'u'");
CALL AddColIfNotExists('products', 'brand_id', 'INT NULL');
CALL AddColIfNotExists('products', 'categorie_base', "ENUM('Professionel','Maison') DEFAULT 'Maison'");

-- 4) Ensure product_variants columns
CALL AddColIfNotExists('product_variants', 'product_id', 'INT NOT NULL');
CALL AddColIfNotExists('product_variants', 'variant_name', 'VARCHAR(255) NOT NULL');
CALL AddColIfNotExists('product_variants', 'reference', 'VARCHAR(255) NULL');
CALL AddColIfNotExists('product_variants', 'prix_achat', 'DECIMAL(10,2) NULL');
CALL AddColIfNotExists('product_variants', 'prix_vente', 'DECIMAL(10,2) NULL');
CALL AddColIfNotExists('product_variants', 'stock_quantity', 'DECIMAL(10,2) DEFAULT 0');
CALL AddColIfNotExists('product_variants', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
CALL AddColIfNotExists('product_variants', 'updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
CALL AddColIfNotExists('product_variants', 'variant_type', "VARCHAR(50) DEFAULT 'Autre'");
CALL AddColIfNotExists('product_variants', 'image_url', 'VARCHAR(255) NULL');
CALL AddColIfNotExists('product_variants', 'remise_client', 'DECIMAL(5,2) NOT NULL DEFAULT 0');
CALL AddColIfNotExists('product_variants', 'remise_artisan', 'DECIMAL(5,2) NOT NULL DEFAULT 0');

-- Prices / margins for variants
CALL AddColIfNotExists('product_variants', 'cout_revient', 'DECIMAL(10,2) DEFAULT 0');
CALL AddColIfNotExists('product_variants', 'cout_revient_pourcentage', 'DECIMAL(5,2) DEFAULT 0');
CALL AddColIfNotExists('product_variants', 'prix_gros', 'DECIMAL(10,2) DEFAULT 0');
CALL AddColIfNotExists('product_variants', 'prix_gros_pourcentage', 'DECIMAL(5,2) DEFAULT 0');
CALL AddColIfNotExists('product_variants', 'prix_vente_pourcentage', 'DECIMAL(5,2) DEFAULT 0');

-- 5) Ensure product_units columns
CALL AddColIfNotExists('product_units', 'product_id', 'INT NOT NULL');
CALL AddColIfNotExists('product_units', 'unit_name', 'VARCHAR(50) NOT NULL');
CALL AddColIfNotExists('product_units', 'conversion_factor', 'DECIMAL(10,4) DEFAULT 1.0000');
CALL AddColIfNotExists('product_units', 'prix_vente', 'DECIMAL(10,2) NULL');
CALL AddColIfNotExists('product_units', 'is_default', 'TINYINT(1) DEFAULT 0');
CALL AddColIfNotExists('product_units', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
CALL AddColIfNotExists('product_units', 'updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

-- 5b) Ensure product gallery tables columns
CALL AddColIfNotExists('product_images', 'product_id', 'INT NOT NULL');
CALL AddColIfNotExists('product_images', 'image_url', 'VARCHAR(255) NOT NULL');
CALL AddColIfNotExists('product_images', 'position', 'INT DEFAULT 0');
CALL AddColIfNotExists('product_images', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
CALL AddColIfNotExists('product_images', 'updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

CALL AddColIfNotExists('variant_images', 'variant_id', 'INT NOT NULL');
CALL AddColIfNotExists('variant_images', 'image_url', 'VARCHAR(255) NOT NULL');
CALL AddColIfNotExists('variant_images', 'position', 'INT DEFAULT 0');
CALL AddColIfNotExists('variant_images', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
CALL AddColIfNotExists('variant_images', 'updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

-- 6) Ensure linked item tables have variant_id/unit_id
-- (These tables already have product_id; this just adds variant/unit support)
CALL AddColIfNotExists('sortie_items', 'variant_id', 'INT NULL');
CALL AddColIfNotExists('sortie_items', 'unit_id', 'INT NULL');

CALL AddColIfNotExists('commande_items', 'variant_id', 'INT NULL');
CALL AddColIfNotExists('commande_items', 'unit_id', 'INT NULL');

CALL AddColIfNotExists('comptant_items', 'variant_id', 'INT NULL');
CALL AddColIfNotExists('comptant_items', 'unit_id', 'INT NULL');

CALL AddColIfNotExists('devis_items', 'variant_id', 'INT NULL');
CALL AddColIfNotExists('devis_items', 'unit_id', 'INT NULL');

CALL AddColIfNotExists('avoir_client_items', 'variant_id', 'INT NULL');
CALL AddColIfNotExists('avoir_client_items', 'unit_id', 'INT NULL');

CALL AddColIfNotExists('avoir_fournisseur_items', 'variant_id', 'INT NULL');
CALL AddColIfNotExists('avoir_fournisseur_items', 'unit_id', 'INT NULL');

CALL AddColIfNotExists('avoir_comptant_items', 'variant_id', 'INT NULL');
CALL AddColIfNotExists('avoir_comptant_items', 'unit_id', 'INT NULL');

-- Cleanup
DROP PROCEDURE IF EXISTS AddColIfNotExists;
