-- Drop unit sale price from product_units if it exists (MySQL-compatible)
-- Safe conditional: checks INFORMATION_SCHEMA before altering

SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_units'
    AND COLUMN_NAME = 'prix_vente'
);

SET @sql := IF(@col_exists > 0,
  'ALTER TABLE product_units DROP COLUMN prix_vente',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
