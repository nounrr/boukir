-- Add soft-delete flag for product variants.
-- Idempotent: safe to run even if the application already created the column.

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_variants'
    AND COLUMN_NAME = 'is_deleted'
);

SET @sql := IF(
  @column_exists = 0,
  'ALTER TABLE product_variants ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_variants'
    AND INDEX_NAME = 'idx_product_variants_is_deleted'
);

SET @sql := IF(
  @index_exists = 0,
  'CREATE INDEX idx_product_variants_is_deleted ON product_variants (is_deleted)',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
