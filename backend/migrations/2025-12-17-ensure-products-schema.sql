-- Ensure brands table exists
CREATE TABLE IF NOT EXISTS brands (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    description TEXT,
    image_url VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Ensure products table columns (using dynamic SQL)
SET @dbname = DATABASE();

-- designation_ar
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'designation_ar'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN designation_ar VARCHAR(255) DEFAULT NULL',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- designation_en
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'designation_en'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN designation_en VARCHAR(255) DEFAULT NULL',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- designation_zh
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'designation_zh'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN designation_zh VARCHAR(255) DEFAULT NULL',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- description_ar
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'description_ar'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN description_ar TEXT DEFAULT NULL',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- description_en
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'description_en'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN description_en TEXT DEFAULT NULL',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- description_zh
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'description_zh'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN description_zh TEXT DEFAULT NULL',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- kg
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'kg'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN kg DECIMAL(10,3) DEFAULT NULL',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- cout_revient
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'cout_revient'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN cout_revient DECIMAL(10,2) DEFAULT 0',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- cout_revient_pourcentage
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'cout_revient_pourcentage'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN cout_revient_pourcentage DECIMAL(5,2) DEFAULT 0',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- prix_gros
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'prix_gros'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN prix_gros DECIMAL(10,2) DEFAULT 0',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- prix_gros_pourcentage
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'prix_gros_pourcentage'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN prix_gros_pourcentage DECIMAL(5,2) DEFAULT 0',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- prix_vente_pourcentage
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'prix_vente_pourcentage'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN prix_vente_pourcentage DECIMAL(5,2) DEFAULT 0',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- remise_client
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'remise_client'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN remise_client DECIMAL(5,2) NOT NULL DEFAULT 0',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- remise_artisan
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'remise_artisan'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN remise_artisan DECIMAL(5,2) NOT NULL DEFAULT 0',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- est_service
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'est_service'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN est_service TINYINT(1) DEFAULT 0',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- is_deleted
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'is_deleted'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- created_by
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'created_by'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN created_by INT DEFAULT NULL',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- updated_by
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'updated_by'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN updated_by INT DEFAULT NULL',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- image_url
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'image_url'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN image_url VARCHAR(255) DEFAULT NULL',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- fiche_technique
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'fiche_technique'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN fiche_technique TEXT DEFAULT NULL',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- fiche_technique_ar
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'fiche_technique_ar'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN fiche_technique_ar TEXT DEFAULT NULL',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- fiche_technique_en
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'fiche_technique_en'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN fiche_technique_en TEXT DEFAULT NULL',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- fiche_technique_zh
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'fiche_technique_zh'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN fiche_technique_zh TEXT DEFAULT NULL',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- description
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'description'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN description TEXT DEFAULT NULL',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- pourcentage_promo
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'pourcentage_promo'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN pourcentage_promo DECIMAL(5,2) DEFAULT 0',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- ecom_published
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'ecom_published'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN ecom_published TINYINT(1) NOT NULL DEFAULT 0',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- stock_partage_ecom
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'stock_partage_ecom'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN stock_partage_ecom TINYINT(1) NOT NULL DEFAULT 0',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- stock_partage_ecom_qty
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'stock_partage_ecom_qty'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN stock_partage_ecom_qty INT NOT NULL DEFAULT 0',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- has_variants
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'has_variants'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN has_variants TINYINT(1) DEFAULT 0',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- base_unit
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'base_unit'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        "ALTER TABLE products ADD COLUMN base_unit VARCHAR(50) DEFAULT 'u'",
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- categorie_base
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'categorie_base'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        "ALTER TABLE products ADD COLUMN categorie_base ENUM('Professionel','Maison') DEFAULT 'Maison'",
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- brand_id
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'brand_id'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN brand_id INT DEFAULT NULL',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- categorie_id
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'categorie_id'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE products ADD COLUMN categorie_id INT DEFAULT NULL',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- Ensure categorie_id is INT type (convert if needed)
SET
    @col_type = (
        SELECT DATA_TYPE
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'categorie_id'
    );

SET
    @sql_stmt = IF(
        @col_type != 'int',
        'ALTER TABLE products MODIFY COLUMN categorie_id INT NULL',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- Add product_images table
CREATE TABLE IF NOT EXISTS product_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    image_url VARCHAR(255) NOT NULL,
    position INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_product_images_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Ensure product_variants table exists (if your schema already has it, this will be a noop)
CREATE TABLE IF NOT EXISTS product_variants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    variant_name VARCHAR(255) NOT NULL,
    variant_type VARCHAR(50) DEFAULT 'Autre',
    reference VARCHAR(255),
    prix_achat DECIMAL(10, 2) DEFAULT 0,
    cout_revient DECIMAL(10, 2) DEFAULT 0,
    cout_revient_pourcentage DECIMAL(5, 2) DEFAULT 0,
    prix_gros DECIMAL(10, 2) DEFAULT 0,
    prix_gros_pourcentage DECIMAL(5, 2) DEFAULT 0,
    prix_vente_pourcentage DECIMAL(5, 2) DEFAULT 0,
    prix_vente DECIMAL(10, 2) DEFAULT 0,
    remise_client DECIMAL(5, 2) NOT NULL DEFAULT 0,
    remise_artisan DECIMAL(5, 2) NOT NULL DEFAULT 0,
    stock_quantity INT NOT NULL DEFAULT 0,
    image_url VARCHAR(255) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_product_variants_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Ensure product_variants extra columns (for existing tables)
-- variant_type
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'product_variants'
            AND COLUMN_NAME = 'variant_type'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        "ALTER TABLE product_variants ADD COLUMN variant_type VARCHAR(50) DEFAULT 'Autre'",
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- image_url
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'product_variants'
            AND COLUMN_NAME = 'image_url'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE product_variants ADD COLUMN image_url VARCHAR(255) NULL',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- remise_client
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'product_variants'
            AND COLUMN_NAME = 'remise_client'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE product_variants ADD COLUMN remise_client DECIMAL(5,2) NOT NULL DEFAULT 0',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- remise_artisan
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'product_variants'
            AND COLUMN_NAME = 'remise_artisan'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE product_variants ADD COLUMN remise_artisan DECIMAL(5,2) NOT NULL DEFAULT 0',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- created_at
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'product_variants'
            AND COLUMN_NAME = 'created_at'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE product_variants ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- updated_at
SET
    @col_exists = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'product_variants'
            AND COLUMN_NAME = 'updated_at'
    );

SET
    @sql_stmt = IF(
        @col_exists = 0,
        'ALTER TABLE product_variants ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
        'SELECT 1'
    );

PREPARE stmt FROM @sql_stmt;

EXECUTE stmt;

DEALLOCATE PREPARE stmt;

-- Ensure product_units table exists (used for unit conversions)
CREATE TABLE IF NOT EXISTS product_units (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    unit_name VARCHAR(100) NOT NULL,
    conversion_factor DECIMAL(12, 4) NOT NULL DEFAULT 1.0000,
    prix_vente DECIMAL(10, 2) NULL,
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_product_units_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Ensure variant_images table exists
CREATE TABLE IF NOT EXISTS variant_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    variant_id INT NOT NULL,
    image_url VARCHAR(255) NOT NULL,
    position INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_variant_images_variant FOREIGN KEY (variant_id) REFERENCES product_variants (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Clean old junction (single category now)
DROP TABLE IF EXISTS product_categories;

-- Add FKs for products.brand_id -> brands(id) if missing
SELECT COUNT(*) INTO @fk_brand_exists
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE
    CONSTRAINT_SCHEMA = DATABASE()
    AND CONSTRAINT_NAME = 'fk_products_brand';

SET
    @stmt := IF(
        @fk_brand_exists = 0,
        'ALTER TABLE products ADD CONSTRAINT fk_products_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL',
        'SELECT 1'
    );

PREPARE s FROM @stmt;

EXECUTE s;

DEALLOCATE PREPARE s;

-- Add FKs for products.categorie_id -> categories(id) if missing
SELECT COUNT(*) INTO @fk_cat_exists
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE
    CONSTRAINT_SCHEMA = DATABASE()
    AND CONSTRAINT_NAME = 'fk_products_category';

SET
    @stmt2 := IF(
        @fk_cat_exists = 0,
        'ALTER TABLE products ADD CONSTRAINT fk_products_category FOREIGN KEY (categorie_id) REFERENCES categories(id) ON DELETE SET NULL',
        'SELECT 1'
    );

PREPARE s2 FROM @stmt2;

EXECUTE s2;

DEALLOCATE PREPARE s2;

-- Optional: helpful indexes (check if they exist first)
SET
    @idx1 = (
        SELECT COUNT(*)
        FROM information_schema.STATISTICS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND INDEX_NAME = 'idx_products_categorie_id'
    );

SET
    @idx2 = (
        SELECT COUNT(*)
        FROM information_schema.STATISTICS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'products'
            AND INDEX_NAME = 'idx_products_brand_id'
    );

SET
    @idx3 = (
        SELECT COUNT(*)
        FROM information_schema.STATISTICS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'product_images'
            AND INDEX_NAME = 'idx_product_images_product_id'
    );

SET
    @idx4 = (
        SELECT COUNT(*)
        FROM information_schema.STATISTICS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'product_variants'
            AND INDEX_NAME = 'idx_product_variants_product_id'
    );

SET
    @idx5 = (
        SELECT COUNT(*)
        FROM information_schema.STATISTICS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'product_units'
            AND INDEX_NAME = 'idx_product_units_product_id'
    );

SET
    @idx6 = (
        SELECT COUNT(*)
        FROM information_schema.STATISTICS
        WHERE
            TABLE_SCHEMA = @dbname
            AND TABLE_NAME = 'variant_images'
            AND INDEX_NAME = 'idx_variant_images_variant_id'
    );

SET
    @stmt_idx1 = IF(
        @idx1 = 0,
        'CREATE INDEX idx_products_categorie_id ON products (categorie_id)',
        'SELECT 1'
    );

SET
    @stmt_idx2 = IF(
        @idx2 = 0,
        'CREATE INDEX idx_products_brand_id ON products (brand_id)',
        'SELECT 1'
    );

SET
    @stmt_idx3 = IF(
        @idx3 = 0,
        'CREATE INDEX idx_product_images_product_id ON product_images (product_id)',
        'SELECT 1'
    );

SET
    @stmt_idx4 = IF(
        @idx4 = 0,
        'CREATE INDEX idx_product_variants_product_id ON product_variants (product_id)',
        'SELECT 1'
    );

SET
    @stmt_idx5 = IF(
        @idx5 = 0,
        'CREATE INDEX idx_product_units_product_id ON product_units (product_id)',
        'SELECT 1'
    );

SET
    @stmt_idx6 = IF(
        @idx6 = 0,
        'CREATE INDEX idx_variant_images_variant_id ON variant_images (variant_id)',
        'SELECT 1'
    );

PREPARE s_idx1 FROM @stmt_idx1;

EXECUTE s_idx1;

DEALLOCATE PREPARE s_idx1;

PREPARE s_idx2 FROM @stmt_idx2;

EXECUTE s_idx2;

DEALLOCATE PREPARE s_idx2;

PREPARE s_idx3 FROM @stmt_idx3;

EXECUTE s_idx3;

DEALLOCATE PREPARE s_idx3;

PREPARE s_idx4 FROM @stmt_idx4;

EXECUTE s_idx4;

DEALLOCATE PREPARE s_idx4;

PREPARE s_idx5 FROM @stmt_idx5;

EXECUTE s_idx5;

DEALLOCATE PREPARE s_idx5;

PREPARE s_idx6 FROM @stmt_idx6;

EXECUTE s_idx6;

DEALLOCATE PREPARE s_idx6;