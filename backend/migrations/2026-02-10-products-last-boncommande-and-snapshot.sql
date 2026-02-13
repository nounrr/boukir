-- Migration: add products.last_boncommande_id, add bon_commande_id to bon/avoir items tables,
-- and create products_snapshot (all columns from products + qte)

SET @dbname = DATABASE();

/* =========================
   1) products.last_boncommande_id
   ========================= */

SET @products_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'products'
);

SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'products' AND COLUMN_NAME = 'last_boncommande_id'
);

SET @sql_stmt = IF(
  @products_exists = 1 AND @col_exists = 0,
  'ALTER TABLE products ADD COLUMN last_boncommande_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'products' AND INDEX_NAME = 'idx_products_last_boncommande_id'
);

SET @sql_stmt = IF(
  @products_exists = 1 AND @idx_exists = 0,
  'ALTER TABLE products ADD INDEX idx_products_last_boncommande_id (last_boncommande_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @bons_commande_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'bons_commande'
);

SET @fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'products'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    AND CONSTRAINT_NAME = 'fk_products_last_boncommande'
);

SET @sql_stmt = IF(
  @products_exists = 1 AND @bons_commande_exists = 1 AND @fk_exists = 0,
  'ALTER TABLE products ADD CONSTRAINT fk_products_last_boncommande FOREIGN KEY (last_boncommande_id) REFERENCES bons_commande(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;


/* =========================
   2) bon_commande_id on items tables
   ========================= */

-- Helper macro pattern (repeated): add column + index + FK if table exists

-- sortie_items
SET @t_exists = (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'sortie_items'
);
SET @c_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'sortie_items' AND COLUMN_NAME = 'bon_commande_id'
);
SET @sql_stmt = IF(@t_exists = 1 AND @c_exists = 0,
  'ALTER TABLE sortie_items ADD COLUMN bon_commande_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'sortie_items' AND INDEX_NAME = 'idx_sortie_items_bon_commande_id'
);
SET @sql_stmt = IF(@t_exists = 1 AND @idx_exists = 0,
  'ALTER TABLE sortie_items ADD INDEX idx_sortie_items_bon_commande_id (bon_commande_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'sortie_items'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'fk_sortie_items_bon_commande'
);
SET @sql_stmt = IF(@t_exists = 1 AND @bons_commande_exists = 1 AND @fk_exists = 0,
  'ALTER TABLE sortie_items ADD CONSTRAINT fk_sortie_items_bon_commande FOREIGN KEY (bon_commande_id) REFERENCES bons_commande(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- comptant_items
SET @t_exists = (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'comptant_items'
);
SET @c_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'comptant_items' AND COLUMN_NAME = 'bon_commande_id'
);
SET @sql_stmt = IF(@t_exists = 1 AND @c_exists = 0,
  'ALTER TABLE comptant_items ADD COLUMN bon_commande_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'comptant_items' AND INDEX_NAME = 'idx_comptant_items_bon_commande_id'
);
SET @sql_stmt = IF(@t_exists = 1 AND @idx_exists = 0,
  'ALTER TABLE comptant_items ADD INDEX idx_comptant_items_bon_commande_id (bon_commande_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'comptant_items'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'fk_comptant_items_bon_commande'
);
SET @sql_stmt = IF(@t_exists = 1 AND @bons_commande_exists = 1 AND @fk_exists = 0,
  'ALTER TABLE comptant_items ADD CONSTRAINT fk_comptant_items_bon_commande FOREIGN KEY (bon_commande_id) REFERENCES bons_commande(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- vehicule_items
SET @t_exists = (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'vehicule_items'
);
SET @c_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'vehicule_items' AND COLUMN_NAME = 'bon_commande_id'
);
SET @sql_stmt = IF(@t_exists = 1 AND @c_exists = 0,
  'ALTER TABLE vehicule_items ADD COLUMN bon_commande_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'vehicule_items' AND INDEX_NAME = 'idx_vehicule_items_bon_commande_id'
);
SET @sql_stmt = IF(@t_exists = 1 AND @idx_exists = 0,
  'ALTER TABLE vehicule_items ADD INDEX idx_vehicule_items_bon_commande_id (bon_commande_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'vehicule_items'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'fk_vehicule_items_bon_commande'
);
SET @sql_stmt = IF(@t_exists = 1 AND @bons_commande_exists = 1 AND @fk_exists = 0,
  'ALTER TABLE vehicule_items ADD CONSTRAINT fk_vehicule_items_bon_commande FOREIGN KEY (bon_commande_id) REFERENCES bons_commande(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- devis_items
SET @t_exists = (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devis_items'
);
SET @c_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devis_items' AND COLUMN_NAME = 'bon_commande_id'
);
SET @sql_stmt = IF(@t_exists = 1 AND @c_exists = 0,
  'ALTER TABLE devis_items ADD COLUMN bon_commande_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devis_items' AND INDEX_NAME = 'idx_devis_items_bon_commande_id'
);
SET @sql_stmt = IF(@t_exists = 1 AND @idx_exists = 0,
  'ALTER TABLE devis_items ADD INDEX idx_devis_items_bon_commande_id (bon_commande_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devis_items'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'fk_devis_items_bon_commande'
);
SET @sql_stmt = IF(@t_exists = 1 AND @bons_commande_exists = 1 AND @fk_exists = 0,
  'ALTER TABLE devis_items ADD CONSTRAINT fk_devis_items_bon_commande FOREIGN KEY (bon_commande_id) REFERENCES bons_commande(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- avoir_client_items
SET @t_exists = (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'avoir_client_items'
);
SET @c_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'avoir_client_items' AND COLUMN_NAME = 'bon_commande_id'
);
SET @sql_stmt = IF(@t_exists = 1 AND @c_exists = 0,
  'ALTER TABLE avoir_client_items ADD COLUMN bon_commande_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'avoir_client_items' AND INDEX_NAME = 'idx_avoir_client_items_bon_commande_id'
);
SET @sql_stmt = IF(@t_exists = 1 AND @idx_exists = 0,
  'ALTER TABLE avoir_client_items ADD INDEX idx_avoir_client_items_bon_commande_id (bon_commande_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'avoir_client_items'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'fk_avoir_client_items_bon_commande'
);
SET @sql_stmt = IF(@t_exists = 1 AND @bons_commande_exists = 1 AND @fk_exists = 0,
  'ALTER TABLE avoir_client_items ADD CONSTRAINT fk_avoir_client_items_bon_commande FOREIGN KEY (bon_commande_id) REFERENCES bons_commande(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- avoir_fournisseur_items
SET @t_exists = (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'avoir_fournisseur_items'
);
SET @c_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'avoir_fournisseur_items' AND COLUMN_NAME = 'bon_commande_id'
);
SET @sql_stmt = IF(@t_exists = 1 AND @c_exists = 0,
  'ALTER TABLE avoir_fournisseur_items ADD COLUMN bon_commande_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'avoir_fournisseur_items' AND INDEX_NAME = 'idx_avoir_fournisseur_items_bon_commande_id'
);
SET @sql_stmt = IF(@t_exists = 1 AND @idx_exists = 0,
  'ALTER TABLE avoir_fournisseur_items ADD INDEX idx_avoir_fournisseur_items_bon_commande_id (bon_commande_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'avoir_fournisseur_items'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'fk_avoir_fournisseur_items_bon_commande'
);
SET @sql_stmt = IF(@t_exists = 1 AND @bons_commande_exists = 1 AND @fk_exists = 0,
  'ALTER TABLE avoir_fournisseur_items ADD CONSTRAINT fk_avoir_fournisseur_items_bon_commande FOREIGN KEY (bon_commande_id) REFERENCES bons_commande(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- avoir_comptant_items
SET @t_exists = (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'avoir_comptant_items'
);
SET @c_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'avoir_comptant_items' AND COLUMN_NAME = 'bon_commande_id'
);
SET @sql_stmt = IF(@t_exists = 1 AND @c_exists = 0,
  'ALTER TABLE avoir_comptant_items ADD COLUMN bon_commande_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'avoir_comptant_items' AND INDEX_NAME = 'idx_avoir_comptant_items_bon_commande_id'
);
SET @sql_stmt = IF(@t_exists = 1 AND @idx_exists = 0,
  'ALTER TABLE avoir_comptant_items ADD INDEX idx_avoir_comptant_items_bon_commande_id (bon_commande_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'avoir_comptant_items'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'fk_avoir_comptant_items_bon_commande'
);
SET @sql_stmt = IF(@t_exists = 1 AND @bons_commande_exists = 1 AND @fk_exists = 0,
  'ALTER TABLE avoir_comptant_items ADD CONSTRAINT fk_avoir_comptant_items_bon_commande FOREIGN KEY (bon_commande_id) REFERENCES bons_commande(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;


/* =========================
   3) products_snapshot (products columns + qte)
   ========================= */

SET @snap_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'products_snapshot'
);

SET @sql_stmt = IF(
  @products_exists = 1 AND @snap_exists = 0,
  'CREATE TABLE products_snapshot AS SELECT p.*, CAST(0 AS DECIMAL(12,3)) AS qte FROM products p WHERE 1=0',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- snapshot_id PK
SET @c_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'products_snapshot' AND COLUMN_NAME = 'snapshot_id'
);

SET @sql_stmt = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'products_snapshot') = 1
    AND @c_exists = 0,
  'ALTER TABLE products_snapshot ADD COLUMN snapshot_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Ensure qte exists (for case table existed but without it)
SET @c_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'products_snapshot' AND COLUMN_NAME = 'qte'
);
SET @sql_stmt = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'products_snapshot') = 1
    AND @c_exists = 0,
  'ALTER TABLE products_snapshot ADD COLUMN qte DECIMAL(12,3) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Index on original product id column (id)
SET @idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'products_snapshot' AND INDEX_NAME = 'idx_products_snapshot_product_id'
);

SET @sql_stmt = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'products_snapshot' AND COLUMN_NAME = 'id') = 1
    AND @idx_exists = 0,
  'ALTER TABLE products_snapshot ADD INDEX idx_products_snapshot_product_id (id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
