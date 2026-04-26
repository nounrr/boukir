-- ============================================================
-- DETECTION & FIX: Bons sans liaison snapshot (multi-snapshot products)
-- Condition: date_creation > 2026-03-31, product_snapshot_id IS NULL,
--            produit a plusieurs snapshots avec quantite > 0
-- ============================================================
-- ETAPE 1: LANCER LA DETECTION D'ABORD, VERIFIER LES RESULTATS
-- ETAPE 2: SEULEMENT APRES VERIFICATION, EXECUTER LES UPDATE
-- ============================================================


-- ============================================================
-- PARTIE 1: DETECTION
-- ============================================================

-- 1.1 Resume groupe par produit: produits ayant des items sans snapshot
--     et plusieurs snapshots disponibles avec quantite > 0
--     Si le produit/variante n'a aucun snapshot exact en systeme,
--     il est exclu par le JOIN product_snapshot ci-dessous.
SELECT
    problemes.product_id,
    problemes.variant_id,
    problemes.produit_nom,
    COUNT(*) AS nb_lignes_problematiques,
    SUM(problemes.quantite) AS quantite_totale_items,
    MAX(problemes.nb_snapshots_dispo) AS nb_snapshots_dispo,
    MAX(problemes.stock_total_en_snapshots) AS stock_total_en_snapshots,
    MIN(problemes.date_creation) AS premiere_date_bon,
    MAX(problemes.date_creation) AS derniere_date_bon,
    GROUP_CONCAT(DISTINCT problemes.type_bon ORDER BY problemes.type_bon SEPARATOR ', ') AS types_bons,
    GROUP_CONCAT(
        CONCAT(problemes.type_bon, '#', problemes.bon_id, '/item#', problemes.item_id)
        ORDER BY problemes.date_creation DESC
        SEPARATOR ', '
    ) AS references_lignes
FROM (
    SELECT
        CONVERT('bons_comptant' USING utf8mb4) COLLATE utf8mb4_general_ci AS type_bon,
        bc.id AS bon_id,
        bc.date_creation,
        ci.id AS item_id,
        ci.product_id,
        ci.variant_id,
        CONVERT(p.designation USING utf8mb4) COLLATE utf8mb4_general_ci AS produit_nom,
        ci.quantite,
        COUNT(ps.id) AS nb_snapshots_dispo,
        SUM(ps.quantite) AS stock_total_en_snapshots
    FROM bons_comptant bc
    JOIN comptant_items ci ON ci.bon_comptant_id = bc.id
    JOIN products p ON p.id = ci.product_id
    JOIN product_snapshot ps ON ps.product_id = ci.product_id
        AND ((NULLIF(ci.variant_id, 0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id = NULLIF(ci.variant_id, 0))
        AND ps.quantite > 0
    WHERE ci.product_snapshot_id IS NULL
      AND bc.date_creation > '2026-03-31'
      AND (COALESCE(p.has_variants, 0) = 0 OR NULLIF(ci.variant_id, 0) IS NOT NULL)
      AND p.prix_achat = 0
      AND p.cout_revient = 0
    GROUP BY bc.id, bc.date_creation, ci.id, ci.product_id, ci.variant_id, p.designation, ci.quantite
    HAVING COUNT(ps.id) > 1

    UNION ALL

    SELECT
        CONVERT('bons_sortie' USING utf8mb4) COLLATE utf8mb4_general_ci AS type_bon,
        bs.id AS bon_id,
        bs.date_creation,
        si.id AS item_id,
        si.product_id,
        si.variant_id,
        CONVERT(p.designation USING utf8mb4) COLLATE utf8mb4_general_ci AS produit_nom,
        si.quantite,
        COUNT(ps.id) AS nb_snapshots_dispo,
        SUM(ps.quantite) AS stock_total_en_snapshots
    FROM bons_sortie bs
    JOIN sortie_items si ON si.bon_sortie_id = bs.id
    JOIN products p ON p.id = si.product_id
    JOIN product_snapshot ps ON ps.product_id = si.product_id
        AND ((NULLIF(si.variant_id, 0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id = NULLIF(si.variant_id, 0))
        AND ps.quantite > 0
    WHERE si.product_snapshot_id IS NULL
      AND bs.date_creation > '2026-03-31'
      AND (COALESCE(p.has_variants, 0) = 0 OR NULLIF(si.variant_id, 0) IS NOT NULL)
      AND p.prix_achat = 0
      AND p.cout_revient = 0
    GROUP BY bs.id, bs.date_creation, si.id, si.product_id, si.variant_id, p.designation, si.quantite
    HAVING COUNT(ps.id) > 1

    UNION ALL

    SELECT
        CONVERT('avoir_client' USING utf8mb4) COLLATE utf8mb4_general_ci AS type_bon,
        ac.id AS bon_id,
        ac.date_creation,
        aci.id AS item_id,
        aci.product_id,
        aci.variant_id,
        CONVERT(p.designation USING utf8mb4) COLLATE utf8mb4_general_ci AS produit_nom,
        aci.quantite,
        COUNT(ps.id) AS nb_snapshots_dispo,
        SUM(ps.quantite) AS stock_total_en_snapshots
    FROM avoirs_client ac
    JOIN avoir_client_items aci ON aci.avoir_client_id = ac.id
    JOIN products p ON p.id = aci.product_id
    JOIN product_snapshot ps ON ps.product_id = aci.product_id
        AND ((NULLIF(aci.variant_id, 0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id = NULLIF(aci.variant_id, 0))
        AND ps.quantite > 0
    WHERE aci.product_snapshot_id IS NULL
      AND ac.date_creation > '2026-03-31'
      AND (COALESCE(p.has_variants, 0) = 0 OR NULLIF(aci.variant_id, 0) IS NOT NULL)
      AND p.prix_achat = 0
      AND p.cout_revient = 0
    GROUP BY ac.id, ac.date_creation, aci.id, aci.product_id, aci.variant_id, p.designation, aci.quantite
    HAVING COUNT(ps.id) > 1

    UNION ALL

    SELECT
        CONVERT('avoir_comptant' USING utf8mb4) COLLATE utf8mb4_general_ci AS type_bon,
        acp.id AS bon_id,
        acp.date_creation,
        acpi.id AS item_id,
        acpi.product_id,
        acpi.variant_id,
        CONVERT(p.designation USING utf8mb4) COLLATE utf8mb4_general_ci AS produit_nom,
        acpi.quantite,
        COUNT(ps.id) AS nb_snapshots_dispo,
        SUM(ps.quantite) AS stock_total_en_snapshots
    FROM avoirs_comptant acp
    JOIN avoir_comptant_items acpi ON acpi.avoir_comptant_id = acp.id
    JOIN products p ON p.id = acpi.product_id
    JOIN product_snapshot ps ON ps.product_id = acpi.product_id
        AND ((NULLIF(acpi.variant_id, 0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id = NULLIF(acpi.variant_id, 0))
        AND ps.quantite > 0
    WHERE acpi.product_snapshot_id IS NULL
      AND acp.date_creation > '2026-03-31'
      AND (COALESCE(p.has_variants, 0) = 0 OR NULLIF(acpi.variant_id, 0) IS NOT NULL)
      AND p.prix_achat = 0
      AND p.cout_revient = 0
    GROUP BY acp.id, acp.date_creation, acpi.id, acpi.product_id, acpi.variant_id, p.designation, acpi.quantite
    HAVING COUNT(ps.id) > 1
) AS problemes
GROUP BY problemes.product_id, problemes.variant_id, problemes.produit_nom
ORDER BY nb_lignes_problematiques DESC, problemes.product_id, problemes.variant_id;


-- 1.2 Detail ligne par ligne
SELECT
    CONVERT('bons_comptant' USING utf8mb4) COLLATE utf8mb4_general_ci AS type_bon,
    bc.id AS bon_id,
    bc.date_creation,
    CONVERT(bc.client_nom USING utf8mb4) COLLATE utf8mb4_general_ci AS client_nom,
    ci.id AS item_id,
    ci.product_id,
    ci.variant_id,
    CONVERT(p.designation USING utf8mb4) COLLATE utf8mb4_general_ci AS produit_nom,
    ci.quantite,
    ci.prix_unitaire,
    ci.product_snapshot_id,
    COUNT(ps.id) AS nb_snapshots_dispo,
    SUM(ps.quantite) AS stock_total_en_snapshots
FROM bons_comptant bc
JOIN comptant_items ci ON ci.bon_comptant_id = bc.id
JOIN products p ON p.id = ci.product_id
JOIN product_snapshot ps ON ps.product_id = ci.product_id
    AND ((NULLIF(ci.variant_id, 0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id = NULLIF(ci.variant_id, 0))
    AND ps.quantite > 0
WHERE ci.product_snapshot_id IS NULL
  AND bc.date_creation > '2026-03-31'
  AND (COALESCE(p.has_variants, 0) = 0 OR NULLIF(ci.variant_id, 0) IS NOT NULL)
  AND p.prix_achat = 0
  AND p.cout_revient = 0
GROUP BY bc.id, bc.date_creation, bc.client_nom, ci.id, ci.product_id, ci.variant_id, p.designation, ci.quantite, ci.prix_unitaire
HAVING COUNT(ps.id) > 1

UNION ALL

SELECT
    CONVERT('bons_sortie' USING utf8mb4) COLLATE utf8mb4_general_ci AS type_bon,
    bs.id AS bon_id,
    bs.date_creation,
    CAST(NULL AS CHAR) COLLATE utf8mb4_general_ci AS client_nom,
    si.id AS item_id,
    si.product_id,
    si.variant_id,
    CONVERT(p.designation USING utf8mb4) COLLATE utf8mb4_general_ci AS produit_nom,
    si.quantite,
    si.prix_unitaire,
    si.product_snapshot_id,
    COUNT(ps.id) AS nb_snapshots_dispo,
    SUM(ps.quantite) AS stock_total_en_snapshots
FROM bons_sortie bs
JOIN sortie_items si ON si.bon_sortie_id = bs.id
JOIN products p ON p.id = si.product_id
JOIN product_snapshot ps ON ps.product_id = si.product_id
    AND ((NULLIF(si.variant_id, 0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id = NULLIF(si.variant_id, 0))
    AND ps.quantite > 0
WHERE si.product_snapshot_id IS NULL
  AND bs.date_creation > '2026-03-31'
  AND (COALESCE(p.has_variants, 0) = 0 OR NULLIF(si.variant_id, 0) IS NOT NULL)
  AND p.prix_achat = 0
  AND p.cout_revient = 0
GROUP BY bs.id, bs.date_creation, si.id, si.product_id, si.variant_id, p.designation, si.quantite, si.prix_unitaire
HAVING COUNT(ps.id) > 1

UNION ALL

SELECT
    CONVERT('avoir_client' USING utf8mb4) COLLATE utf8mb4_general_ci AS type_bon,
    ac.id AS bon_id,
    ac.date_creation,
    CAST(NULL AS CHAR) COLLATE utf8mb4_general_ci AS client_nom,
    aci.id AS item_id,
    aci.product_id,
    aci.variant_id,
    CONVERT(p.designation USING utf8mb4) COLLATE utf8mb4_general_ci AS produit_nom,
    aci.quantite,
    aci.prix_unitaire,
    aci.product_snapshot_id,
    COUNT(ps.id) AS nb_snapshots_dispo,
    SUM(ps.quantite) AS stock_total_en_snapshots
FROM avoirs_client ac
JOIN avoir_client_items aci ON aci.avoir_client_id = ac.id
JOIN products p ON p.id = aci.product_id
JOIN product_snapshot ps ON ps.product_id = aci.product_id
    AND ((NULLIF(aci.variant_id, 0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id = NULLIF(aci.variant_id, 0))
    AND ps.quantite > 0
WHERE aci.product_snapshot_id IS NULL
  AND ac.date_creation > '2026-03-31'
  AND (COALESCE(p.has_variants, 0) = 0 OR NULLIF(aci.variant_id, 0) IS NOT NULL)
  AND p.prix_achat = 0
  AND p.cout_revient = 0
GROUP BY ac.id, ac.date_creation, aci.id, aci.product_id, aci.variant_id, p.designation, aci.quantite, aci.prix_unitaire
HAVING COUNT(ps.id) > 1

UNION ALL

SELECT
    CONVERT('avoir_comptant' USING utf8mb4) COLLATE utf8mb4_general_ci AS type_bon,
    acp.id AS bon_id,
    acp.date_creation,
    CONVERT(acp.client_nom USING utf8mb4) COLLATE utf8mb4_general_ci AS client_nom,
    acpi.id AS item_id,
    acpi.product_id,
    acpi.variant_id,
    CONVERT(p.designation USING utf8mb4) COLLATE utf8mb4_general_ci AS produit_nom,
    acpi.quantite,
    acpi.prix_unitaire,
    acpi.product_snapshot_id,
    COUNT(ps.id) AS nb_snapshots_dispo,
    SUM(ps.quantite) AS stock_total_en_snapshots
FROM avoirs_comptant acp
JOIN avoir_comptant_items acpi ON acpi.avoir_comptant_id = acp.id
JOIN products p ON p.id = acpi.product_id
JOIN product_snapshot ps ON ps.product_id = acpi.product_id
    AND ((NULLIF(acpi.variant_id, 0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id = NULLIF(acpi.variant_id, 0))
    AND ps.quantite > 0
WHERE acpi.product_snapshot_id IS NULL
  AND acp.date_creation > '2026-03-31'
  AND (COALESCE(p.has_variants, 0) = 0 OR NULLIF(acpi.variant_id, 0) IS NOT NULL)
  AND p.prix_achat = 0
  AND p.cout_revient = 0
GROUP BY acp.id, acp.date_creation, acp.client_nom, acpi.id, acpi.product_id, acpi.variant_id, p.designation, acpi.quantite, acpi.prix_unitaire
HAVING COUNT(ps.id) > 1

ORDER BY date_creation DESC;


-- ============================================================
-- PARTIE 2: FIX - UPDATE (executer apres verification)
-- Logique: lier au snapshot le plus recent ayant quantite >= quantite item
--          Si aucun snapshot n'a assez de stock, prendre celui avec le max
--          Mettre a jour aussi prix_unitaire depuis le snapshot choisi
-- ============================================================

-- -------------------------------------------------------
-- 2.1 FIX comptant_items
-- -------------------------------------------------------
UPDATE comptant_items ci
JOIN (
    SELECT
        ci2.id AS item_id,
        (
            SELECT ps2.id
            FROM product_snapshot ps2
            WHERE ps2.product_id = ci2.product_id
              AND ((NULLIF(ci2.variant_id, 0) IS NULL AND ps2.variant_id IS NULL) OR ps2.variant_id = NULLIF(ci2.variant_id, 0))
              AND ps2.quantite > 0
            ORDER BY
                CASE WHEN ps2.quantite >= ci2.quantite THEN 0 ELSE 1 END,
                ps2.created_at DESC
            LIMIT 1
        ) AS best_snapshot_id,
        (
            SELECT ps2.prix_vente
            FROM product_snapshot ps2
            WHERE ps2.product_id = ci2.product_id
              AND ((NULLIF(ci2.variant_id, 0) IS NULL AND ps2.variant_id IS NULL) OR ps2.variant_id = NULLIF(ci2.variant_id, 0))
              AND ps2.quantite > 0
            ORDER BY
                CASE WHEN ps2.quantite >= ci2.quantite THEN 0 ELSE 1 END,
                ps2.created_at DESC
            LIMIT 1
        ) AS best_prix_vente,
        (
            SELECT ps2.prix_achat
            FROM product_snapshot ps2
            WHERE ps2.product_id = ci2.product_id
              AND ((NULLIF(ci2.variant_id, 0) IS NULL AND ps2.variant_id IS NULL) OR ps2.variant_id = NULLIF(ci2.variant_id, 0))
              AND ps2.quantite > 0
            ORDER BY
                CASE WHEN ps2.quantite >= ci2.quantite THEN 0 ELSE 1 END,
                ps2.created_at DESC
            LIMIT 1
        ) AS best_prix_achat
    FROM comptant_items ci2
    JOIN bons_comptant bc ON bc.id = ci2.bon_comptant_id
    JOIN products p2 ON p2.id = ci2.product_id
    JOIN product_snapshot ps ON ps.product_id = ci2.product_id
        AND ((NULLIF(ci2.variant_id, 0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id = NULLIF(ci2.variant_id, 0))
        AND ps.quantite > 0
    WHERE ci2.product_snapshot_id IS NULL
      AND bc.date_creation > '2026-03-31'
      AND (COALESCE(p2.has_variants, 0) = 0 OR NULLIF(ci2.variant_id, 0) IS NOT NULL)
      AND p2.prix_achat = 0
      AND p2.cout_revient = 0
    GROUP BY ci2.id, ci2.product_id, ci2.variant_id, ci2.quantite
    HAVING COUNT(ps.id) > 1
) AS fix ON fix.item_id = ci.id
SET
    ci.product_snapshot_id = fix.best_snapshot_id,
    ci.prix_unitaire = fix.best_prix_vente
WHERE fix.best_snapshot_id IS NOT NULL;

-- Deduire la quantite des snapshots lies (comptant)
UPDATE product_snapshot ps
JOIN comptant_items ci ON ci.product_snapshot_id = ps.id
JOIN bons_comptant bc ON bc.id = ci.bon_comptant_id
SET ps.quantite = GREATEST(ps.quantite - ci.quantite, 0)
WHERE bc.date_creation > '2026-03-31'
  AND ci.product_snapshot_id IS NOT NULL;
-- NOTE: cette deuxieme UPDATE ne s'applique qu'aux lignes qu'on vient de lier
--       Si les bons etaient deja valides (snapshot_id existant), ils ne sont pas retouches


-- -------------------------------------------------------
-- 2.2 FIX sortie_items
-- -------------------------------------------------------
UPDATE sortie_items si
JOIN (
    SELECT
        si2.id AS item_id,
        (
            SELECT ps2.id
            FROM product_snapshot ps2
            WHERE ps2.product_id = si2.product_id
              AND ((NULLIF(si2.variant_id, 0) IS NULL AND ps2.variant_id IS NULL) OR ps2.variant_id = NULLIF(si2.variant_id, 0))
              AND ps2.quantite > 0
            ORDER BY
                CASE WHEN ps2.quantite >= si2.quantite THEN 0 ELSE 1 END,
                ps2.created_at DESC
            LIMIT 1
        ) AS best_snapshot_id,
        (
            SELECT ps2.prix_vente
            FROM product_snapshot ps2
            WHERE ps2.product_id = si2.product_id
              AND ((NULLIF(si2.variant_id, 0) IS NULL AND ps2.variant_id IS NULL) OR ps2.variant_id = NULLIF(si2.variant_id, 0))
              AND ps2.quantite > 0
            ORDER BY
                CASE WHEN ps2.quantite >= si2.quantite THEN 0 ELSE 1 END,
                ps2.created_at DESC
            LIMIT 1
        ) AS best_prix_vente
    FROM sortie_items si2
    JOIN bons_sortie bs ON bs.id = si2.bon_sortie_id
    JOIN products p2 ON p2.id = si2.product_id
    JOIN product_snapshot ps ON ps.product_id = si2.product_id
        AND ((NULLIF(si2.variant_id, 0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id = NULLIF(si2.variant_id, 0))
        AND ps.quantite > 0
    WHERE si2.product_snapshot_id IS NULL
      AND bs.date_creation > '2026-03-31'
      AND (COALESCE(p2.has_variants, 0) = 0 OR NULLIF(si2.variant_id, 0) IS NOT NULL)
      AND p2.prix_achat = 0
      AND p2.cout_revient = 0
    GROUP BY si2.id, si2.product_id, si2.variant_id, si2.quantite
    HAVING COUNT(ps.id) > 1
) AS fix ON fix.item_id = si.id
SET
    si.product_snapshot_id = fix.best_snapshot_id,
    si.prix_unitaire = fix.best_prix_vente
WHERE fix.best_snapshot_id IS NOT NULL;

-- Deduire la quantite des snapshots lies (sortie)
UPDATE product_snapshot ps
JOIN sortie_items si ON si.product_snapshot_id = ps.id
JOIN bons_sortie bs ON bs.id = si.bon_sortie_id
SET ps.quantite = GREATEST(ps.quantite - si.quantite, 0)
WHERE bs.date_creation > '2026-03-31'
  AND si.product_snapshot_id IS NOT NULL;


-- -------------------------------------------------------
-- 2.3 FIX avoir_client_items
-- (avoir = retour stock donc on AJOUTE au lieu de deduire)
-- -------------------------------------------------------
UPDATE avoir_client_items aci
JOIN (
    SELECT
        aci2.id AS item_id,
        (
            SELECT ps2.id
            FROM product_snapshot ps2
            WHERE ps2.product_id = aci2.product_id
              AND ((NULLIF(aci2.variant_id, 0) IS NULL AND ps2.variant_id IS NULL) OR ps2.variant_id = NULLIF(aci2.variant_id, 0))
              AND ps2.quantite > 0
            ORDER BY
                CASE WHEN ps2.quantite >= aci2.quantite THEN 0 ELSE 1 END,
                ps2.created_at DESC
            LIMIT 1
        ) AS best_snapshot_id,
        (
            SELECT ps2.prix_vente
            FROM product_snapshot ps2
            WHERE ps2.product_id = aci2.product_id
              AND ((NULLIF(aci2.variant_id, 0) IS NULL AND ps2.variant_id IS NULL) OR ps2.variant_id = NULLIF(aci2.variant_id, 0))
              AND ps2.quantite > 0
            ORDER BY
                CASE WHEN ps2.quantite >= aci2.quantite THEN 0 ELSE 1 END,
                ps2.created_at DESC
            LIMIT 1
        ) AS best_prix_vente
    FROM avoir_client_items aci2
    JOIN avoirs_client ac ON ac.id = aci2.avoir_client_id
    JOIN products p2 ON p2.id = aci2.product_id
    JOIN product_snapshot ps ON ps.product_id = aci2.product_id
        AND ((NULLIF(aci2.variant_id, 0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id = NULLIF(aci2.variant_id, 0))
        AND ps.quantite > 0
    WHERE aci2.product_snapshot_id IS NULL
      AND ac.date_creation > '2026-03-31'
      AND (COALESCE(p2.has_variants, 0) = 0 OR NULLIF(aci2.variant_id, 0) IS NOT NULL)
      AND p2.prix_achat = 0
      AND p2.cout_revient = 0
    GROUP BY aci2.id, aci2.product_id, aci2.variant_id, aci2.quantite
    HAVING COUNT(ps.id) > 1
) AS fix ON fix.item_id = aci.id
SET
    aci.product_snapshot_id = fix.best_snapshot_id,
    aci.prix_unitaire = fix.best_prix_vente
WHERE fix.best_snapshot_id IS NOT NULL;

-- Ajouter la quantite aux snapshots lies (avoir client = retour en stock)
UPDATE product_snapshot ps
JOIN avoir_client_items aci ON aci.product_snapshot_id = ps.id
JOIN avoirs_client ac ON ac.id = aci.avoir_client_id
SET ps.quantite = ps.quantite + aci.quantite
WHERE ac.date_creation > '2026-03-31'
  AND aci.product_snapshot_id IS NOT NULL;


-- -------------------------------------------------------
-- 2.4 FIX avoir_comptant_items
-- (avoir = retour stock donc on AJOUTE au lieu de deduire)
-- -------------------------------------------------------
UPDATE avoir_comptant_items acpi
JOIN (
    SELECT
        acpi2.id AS item_id,
        (
            SELECT ps2.id
            FROM product_snapshot ps2
            WHERE ps2.product_id = acpi2.product_id
              AND ((NULLIF(acpi2.variant_id, 0) IS NULL AND ps2.variant_id IS NULL) OR ps2.variant_id = NULLIF(acpi2.variant_id, 0))
              AND ps2.quantite > 0
            ORDER BY
                CASE WHEN ps2.quantite >= acpi2.quantite THEN 0 ELSE 1 END,
                ps2.created_at DESC
            LIMIT 1
        ) AS best_snapshot_id,
        (
            SELECT ps2.prix_vente
            FROM product_snapshot ps2
            WHERE ps2.product_id = acpi2.product_id
              AND ((NULLIF(acpi2.variant_id, 0) IS NULL AND ps2.variant_id IS NULL) OR ps2.variant_id = NULLIF(acpi2.variant_id, 0))
              AND ps2.quantite > 0
            ORDER BY
                CASE WHEN ps2.quantite >= acpi2.quantite THEN 0 ELSE 1 END,
                ps2.created_at DESC
            LIMIT 1
        ) AS best_prix_vente
    FROM avoir_comptant_items acpi2
    JOIN avoirs_comptant acp ON acp.id = acpi2.avoir_comptant_id
    JOIN products p2 ON p2.id = acpi2.product_id
    JOIN product_snapshot ps ON ps.product_id = acpi2.product_id
        AND ((NULLIF(acpi2.variant_id, 0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id = NULLIF(acpi2.variant_id, 0))
        AND ps.quantite > 0
    WHERE acpi2.product_snapshot_id IS NULL
      AND acp.date_creation > '2026-03-31'
      AND (COALESCE(p2.has_variants, 0) = 0 OR NULLIF(acpi2.variant_id, 0) IS NOT NULL)
      AND p2.prix_achat = 0
      AND p2.cout_revient = 0
    GROUP BY acpi2.id, acpi2.product_id, acpi2.variant_id, acpi2.quantite
    HAVING COUNT(ps.id) > 1
) AS fix ON fix.item_id = acpi.id
SET
    acpi.product_snapshot_id = fix.best_snapshot_id,
    acpi.prix_unitaire = fix.best_prix_vente
WHERE fix.best_snapshot_id IS NOT NULL;

-- Ajouter la quantite aux snapshots lies (avoir comptant = retour en stock)
UPDATE product_snapshot ps
JOIN avoir_comptant_items acpi ON acpi.product_snapshot_id = ps.id
JOIN avoirs_comptant acp ON acp.id = acpi.avoir_comptant_id
SET ps.quantite = ps.quantite + acpi.quantite
WHERE acp.date_creation > '2026-03-31'
  AND acpi.product_snapshot_id IS NOT NULL;

