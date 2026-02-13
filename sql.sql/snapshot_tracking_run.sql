-- Snapshot tracking (RUN version)
-- This file contains ACTIVE queries (not commented).
-- Tip: start by setting @source_type and (optionally) @source_id.

/* ============================
   0) Choose what you track
   ============================ */

-- Examples:
-- SET @source_type = 'BON_COMMANDE'; SET @source_id = 8;
-- SET @source_type = 'AVOIR_CLIENT'; SET @source_id = 12;
-- SET @source_type = 'ECOMMERCE_ORDER'; SET @source_id = 123;

SET @source_type = 'BON_COMMANDE';
SET @source_id = NULL;

/* ============================
   1) GLOBAL
   ============================ */

-- 1.1 All batches (latest first)
SELECT *
FROM products_snapshot_batches
ORDER BY id DESC;

-- 1.2 Summary per batch (how many rows in products_snapshot)
SELECT
  b.id,
  b.source_type,
  b.source_id,
  b.note,
  b.created_at,
  COUNT(ps.snapshot_id) AS snapshot_rows
FROM products_snapshot_batches b
LEFT JOIN products_snapshot ps ON ps.batch_id = b.id
GROUP BY b.id
ORDER BY b.id DESC;

-- 1.3 Empty batches (batch without snapshot rows)
SELECT
  b.id AS batch_id,
  b.source_type,
  b.source_id,
  b.created_at
FROM products_snapshot_batches b
LEFT JOIN products_snapshot ps ON ps.batch_id = b.id
WHERE ps.snapshot_id IS NULL
ORDER BY b.id DESC;

/* ============================
   2) By document type (generic)
   ============================ */

-- 2.1 Audit view for ANY source_type
SELECT
  b.source_type,
  b.source_id,
  COUNT(DISTINCT b.id) AS snapshot_count,
  MIN(b.created_at) AS first_snapshot_at,
  MAX(b.created_at) AS last_snapshot_at
FROM products_snapshot_batches b
WHERE b.source_type = @source_type
GROUP BY b.source_type, b.source_id
ORDER BY last_snapshot_at DESC;

-- 2.2 List batches for one document (@source_id must be set)
SELECT *
FROM products_snapshot_batches
WHERE source_type = @source_type
  AND (@source_id IS NULL OR source_id = @source_id)
ORDER BY id DESC;

-- 2.3 Latest batch for one document (@source_id must be set)
SELECT *
FROM products_snapshot_batches
WHERE source_type = @source_type
  AND source_id = @source_id
ORDER BY id DESC
LIMIT 1;

/* ============================
   3) Snapshot lines
   ============================ */

-- 3.1 Snapshot lines for the latest batch of one document
-- (works even if you don't know the batch_id)
SELECT ps.*
FROM products_snapshot ps
JOIN (
  SELECT id
  FROM products_snapshot_batches
  WHERE source_type = @source_type
    AND source_id = @source_id
  ORDER BY id DESC
  LIMIT 1
) b ON b.id = ps.batch_id
ORDER BY ps.id ASC;

-- 3.2 Snapshot lines for a specific batch_id (replace 123)
-- SELECT * FROM products_snapshot WHERE batch_id = 123 ORDER BY id ASC;

/* ============================
   4) Missing snapshots (per table)
   ============================ */

-- 4.1 BON_COMMANDE missing
SELECT bc.id, bc.date_creation, bc.statut
FROM bons_commande bc
LEFT JOIN products_snapshot_batches b
  ON b.source_type = 'BON_COMMANDE'
 AND b.source_id = bc.id
WHERE b.id IS NULL
ORDER BY bc.id DESC;

-- 4.2 BON_SORTIE missing
SELECT bs.id, bs.date_creation, bs.statut
FROM bons_sortie bs
LEFT JOIN products_snapshot_batches b
  ON b.source_type = 'BON_SORTIE'
 AND b.source_id = bs.id
WHERE b.id IS NULL
ORDER BY bs.id DESC;

-- 4.3 BON_COMPTANT missing
SELECT bc.id, bc.date_creation, bc.statut
FROM bons_comptant bc
LEFT JOIN products_snapshot_batches b
  ON b.source_type = 'BON_COMPTANT'
 AND b.source_id = bc.id
WHERE b.id IS NULL
ORDER BY bc.id DESC;

-- 4.4 BON_VEHICULE missing
SELECT bv.id, bv.date_creation, bv.statut
FROM bons_vehicule bv
LEFT JOIN products_snapshot_batches b
  ON b.source_type = 'BON_VEHICULE'
 AND b.source_id = bv.id
WHERE b.id IS NULL
ORDER BY bv.id DESC;

-- 4.5 DEVIS missing
SELECT d.id, d.date_creation, d.statut
FROM devis d
LEFT JOIN products_snapshot_batches b
  ON b.source_type = 'DEVIS'
 AND b.source_id = d.id
WHERE b.id IS NULL
ORDER BY d.id DESC;

-- 4.6 AVOIR_CLIENT missing
SELECT ac.id, ac.date_creation, ac.statut
FROM avoirs_client ac
LEFT JOIN products_snapshot_batches b
  ON b.source_type = 'AVOIR_CLIENT'
 AND b.source_id = ac.id
WHERE b.id IS NULL
ORDER BY ac.id DESC;

-- 4.7 AVOIR_FOURNISSEUR missing
SELECT af.id, af.date_creation, af.statut
FROM avoirs_fournisseur af
LEFT JOIN products_snapshot_batches b
  ON b.source_type = 'AVOIR_FOURNISSEUR'
 AND b.source_id = af.id
WHERE b.id IS NULL
ORDER BY af.id DESC;

-- 4.8 AVOIR_COMPTANT missing
SELECT ac2.id, ac2.date_creation, ac2.statut
FROM avoirs_comptant ac2
LEFT JOIN products_snapshot_batches b
  ON b.source_type = 'AVOIR_COMPTANT'
 AND b.source_id = ac2.id
WHERE b.id IS NULL
ORDER BY ac2.id DESC;

-- 4.9 ECOMMERCE_ORDER missing
SELECT o.id, o.created_at, o.status
FROM ecommerce_orders o
LEFT JOIN products_snapshot_batches b
  ON b.source_type = 'ECOMMERCE_ORDER'
 AND b.source_id = o.id
WHERE b.id IS NULL
ORDER BY o.id DESC;

-- 4.10 AVOIR_ECOMMERCE missing
SELECT ae.id, ae.date_creation, ae.statut
FROM avoirs_ecommerce ae
LEFT JOIN products_snapshot_batches b
  ON b.source_type = 'AVOIR_ECOMMERCE'
 AND b.source_id = ae.id
WHERE b.id IS NULL
ORDER BY ae.id DESC;
