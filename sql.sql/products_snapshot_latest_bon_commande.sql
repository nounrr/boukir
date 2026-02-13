-- Snapshot produits (valeurs actuelles) + dernier bon commande validé par produit
-- Objectif:
-- - (Re)créer la table products_snapshot
-- - Générer un snapshot UNIQUE (refresh) de tous les produits
-- - Pour chaque produit: détecter seulement le dernier bon_commande_id VALIDÉ qui contient ce produit
--
-- IMPORTANT:
-- Ce script fait un DROP + CREATE TABLE AS SELECT.
-- C'est la façon la plus fiable si la table `products` change souvent (nouvelles colonnes)
-- sinon un INSERT dynamique peut échouer et donner 0 lignes.

SET @db := DATABASE();

SET @products_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'products'
);

SET @sql := IF(
  @products_exists = 1,
  'SELECT 1',
  'SELECT "ERROR: table products not found" AS error'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Drop old snapshot table (if exists)
DROP TABLE IF EXISTS products_snapshot;

-- Create snapshot with current products values + last validated bon id per product
CREATE TABLE products_snapshot AS
SELECT
  p.*,
  CAST(p.quantite AS DECIMAL(12,3)) AS qte,
  x.last_boncommande_id AS bon_commande_id,
  NOW() AS snapshot_at
FROM products p
LEFT JOIN (
  SELECT product_id, bon_commande_id AS last_boncommande_id
  FROM (
    SELECT
      ci.product_id,
      ci.bon_commande_id,
      ROW_NUMBER() OVER (
        PARTITION BY ci.product_id
        ORDER BY bc.date_creation DESC, ci.bon_commande_id DESC
      ) AS rn
    FROM commande_items ci
    JOIN bons_commande bc ON bc.id = ci.bon_commande_id
    WHERE LOWER(TRIM(bc.statut)) IN ('validé', 'valide')
  ) ranked
  WHERE rn = 1
) x ON x.product_id = p.id;

-- Add snapshot_id primary key (auto increment)
ALTER TABLE products_snapshot
  ADD COLUMN snapshot_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;

-- Useful indexes
ALTER TABLE products_snapshot
  ADD INDEX idx_products_snapshot_product_id (id),
  ADD INDEX idx_products_snapshot_bon_commande_id (bon_commande_id),
  ADD INDEX idx_products_snapshot_snapshot_at (snapshot_at);

/* =====================================================
   Quick checks
   ===================================================== */

SELECT COUNT(*) AS products_count FROM products;
SELECT COUNT(*) AS snapshot_rows FROM products_snapshot;
SELECT COUNT(*) AS snapshot_rows_with_bon_commande_id
FROM products_snapshot
WHERE bon_commande_id IS NOT NULL;
