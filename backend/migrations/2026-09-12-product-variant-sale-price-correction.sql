SET @has_variant_sale_price_corrected_at := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_variants'
    AND COLUMN_NAME = 'sale_price_corrected_at'
);
SET @variant_sale_price_correction_sql := IF(
  @has_variant_sale_price_corrected_at = 0,
  'ALTER TABLE product_variants ADD COLUMN sale_price_corrected_at DATETIME NULL AFTER prix_vente_2',
  'SELECT 1'
);
PREPARE variant_sale_price_correction_stmt FROM @variant_sale_price_correction_sql;
EXECUTE variant_sale_price_correction_stmt;
DEALLOCATE PREPARE variant_sale_price_correction_stmt;
