-- ============================================================
-- FIX: lier les commande_items à leur product_snapshot
-- ------------------------------------------------------------
-- Contexte: à la validation d'un bon commande, les product_snapshot
-- sont créés (avec bon_commande_id rempli) mais commande_items.product_snapshot_id
-- restait à NULL/0. On répare en utilisant la liaison déjà présente:
--   ci.bon_commande_id = ps.bon_commande_id
--   ci.product_id      = ps.product_id
--   même variante (NULL/0 traités comme "sans variante")
--
-- ETAPE 1: lancer la DETECTION et vérifier les résultats
-- ETAPE 2: seulement après, lancer le FIX
-- ============================================================


-- ============================================================
-- PARTIE 1: DETECTION (lignes réparables)
-- ============================================================
SELECT
    ci.bon_commande_id,
    ci.id              AS commande_item_id,
    ci.product_id,
    ci.variant_id,
    p.designation,
    ci.quantite,
    ci.product_snapshot_id AS lien_actuel,
    COUNT(ps.id)       AS nb_snapshots_candidats,
    MAX(ps.id)         AS snapshot_choisi
FROM commande_items ci
JOIN products p ON p.id = ci.product_id
JOIN product_snapshot ps
    ON ps.bon_commande_id = ci.bon_commande_id
   AND ps.product_id = ci.product_id
   AND ((NULLIF(ci.variant_id, 0) IS NULL AND ps.variant_id IS NULL)
        OR ps.variant_id = NULLIF(ci.variant_id, 0))
WHERE (ci.product_snapshot_id IS NULL OR ci.product_snapshot_id = 0)
GROUP BY ci.bon_commande_id, ci.id, ci.product_id, ci.variant_id, p.designation, ci.quantite, ci.product_snapshot_id
ORDER BY ci.bon_commande_id DESC, ci.id;


-- (Optionnel) Lignes NON réparables: item sans snapshot correspondant
--   (le bon n'a peut-être jamais été validé / snapshot supprimé)
SELECT
    ci.bon_commande_id,
    ci.id AS commande_item_id,
    ci.product_id,
    ci.variant_id,
    p.designation
FROM commande_items ci
JOIN products p ON p.id = ci.product_id
LEFT JOIN product_snapshot ps
    ON ps.bon_commande_id = ci.bon_commande_id
   AND ps.product_id = ci.product_id
   AND ((NULLIF(ci.variant_id, 0) IS NULL AND ps.variant_id IS NULL)
        OR ps.variant_id = NULLIF(ci.variant_id, 0))
WHERE (ci.product_snapshot_id IS NULL OR ci.product_snapshot_id = 0)
  AND ps.id IS NULL
ORDER BY ci.bon_commande_id DESC, ci.id;


-- ============================================================
-- PARTIE 2: FIX (exécuter après vérification)
-- En cas de plusieurs snapshots candidats pour la même
-- (bon, produit, variante), on prend le plus récent (MAX(ps.id)).
-- ============================================================
UPDATE commande_items ci
JOIN (
    SELECT
        ci2.id AS item_id,
        (
            SELECT ps2.id
            FROM product_snapshot ps2
            WHERE ps2.bon_commande_id = ci2.bon_commande_id
              AND ps2.product_id = ci2.product_id
              AND ((NULLIF(ci2.variant_id, 0) IS NULL AND ps2.variant_id IS NULL)
                   OR ps2.variant_id = NULLIF(ci2.variant_id, 0))
            ORDER BY ps2.created_at DESC, ps2.id DESC
            LIMIT 1
        ) AS best_snapshot_id
    FROM commande_items ci2
    WHERE (ci2.product_snapshot_id IS NULL OR ci2.product_snapshot_id = 0)
) AS fix ON fix.item_id = ci.id
SET ci.product_snapshot_id = fix.best_snapshot_id
WHERE fix.best_snapshot_id IS NOT NULL;


-- ============================================================
-- PARTIE 3: CONTRÔLE après fix (doit retourner 0 ligne réparable)
-- ============================================================
SELECT COUNT(*) AS restant_a_reparer
FROM commande_items ci
JOIN product_snapshot ps
    ON ps.bon_commande_id = ci.bon_commande_id
   AND ps.product_id = ci.product_id
   AND ((NULLIF(ci.variant_id, 0) IS NULL AND ps.variant_id IS NULL)
        OR ps.variant_id = NULLIF(ci.variant_id, 0))
WHERE (ci.product_snapshot_id IS NULL OR ci.product_snapshot_id = 0);
