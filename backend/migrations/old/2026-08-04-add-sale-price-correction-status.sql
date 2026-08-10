SET @product_correction_column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'products'
    AND COLUMN_NAME = 'sale_price_corrected_at'
);

SET @product_correction_column_sql := IF(
  @product_correction_column_exists = 0,
  'ALTER TABLE products ADD COLUMN sale_price_corrected_at DATETIME NULL',
  'SELECT 1'
);

PREPARE product_correction_column_stmt FROM @product_correction_column_sql;
EXECUTE product_correction_column_stmt;
DEALLOCATE PREPARE product_correction_column_stmt;

SET @snapshot_correction_column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_snapshot'
    AND COLUMN_NAME = 'sale_price_corrected_at'
);

SET @snapshot_correction_table_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_snapshot'
);

SET @snapshot_correction_column_sql := IF(
  @snapshot_correction_table_exists > 0 AND @snapshot_correction_column_exists = 0,
  'ALTER TABLE product_snapshot ADD COLUMN sale_price_corrected_at DATETIME NULL',
  'SELECT 1'
);

PREPARE snapshot_correction_column_stmt FROM @snapshot_correction_column_sql;
EXECUTE snapshot_correction_column_stmt;
DEALLOCATE PREPARE snapshot_correction_column_stmt;
