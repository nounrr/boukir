-- Migration: add product_snapshot_id to avoir item tables
-- Date: 2026-02-16
-- Goal: add a nullable product_snapshot_id column to avoir_client_items, avoir_comptant_items, avoir_fournisseur_items

-- =============================================
-- avoir_client_items
-- =============================================
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avoir_client_items' AND COLUMN_NAME = 'product_snapshot_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE avoir_client_items ADD COLUMN product_snapshot_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avoir_client_items' AND INDEX_NAME = 'idx_avoir_client_items_product_snapshot_id'
);
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_avoir_client_items_product_snapshot_id ON avoir_client_items (product_snapshot_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================
-- avoir_comptant_items
-- =============================================
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avoir_comptant_items' AND COLUMN_NAME = 'product_snapshot_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE avoir_comptant_items ADD COLUMN product_snapshot_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avoir_comptant_items' AND INDEX_NAME = 'idx_avoir_comptant_items_product_snapshot_id'
);
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_avoir_comptant_items_product_snapshot_id ON avoir_comptant_items (product_snapshot_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================
-- avoir_fournisseur_items
-- =============================================
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avoir_fournisseur_items' AND COLUMN_NAME = 'product_snapshot_id'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE avoir_fournisseur_items ADD COLUMN product_snapshot_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avoir_fournisseur_items' AND INDEX_NAME = 'idx_avoir_fournisseur_items_product_snapshot_id'
);
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_avoir_fournisseur_items_product_snapshot_id ON avoir_fournisseur_items (product_snapshot_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
