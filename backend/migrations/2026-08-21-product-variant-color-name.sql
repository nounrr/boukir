USE boukir3;

SET @product_variant_color_name_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_variants'
    AND COLUMN_NAME = 'color_name'
);
SET @product_variant_color_name_sql := IF(
  @product_variant_color_name_exists = 0,
  'ALTER TABLE product_variants ADD COLUMN color_name VARCHAR(100) NULL AFTER variant_name_zh',
  'SELECT 1'
);
PREPARE product_variant_color_name_stmt FROM @product_variant_color_name_sql;
EXECUTE product_variant_color_name_stmt;
DEALLOCATE PREPARE product_variant_color_name_stmt;
