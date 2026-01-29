-- Add solde_applied to ecommerce_orders
-- Meaning: 1 when payment_method='solde' AND (total_amount - remise_used_amount) > 0

-- Add solde_applied column if missing
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ecommerce_orders'
    AND COLUMN_NAME = 'solde_applied'
);

SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE ecommerce_orders ADD COLUMN solde_applied TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Backfill from existing totals (or solde_amount if present)
UPDATE ecommerce_orders
SET solde_applied = CASE
  WHEN payment_method = 'solde' AND GREATEST(0, ROUND(COALESCE(total_amount,0) - COALESCE(remise_used_amount,0), 2)) > 0 THEN 1
  ELSE 0
END;
