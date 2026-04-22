-- ============================================================
-- FIX UPDATE - Produit 6253
-- Ordre d'execution:
--   1. CREATE TEMP TABLE (calcule le mapping item -> snapshot)
--   2. UPDATE product_snapshot (deduit/ajoute les quantites)
--   3. UPDATE items (lie le snapshot + corrige prix_unitaire)
--   4. VERIFICATION finale
--   5. DROP TEMP TABLE
-- ============================================================
-- IMPORTANT: lancer dans une seule session MySQL (temp table)
-- ============================================================

START TRANSACTION;

-- -----------------------------------------------------------
-- ETAPE 1: Calculer le mapping item -> meilleur snapshot
--          AVANT toute modification
-- -----------------------------------------------------------

CREATE TEMPORARY TABLE fix_mapping_6253 AS
SELECT
    'comptant'  AS bon_type,
    ci.id       AS item_id,
    ci.quantite AS item_qte,
    (
        SELECT ps2.id FROM product_snapshot ps2
        WHERE ps2.product_id = 6253 AND ps2.quantite > 0
        ORDER BY CASE WHEN ps2.quantite >= ci.quantite THEN 0 ELSE 1 END,
                 ps2.created_at DESC
        LIMIT 1
    ) AS target_snapshot_id,
    (
        SELECT ps2.prix_vente FROM product_snapshot ps2
        WHERE ps2.product_id = 6253 AND ps2.quantite > 0
        ORDER BY CASE WHEN ps2.quantite >= ci.quantite THEN 0 ELSE 1 END,
                 ps2.created_at DESC
        LIMIT 1
    ) AS prix_vente
FROM comptant_items ci
JOIN bons_comptant bc ON bc.id = ci.bon_comptant_id
JOIN products p ON p.id = ci.product_id
JOIN product_snapshot ps ON ps.product_id = 6253 AND ps.quantite > 0
WHERE ci.product_id = 6253
  AND ci.product_snapshot_id IS NULL
  AND bc.date_creation > '2026-03-31'
  AND p.prix_achat = 0 AND p.cout_revient = 0
GROUP BY ci.id, ci.quantite
HAVING COUNT(ps.id) > 1

UNION ALL

SELECT
    'sortie',
    si.id,
    si.quantite,
    (
        SELECT ps2.id FROM product_snapshot ps2
        WHERE ps2.product_id = 6253 AND ps2.quantite > 0
        ORDER BY CASE WHEN ps2.quantite >= si.quantite THEN 0 ELSE 1 END,
                 ps2.created_at DESC
        LIMIT 1
    ),
    (
        SELECT ps2.prix_vente FROM product_snapshot ps2
        WHERE ps2.product_id = 6253 AND ps2.quantite > 0
        ORDER BY CASE WHEN ps2.quantite >= si.quantite THEN 0 ELSE 1 END,
                 ps2.created_at DESC
        LIMIT 1
    )
FROM sortie_items si
JOIN bons_sortie bs ON bs.id = si.bon_sortie_id
JOIN products p ON p.id = si.product_id
JOIN product_snapshot ps ON ps.product_id = 6253 AND ps.quantite > 0
WHERE si.product_id = 6253
  AND si.product_snapshot_id IS NULL
  AND bs.date_creation > '2026-03-31'
  AND p.prix_achat = 0 AND p.cout_revient = 0
GROUP BY si.id, si.quantite
HAVING COUNT(ps.id) > 1

UNION ALL

SELECT
    'avoir_client',
    aci.id,
    aci.quantite,
    (
        SELECT ps2.id FROM product_snapshot ps2
        WHERE ps2.product_id = 6253 AND ps2.quantite > 0
        ORDER BY CASE WHEN ps2.quantite >= aci.quantite THEN 0 ELSE 1 END,
                 ps2.created_at DESC
        LIMIT 1
    ),
    (
        SELECT ps2.prix_vente FROM product_snapshot ps2
        WHERE ps2.product_id = 6253 AND ps2.quantite > 0
        ORDER BY CASE WHEN ps2.quantite >= aci.quantite THEN 0 ELSE 1 END,
                 ps2.created_at DESC
        LIMIT 1
    )
FROM avoir_client_items aci
JOIN avoirs_client ac ON ac.id = aci.avoir_client_id
JOIN products p ON p.id = aci.product_id
JOIN product_snapshot ps ON ps.product_id = 6253 AND ps.quantite > 0
WHERE aci.product_id = 6253
  AND aci.product_snapshot_id IS NULL
  AND ac.date_creation > '2026-03-31'
  AND p.prix_achat = 0 AND p.cout_revient = 0
GROUP BY aci.id, aci.quantite
HAVING COUNT(ps.id) > 1;


-- Verifier le mapping avant de continuer
SELECT
    bon_type,
    target_snapshot_id,
    COUNT(*)        AS nb_items,
    SUM(item_qte)   AS total_qte
FROM fix_mapping_6253
GROUP BY bon_type, target_snapshot_id
ORDER BY bon_type, target_snapshot_id;


-- -----------------------------------------------------------
-- ETAPE 2: UPDATE product_snapshot (quantites)
--          comptant + sortie => DEDUIRE
--          avoir_client      => AJOUTER
-- -----------------------------------------------------------

UPDATE product_snapshot ps
JOIN (
    SELECT
        target_snapshot_id,
        SUM(CASE WHEN bon_type IN ('comptant','sortie') THEN item_qte ELSE 0 END) AS total_a_deduire,
        SUM(CASE WHEN bon_type = 'avoir_client'         THEN item_qte ELSE 0 END) AS total_a_ajouter
    FROM fix_mapping_6253
    WHERE target_snapshot_id IS NOT NULL
    GROUP BY target_snapshot_id
) changes ON ps.id = changes.target_snapshot_id
SET ps.quantite = GREATEST(
    ps.quantite - changes.total_a_deduire + changes.total_a_ajouter,
    0
);


-- -----------------------------------------------------------
-- ETAPE 3a: Lier comptant_items au snapshot
-- -----------------------------------------------------------

UPDATE comptant_items ci
JOIN fix_mapping_6253 fm ON fm.item_id = ci.id AND fm.bon_type = 'comptant'
SET ci.product_snapshot_id = fm.target_snapshot_id,
    ci.prix_unitaire        = fm.prix_vente
WHERE fm.target_snapshot_id IS NOT NULL;


-- -----------------------------------------------------------
-- ETAPE 3b: Lier sortie_items au snapshot
-- -----------------------------------------------------------

UPDATE sortie_items si
JOIN fix_mapping_6253 fm ON fm.item_id = si.id AND fm.bon_type = 'sortie'
SET si.product_snapshot_id = fm.target_snapshot_id,
    si.prix_unitaire        = fm.prix_vente
WHERE fm.target_snapshot_id IS NOT NULL;


-- -----------------------------------------------------------
-- ETAPE 3c: Lier avoir_client_items au snapshot
-- -----------------------------------------------------------

UPDATE avoir_client_items aci
JOIN fix_mapping_6253 fm ON fm.item_id = aci.id AND fm.bon_type = 'avoir_client'
SET aci.product_snapshot_id = fm.target_snapshot_id,
    aci.prix_unitaire        = fm.prix_vente
WHERE fm.target_snapshot_id IS NOT NULL;


-- -----------------------------------------------------------
-- ETAPE 4: VERIFICATION - stock final par snapshot
-- -----------------------------------------------------------

SELECT
    ps.id           AS snapshot_id,
    ps.quantite     AS stock_apres_fix,
    ps.prix_achat,
    ps.prix_vente,
    ps.created_at
FROM product_snapshot ps
WHERE ps.product_id = 6253
ORDER BY ps.created_at DESC;

-- Verifier qu'il ne reste plus d'items non lies pour ce produit
SELECT
    'comptant_items non lies' AS check_type,
    COUNT(*) AS reste
FROM comptant_items ci
JOIN bons_comptant bc ON bc.id = ci.bon_comptant_id
WHERE ci.product_id = 6253
  AND ci.product_snapshot_id IS NULL
  AND bc.date_creation > '2026-03-31'

UNION ALL

SELECT 'sortie_items non lies', COUNT(*)
FROM sortie_items si
JOIN bons_sortie bs ON bs.id = si.bon_sortie_id
WHERE si.product_id = 6253
  AND si.product_snapshot_id IS NULL
  AND bs.date_creation > '2026-03-31'

UNION ALL

SELECT 'avoir_client_items non lies', COUNT(*)
FROM avoir_client_items aci
JOIN avoirs_client ac ON ac.id = aci.avoir_client_id
WHERE aci.product_id = 6253
  AND aci.product_snapshot_id IS NULL
  AND ac.date_creation > '2026-03-31';


-- -----------------------------------------------------------
-- ETAPE 5: Si tout est correct => COMMIT, sinon => ROLLBACK
-- -----------------------------------------------------------

DROP TEMPORARY TABLE fix_mapping_6253;

COMMIT;
-- ROLLBACK; -- decommenter si probleme detecte a l'etape 4
