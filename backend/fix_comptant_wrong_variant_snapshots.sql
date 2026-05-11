-- Fix wrong product_snapshot_id for comptant_items only.
--
-- Avoids MySQL error 1093 by first materializing the target rows
-- into a temporary table, then updating from that table.
--
-- Rules:
--   - Excludes bons_comptant with status starting by annul/refus.
--   - Chooses the correct snapshot by FIFO for the same product + variant.
--   - Allows product_snapshot.quantite to become negative.
--   - Does not depend on product_snapshot.en_validation because prod schemas may differ.

START TRANSACTION;

-- Diagnostic: current conflicts in comptant_items before building the fix map.
SELECT
    COUNT(*) AS comptant_conflicts_total
FROM comptant_items ci
JOIN bons_comptant bc
    ON bc.id = ci.bon_comptant_id
JOIN product_snapshot ps_old
    ON ps_old.id = ci.product_snapshot_id
WHERE
    LOWER(COALESCE(bc.statut, '')) NOT LIKE 'annul%'
    AND LOWER(COALESCE(bc.statut, '')) NOT LIKE 'refus%'
    AND ci.product_snapshot_id IS NOT NULL
    AND ci.variant_id IS NOT NULL
    AND ps_old.variant_id IS NOT NULL
    AND ci.variant_id <> ps_old.variant_id;

DROP TEMPORARY TABLE IF EXISTS fix_comptant_snapshot_map;
CREATE TEMPORARY TABLE fix_comptant_snapshot_map AS
SELECT
    ci.id AS comptant_item_id,
    ci.bon_comptant_id,
    bc.statut,
    ci.product_id,
    ci.variant_id AS item_variant_id,
    ci.product_snapshot_id AS wrong_snapshot_id,
    ps_old.variant_id AS wrong_snapshot_variant_id,
    (
        SELECT ps2.id
        FROM product_snapshot ps2
        WHERE ps2.product_id = ci.product_id
          AND ps2.variant_id = ci.variant_id
        ORDER BY
          CASE WHEN ps2.prix_vente = ci.prix_unitaire THEN 0 ELSE 1 END,
          ps2.created_at ASC,
          ps2.id ASC
        LIMIT 1
    ) AS correct_snapshot_id,
    ci.quantite
FROM comptant_items ci
JOIN bons_comptant bc
    ON bc.id = ci.bon_comptant_id
JOIN product_snapshot ps_old
    ON ps_old.id = ci.product_snapshot_id
WHERE
    LOWER(COALESCE(bc.statut, '')) NOT LIKE 'annul%'
    AND LOWER(COALESCE(bc.statut, '')) NOT LIKE 'refus%'
    AND ci.product_snapshot_id IS NOT NULL
    AND ci.variant_id IS NOT NULL
    AND ps_old.variant_id IS NOT NULL
    AND ci.variant_id <> ps_old.variant_id;

-- Check rows before update.
SELECT *
FROM fix_comptant_snapshot_map
ORDER BY bon_comptant_id, comptant_item_id;

-- Must be 0 before applying. If not, ROLLBACK and choose/create correct snapshots manually.
SELECT COUNT(*) AS rows_without_correct_snapshot
FROM fix_comptant_snapshot_map
WHERE correct_snapshot_id IS NULL;

-- If rows_without_correct_snapshot > 0, this shows why:
-- usually there is no product_snapshot row for the item product_id + variant_id.
SELECT
    f.comptant_item_id,
    f.bon_comptant_id,
    f.product_id,
    f.item_variant_id,
    f.wrong_snapshot_id,
    f.wrong_snapshot_variant_id,
    f.quantite,
    COUNT(ps.id) AS available_snapshots_for_variant
FROM fix_comptant_snapshot_map f
LEFT JOIN product_snapshot ps
    ON ps.product_id = f.product_id
   AND ps.variant_id = f.item_variant_id
WHERE f.correct_snapshot_id IS NULL
GROUP BY
    f.comptant_item_id,
    f.bon_comptant_id,
    f.product_id,
    f.item_variant_id,
    f.wrong_snapshot_id,
    f.wrong_snapshot_variant_id,
    f.quantite;

-- Restore stock to the wrong snapshots.
UPDATE product_snapshot ps_old
JOIN (
    SELECT wrong_snapshot_id, SUM(quantite) AS qty
    FROM fix_comptant_snapshot_map
    WHERE correct_snapshot_id IS NOT NULL
    GROUP BY wrong_snapshot_id
) x ON x.wrong_snapshot_id = ps_old.id
SET ps_old.quantite = ps_old.quantite + x.qty;

-- Deduct stock from the correct FIFO snapshots.
-- Negative stock is allowed here.
UPDATE product_snapshot ps_new
JOIN (
    SELECT correct_snapshot_id, SUM(quantite) AS qty
    FROM fix_comptant_snapshot_map
    WHERE correct_snapshot_id IS NOT NULL
    GROUP BY correct_snapshot_id
) x ON x.correct_snapshot_id = ps_new.id
SET ps_new.quantite = ps_new.quantite - x.qty;

-- Relink comptant item rows to the correct snapshot.
UPDATE comptant_items ci
JOIN fix_comptant_snapshot_map f
    ON f.comptant_item_id = ci.id
SET ci.product_snapshot_id = f.correct_snapshot_id
WHERE f.correct_snapshot_id IS NOT NULL;

-- Verify remaining conflicts for non-cancelled/non-refused comptants.
SELECT
    ci.id AS comptant_item_id,
    ci.bon_comptant_id AS numero_bon,
    bc.statut,
    ci.product_id,
    ci.variant_id AS item_variant_id,
    ci.product_snapshot_id,
    ps.variant_id AS snapshot_variant_id,
    ci.quantite
FROM comptant_items ci
JOIN bons_comptant bc
    ON bc.id = ci.bon_comptant_id
JOIN product_snapshot ps
    ON ps.id = ci.product_snapshot_id
WHERE
    LOWER(COALESCE(bc.statut, '')) NOT LIKE 'annul%'
    AND LOWER(COALESCE(bc.statut, '')) NOT LIKE 'refus%'
    AND ci.product_snapshot_id IS NOT NULL
    AND ci.variant_id IS NOT NULL
    AND ps.variant_id IS NOT NULL
    AND ci.variant_id <> ps.variant_id
ORDER BY
    ci.bon_comptant_id,
    ci.created_at,
    ci.id;

-- If the verification SELECT returns no rows:
-- COMMIT;

-- If you still see problems:
-- ROLLBACK;

