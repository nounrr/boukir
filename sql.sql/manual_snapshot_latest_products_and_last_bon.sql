-- Manual snapshot (latest products values) + recompute last validated bon_commande per product
-- Goal:
-- 1) Update products.last_boncommande_id for ALL products based on the latest VALIDATED bon commande that contains the product.
-- 2) Create a FULL products snapshot using CURRENT values from products (no historic prices), including last_boncommande_id.
--
-- Prerequisite:
-- - Run migration that adds products.last_boncommande_id and creates products_snapshot
-- - Run bpukir/sql.sql/products_snapshot_history.sql once (creates batches table + procedure)

/* =====================================================
   1) Recompute products.last_boncommande_id (VALIDATED only)
   ===================================================== */

UPDATE products p
LEFT JOIN (
  SELECT
    ci.product_id,
    MAX(ci.bon_commande_id) AS last_boncommande_id
  FROM commande_items ci
  JOIN bons_commande bc ON bc.id = ci.bon_commande_id
  WHERE bc.statut = 'Validé'
  GROUP BY ci.product_id
) x ON x.product_id = p.id
SET p.last_boncommande_id = x.last_boncommande_id;

/* =====================================================
   2) Create snapshot batch (full products)
   ===================================================== */

-- Create a MANUAL batch snapshot for all products (uses CURRENT values from products).
CALL sp_create_products_snapshot_for_source(
  'MANUAL',
  NULL,
  0,
  'Manual snapshot: latest products + last validated bon id'
);

/* =====================================================
   3) Quick check (latest MANUAL batch)
   ===================================================== */

SELECT *
FROM products_snapshot_batches
WHERE source_type = 'MANUAL'
ORDER BY id DESC
LIMIT 1;
