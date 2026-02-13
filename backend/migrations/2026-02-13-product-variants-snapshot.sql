-- Migration: create product_variants_snapshot (variants columns + qte)
-- This table is used to store a snapshot of variant fields at validation time.

SET @dbname = DATABASE();

SET @variants_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'product_variants'
);

SET @snap_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'product_variants_snapshot'
);

SET @sql_stmt = IF(
  @variants_exists = 1 AND @snap_exists = 0,
  'CREATE TABLE product_variants_snapshot AS SELECT pv.*, CAST(0 AS DECIMAL(12,3)) AS qte FROM product_variants pv WHERE 1=0',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- snapshot_id PK
SET @c_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'product_variants_snapshot' AND COLUMN_NAME = 'snapshot_id'
);

SET @sql_stmt = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'product_variants_snapshot') = 1
    AND @c_exists = 0,
  'ALTER TABLE product_variants_snapshot ADD COLUMN snapshot_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Ensure qte exists
SET @c_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'product_variants_snapshot' AND COLUMN_NAME = 'qte'
);
SET @sql_stmt = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'product_variants_snapshot') = 1
    AND @c_exists = 0,
  'ALTER TABLE product_variants_snapshot ADD COLUMN qte DECIMAL(12,3) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Index on original variant id column (id)
SET @idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'product_variants_snapshot' AND INDEX_NAME = 'idx_product_variants_snapshot_variant_id'
);

SET @sql_stmt = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'product_variants_snapshot' AND COLUMN_NAME = 'id') = 1
    AND @idx_exists = 0,
  'ALTER TABLE product_variants_snapshot ADD INDEX idx_product_variants_snapshot_variant_id (id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
