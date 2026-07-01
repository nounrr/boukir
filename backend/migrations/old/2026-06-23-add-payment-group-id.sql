-- Group payment rows created from the same multi-payment form submission.
SET @has_payment_group_id := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'payments'
    AND COLUMN_NAME = 'payment_group_id'
);

SET @sql := IF(
  @has_payment_group_id = 0,
  'ALTER TABLE payments ADD COLUMN payment_group_id VARCHAR(64) NULL AFTER numero',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_payment_group_idx := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'payments'
    AND INDEX_NAME = 'idx_payments_group_id'
);

SET @sql := IF(
  @has_payment_group_idx = 0,
  'CREATE INDEX idx_payments_group_id ON payments (payment_group_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
