-- Migration: add multilingual variant name columns to product_variants
-- Adds: variant_name_ar, variant_name_en, variant_name_zh (all nullable)

SET @dbname = DATABASE();

-- variant_name_ar
SET @col_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
      AND TABLE_NAME = 'product_variants'
      AND COLUMN_NAME = 'variant_name_ar'
);

SET @sql_stmt = IF(
    @col_exists = 0,
    'ALTER TABLE product_variants ADD COLUMN variant_name_ar VARCHAR(255) DEFAULT NULL',
    'SELECT 1'
);

PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- variant_name_en
SET @col_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
      AND TABLE_NAME = 'product_variants'
      AND COLUMN_NAME = 'variant_name_en'
);

SET @sql_stmt = IF(
    @col_exists = 0,
    'ALTER TABLE product_variants ADD COLUMN variant_name_en VARCHAR(255) DEFAULT NULL',
    'SELECT 1'
);

PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- variant_name_zh
SET @col_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
      AND TABLE_NAME = 'product_variants'
      AND COLUMN_NAME = 'variant_name_zh'
);

SET @sql_stmt = IF(
    @col_exists = 0,
    'ALTER TABLE product_variants ADD COLUMN variant_name_zh VARCHAR(255) DEFAULT NULL',
    'SELECT 1'
);

PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


ALTER TABLE products
  MODIFY COLUMN fiche_technique_ar LONGTEXT NULL,
  MODIFY COLUMN fiche_technique_en LONGTEXT NULL,
  MODIFY COLUMN fiche_technique_zh LONGTEXT NULL;