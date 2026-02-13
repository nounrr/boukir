-- Migration: add product_variants.last_boncommande_id (link last validated bon commande per variant)

SET @dbname = DATABASE();

SET @variants_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'product_variants'
);

SET @bons_commande_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'bons_commande'
);

/* =========================
   product_variants.last_boncommande_id
   ========================= */

SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'product_variants' AND COLUMN_NAME = 'last_boncommande_id'
);

SET @sql_stmt = IF(
  @variants_exists = 1 AND @col_exists = 0,
  'ALTER TABLE product_variants ADD COLUMN last_boncommande_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'product_variants' AND INDEX_NAME = 'idx_product_variants_last_boncommande_id'
);

SET @sql_stmt = IF(
  @variants_exists = 1 AND @idx_exists = 0,
  'ALTER TABLE product_variants ADD INDEX idx_product_variants_last_boncommande_id (last_boncommande_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'product_variants'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    AND CONSTRAINT_NAME = 'fk_product_variants_last_boncommande'
);

SET @sql_stmt = IF(
  @variants_exists = 1 AND @bons_commande_exists = 1 AND @fk_exists = 0,
  'ALTER TABLE product_variants ADD CONSTRAINT fk_product_variants_last_boncommande FOREIGN KEY (last_boncommande_id) REFERENCES bons_commande(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
