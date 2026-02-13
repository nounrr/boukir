-- Migration: add bon_commande_id to ecommerce items tables (orders + avoirs)

SET @dbname = DATABASE();

SET @bons_commande_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'bons_commande'
);

/* =========================
   1) ecommerce_order_items.bon_commande_id
   ========================= */

SET @t_exists = (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'ecommerce_order_items'
);

SET @c_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'ecommerce_order_items' AND COLUMN_NAME = 'bon_commande_id'
);

SET @sql_stmt = IF(@t_exists = 1 AND @c_exists = 0,
  'ALTER TABLE ecommerce_order_items ADD COLUMN bon_commande_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'ecommerce_order_items' AND INDEX_NAME = 'idx_ecommerce_order_items_bon_commande_id'
);

SET @sql_stmt = IF(@t_exists = 1 AND @idx_exists = 0,
  'ALTER TABLE ecommerce_order_items ADD INDEX idx_ecommerce_order_items_bon_commande_id (bon_commande_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'ecommerce_order_items'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'fk_ecommerce_order_items_bon_commande'
);

SET @sql_stmt = IF(@t_exists = 1 AND @bons_commande_exists = 1 AND @fk_exists = 0,
  'ALTER TABLE ecommerce_order_items ADD CONSTRAINT fk_ecommerce_order_items_bon_commande FOREIGN KEY (bon_commande_id) REFERENCES bons_commande(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;


/* =========================
   2) avoir_ecommerce_items.bon_commande_id
   ========================= */

SET @t_exists = (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'avoir_ecommerce_items'
);

SET @c_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'avoir_ecommerce_items' AND COLUMN_NAME = 'bon_commande_id'
);

SET @sql_stmt = IF(@t_exists = 1 AND @c_exists = 0,
  'ALTER TABLE avoir_ecommerce_items ADD COLUMN bon_commande_id INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'avoir_ecommerce_items' AND INDEX_NAME = 'idx_avoir_ecommerce_items_bon_commande_id'
);

SET @sql_stmt = IF(@t_exists = 1 AND @idx_exists = 0,
  'ALTER TABLE avoir_ecommerce_items ADD INDEX idx_avoir_ecommerce_items_bon_commande_id (bon_commande_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'avoir_ecommerce_items'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'fk_avoir_ecommerce_items_bon_commande'
);

SET @sql_stmt = IF(@t_exists = 1 AND @bons_commande_exists = 1 AND @fk_exists = 0,
  'ALTER TABLE avoir_ecommerce_items ADD CONSTRAINT fk_avoir_ecommerce_items_bon_commande FOREIGN KEY (bon_commande_id) REFERENCES bons_commande(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
