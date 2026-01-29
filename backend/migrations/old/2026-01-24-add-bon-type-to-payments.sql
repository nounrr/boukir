-- Add bon_type to payments to disambiguate bon_id across multiple bon tables
-- Date: 2026-01-24

-- 1) Add column if missing
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'payments'
    AND COLUMN_NAME = 'bon_type'
);

SET @ddl := IF(
  @col_exists = 0,
  "ALTER TABLE payments ADD COLUMN bon_type VARCHAR(32) NULL AFTER bon_id",
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) Add index if missing
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'payments'
    AND INDEX_NAME = 'idx_payments_bon_type_id'
);

SET @ddl2 := IF(
  @idx_exists = 0,
  'CREATE INDEX idx_payments_bon_type_id ON payments(bon_type, bon_id)',
  'SELECT 1'
);

PREPARE stmt2 FROM @ddl2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
