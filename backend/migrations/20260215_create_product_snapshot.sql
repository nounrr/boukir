-- Migration: create product_snapshot table
-- Created: 2026-02-15

CREATE TABLE IF NOT EXISTS product_snapshot (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  variant_id INT DEFAULT NULL,
  prix_achat DECIMAL(10,2) DEFAULT NULL,
  prix_vente DECIMAL(10,2) DEFAULT NULL,
  cout_revient DECIMAL(10,2) DEFAULT NULL,
  cout_revient_pourcentage DECIMAL(5,2) DEFAULT NULL,
  prix_gros DECIMAL(10,2) DEFAULT NULL,
  prix_gros_pourcentage DECIMAL(5,2) DEFAULT NULL,
  prix_vente_pourcentage DECIMAL(5,2) DEFAULT NULL,
  quantite DECIMAL(12,3) NOT NULL DEFAULT 0,
  bon_commande_id INT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Notes:
-- - No foreign keys or indexes added by default (as requested).
-- - Adjust types/constraints later if you want FK or indexes.

-- Populate snapshot from existing products (product rows)
INSERT INTO product_snapshot (
  product_id, variant_id,
  prix_achat, prix_vente,
  cout_revient, cout_revient_pourcentage,
  prix_gros, prix_gros_pourcentage,
  prix_vente_pourcentage,
  quantite, bon_commande_id, created_at
)
SELECT
  p.id AS product_id,
  NULL AS variant_id,
  p.prix_achat,
  p.prix_vente,
  p.cout_revient,
  p.cout_revient_pourcentage,
  p.prix_gros,
  p.prix_gros_pourcentage,
  p.prix_vente_pourcentage,
  CAST(p.quantite AS DECIMAL(12,3)) AS quantite,
  NULL AS bon_commande_id,
  NOW() AS created_at
FROM products p;

-- Populate snapshot from existing variants (variant rows)
INSERT INTO product_snapshot (
  product_id, variant_id,
  prix_achat, prix_vente,
  cout_revient, cout_revient_pourcentage,
  prix_gros, prix_gros_pourcentage,
  prix_vente_pourcentage,
  quantite, bon_commande_id, created_at
)
SELECT
  v.product_id AS product_id,
  v.id AS variant_id,
  v.prix_achat,
  v.prix_vente,
  v.cout_revient,
  v.cout_revient_pourcentage,
  v.prix_gros,
  v.prix_gros_pourcentage,
  v.prix_vente_pourcentage,
  COALESCE(v.stock_quantity, 0) AS quantite,
  NULL AS bon_commande_id,
  NOW() AS created_at
FROM product_variants v;

-- Set bon_commande_id to the LATEST (highest id) bon_commande that contains this product.
-- - For product rows (variant_id IS NULL): latest bon across ALL variants of this product.
-- - For variant rows (variant_id IS NOT NULL): latest bon for that specific variant.
UPDATE product_snapshot ps
SET bon_commande_id = (
  SELECT MAX(ci.bon_commande_id)
  FROM commande_items ci
  WHERE ci.product_id = ps.product_id
    AND (ps.variant_id IS NULL OR ci.variant_id = ps.variant_id)
);

-- Add indexes to speed up queries and future updates
-- MySQL/MariaDB compatibility: CREATE INDEX IF NOT EXISTS is not always supported.
-- Use information_schema checks + dynamic SQL to avoid duplicate-key errors.

SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'commande_items'
    AND INDEX_NAME = 'idx_commande_items_product_variant_bon'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_commande_items_product_variant_bon ON commande_items (product_id, variant_id, bon_commande_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'commande_items'
    AND INDEX_NAME = 'idx_commande_items_bon_id'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_commande_items_bon_id ON commande_items (bon_commande_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_snapshot'
    AND INDEX_NAME = 'idx_product_snapshot_product_variant'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_product_snapshot_product_variant ON product_snapshot (product_id, variant_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'bons_commande'
    AND INDEX_NAME = 'idx_bons_commande_date_id'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_bons_commande_date_id ON bons_commande (date_creation, id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
