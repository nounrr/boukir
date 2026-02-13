-- Snapshot variantes (valeurs actuelles) + dernier bon commande validé par variante
-- Objectif:
-- - (Re)créer la table product_variants_snapshot
-- - Snapshot UNIQUE (refresh) de toutes les variantes
-- - Pour chaque variante: dernier bon_commande_id VALIDÉ qui contient cette variante
--
-- IMPORTANT:
-- Ce script fait un DROP + CREATE TABLE AS SELECT.

SET @db := DATABASE();

SET @variants_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'product_variants'
);

SET @sql := IF(
  @variants_exists = 1,
  'SELECT 1',
  'SELECT "ERROR: table product_variants not found" AS error'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

DROP TABLE IF EXISTS product_variants_snapshot;

CREATE TABLE product_variants_snapshot AS
SELECT
  pv.*,
  CAST(pv.stock_quantity AS DECIMAL(12,3)) AS qte,
  COALESCE(x.last_boncommande_id, p.last_boncommande_id) AS bon_commande_id,
  NOW() AS snapshot_at
FROM product_variants pv
LEFT JOIN products p ON p.id = pv.product_id
LEFT JOIN (
  SELECT variant_id, bon_commande_id AS last_boncommande_id
  FROM (
    SELECT
      ci.variant_id,
      ci.bon_commande_id,
      ROW_NUMBER() OVER (
        PARTITION BY ci.variant_id
        ORDER BY bc.date_creation DESC, ci.bon_commande_id DESC
      ) AS rn
    FROM commande_items ci
    JOIN bons_commande bc ON bc.id = ci.bon_commande_id
    WHERE ci.variant_id IS NOT NULL
      AND LOWER(TRIM(bc.statut)) IN ('validé', 'valide')
  ) ranked
  WHERE rn = 1
) x ON x.variant_id = pv.id;

ALTER TABLE product_variants_snapshot
  ADD COLUMN snapshot_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST;

ALTER TABLE product_variants_snapshot
  ADD INDEX idx_pvs_variant_id (id),
  ADD INDEX idx_pvs_product_id (product_id),
  ADD INDEX idx_pvs_bon_commande_id (bon_commande_id),
  ADD INDEX idx_pvs_snapshot_at (snapshot_at);

SELECT COUNT(*) AS variants_count FROM product_variants;
SELECT COUNT(*) AS snapshot_rows FROM product_variants_snapshot;
SELECT COUNT(*) AS snapshot_rows_with_bon_commande_id
FROM product_variants_snapshot
WHERE bon_commande_id IS NOT NULL;
