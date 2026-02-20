-- Migration: add product_snapshot_id to item tables
-- Created: 2026-02-15
-- Goal: add a nullable product_snapshot_id column to all *items* tables (bons/orders/avoirs)
-- and an index for faster joins.
--
-- Notes:
-- - Uses information_schema + dynamic SQL to avoid errors if column/index already exists.
-- - Does NOT add foreign keys by default (to avoid breaking existing data / engine differences).

-- Helper pattern:
-- 1) check column existence
-- 2) ALTER TABLE ... ADD COLUMN
-- 3) check index existence
-- 4) CREATE INDEX ...

-- =====================
-- commande_items
-- =====================
SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'commande_items' AND COLUMN_NAME = 'product_snapshot_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE commande_items ADD COLUMN product_snapshot_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'commande_items' AND INDEX_NAME = 'idx_commande_items_product_snapshot_id'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_commande_items_product_snapshot_id ON commande_items (product_snapshot_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =====================
-- comptant_items
-- =====================
SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comptant_items' AND COLUMN_NAME = 'product_snapshot_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE comptant_items ADD COLUMN product_snapshot_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comptant_items' AND INDEX_NAME = 'idx_comptant_items_product_snapshot_id'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_comptant_items_product_snapshot_id ON comptant_items (product_snapshot_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =====================
-- sortie_items
-- =====================
SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sortie_items' AND COLUMN_NAME = 'product_snapshot_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE sortie_items ADD COLUMN product_snapshot_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sortie_items' AND INDEX_NAME = 'idx_sortie_items_product_snapshot_id'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_sortie_items_product_snapshot_id ON sortie_items (product_snapshot_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =====================
-- devis_items
-- =====================
SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'devis_items' AND COLUMN_NAME = 'product_snapshot_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE devis_items ADD COLUMN product_snapshot_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'devis_items' AND INDEX_NAME = 'idx_devis_items_product_snapshot_id'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_devis_items_product_snapshot_id ON devis_items (product_snapshot_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =====================
-- avoir_client_items
-- =====================
SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avoir_client_items' AND COLUMN_NAME = 'product_snapshot_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE avoir_client_items ADD COLUMN product_snapshot_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avoir_client_items' AND INDEX_NAME = 'idx_avoir_client_items_product_snapshot_id'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_avoir_client_items_product_snapshot_id ON avoir_client_items (product_snapshot_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =====================
-- avoir_fournisseur_items
-- =====================
SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avoir_fournisseur_items' AND COLUMN_NAME = 'product_snapshot_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE avoir_fournisseur_items ADD COLUMN product_snapshot_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avoir_fournisseur_items' AND INDEX_NAME = 'idx_avoir_fournisseur_items_product_snapshot_id'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_avoir_fournisseur_items_product_snapshot_id ON avoir_fournisseur_items (product_snapshot_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =====================
-- avoir_comptant_items
-- =====================
SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avoir_comptant_items' AND COLUMN_NAME = 'product_snapshot_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE avoir_comptant_items ADD COLUMN product_snapshot_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avoir_comptant_items' AND INDEX_NAME = 'idx_avoir_comptant_items_product_snapshot_id'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_avoir_comptant_items_product_snapshot_id ON avoir_comptant_items (product_snapshot_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =====================
-- avoir_ecommerce_items
-- =====================
SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avoir_ecommerce_items' AND COLUMN_NAME = 'product_snapshot_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE avoir_ecommerce_items ADD COLUMN product_snapshot_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avoir_ecommerce_items' AND INDEX_NAME = 'idx_avoir_ecommerce_items_product_snapshot_id'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_avoir_ecommerce_items_product_snapshot_id ON avoir_ecommerce_items (product_snapshot_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =====================
-- vehicule_items
-- =====================
SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicule_items' AND COLUMN_NAME = 'product_snapshot_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE vehicule_items ADD COLUMN product_snapshot_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicule_items' AND INDEX_NAME = 'idx_vehicule_items_product_snapshot_id'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_vehicule_items_product_snapshot_id ON vehicule_items (product_snapshot_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =====================
-- ecommerce_order_items (order items)
-- =====================
SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ecommerce_order_items' AND COLUMN_NAME = 'product_snapshot_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE ecommerce_order_items ADD COLUMN product_snapshot_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ecommerce_order_items' AND INDEX_NAME = 'idx_ecommerce_order_items_product_snapshot_id'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_ecommerce_order_items_product_snapshot_id ON ecommerce_order_items (product_snapshot_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
