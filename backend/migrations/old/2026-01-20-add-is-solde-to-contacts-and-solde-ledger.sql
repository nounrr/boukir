-- Add is_solde flag on contacts and a basic solde ledger table
-- This supports marking which clients are allowed to order on "solde"
-- and provides a place to track outstanding credit movements per client.

-- Add is_solde column to contacts if missing
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'contacts'
    AND COLUMN_NAME = 'is_solde'
);

SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE contacts ADD COLUMN is_solde TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Ledger for client solde movements (debits when ordering on solde, credits when paying back)
CREATE TABLE IF NOT EXISTS contact_solde_ledger (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  contact_id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED NULL,
  entry_type ENUM('debit','credit') NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by_employee_id BIGINT UNSIGNED NULL,
  KEY idx_contact (contact_id),
  KEY idx_order (order_id)
);