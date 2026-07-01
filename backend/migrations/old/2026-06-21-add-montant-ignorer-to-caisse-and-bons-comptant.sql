-- Migration: add montant_ignorer to payments and bons_comptant
-- Created: 2026-06-21
-- Goal: separer le montant ignore du reste/non_paye des bons comptants.
-- Fond caisse utilise: montant_total - montant_ignorer.

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'payments'
    AND COLUMN_NAME = 'montant_ignorer'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE payments ADD COLUMN montant_ignorer DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER montant_total',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'bons_comptant'
    AND COLUMN_NAME = 'montant_ignorer'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE bons_comptant ADD COLUMN montant_ignorer DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER montant_total',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
