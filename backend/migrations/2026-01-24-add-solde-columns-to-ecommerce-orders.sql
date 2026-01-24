-- Add is_solde and solde_amount to ecommerce_orders for legacy solde aggregation

-- 1) Add is_solde column if missing
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ecommerce_orders'
    AND COLUMN_NAME = 'is_solde'
);

SET @ddl := IF(
  @col_exists = 0,
  "ALTER TABLE ecommerce_orders ADD COLUMN is_solde TINYINT(1) NOT NULL DEFAULT 0 AFTER payment_method",
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) Add solde_amount column if missing
SET @col_exists2 := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ecommerce_orders'
    AND COLUMN_NAME = 'solde_amount'
);

SET @ddl2 := IF(
  @col_exists2 = 0,
  'ALTER TABLE ecommerce_orders ADD COLUMN solde_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER is_solde',
  'SELECT 1'
);

PREPARE stmt2 FROM @ddl2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 3) Backfill solde flags and amounts for existing solde orders
UPDATE ecommerce_orders
SET
  is_solde = CASE WHEN payment_method = 'solde' THEN 1 ELSE 0 END,
  solde_amount = CASE
    WHEN payment_method = 'solde'
      THEN GREATEST(0, ROUND(total_amount - COALESCE(remise_used_amount, 0), 2))
    ELSE 0
  END
WHERE payment_method = 'solde' OR is_solde = 1;
