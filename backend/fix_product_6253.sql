-- ============================================================
-- PRODUIT ID 6253 - Detection de tous les bons sans liaison snapshot
-- Memes conditions: date > 2026-03-31, product_snapshot_id IS NULL,
--                  prix_achat=0, cout_revient=0, multi-snapshot
-- ============================================================

-- -----------------------------------------------------------
-- PARTIE A: DETAIL PAR BON (toutes les lignes concernees)
-- -----------------------------------------------------------

SELECT
    CONVERT('bons_comptant' USING utf8mb4) COLLATE utf8mb4_general_ci AS type_bon,
    bc.id AS bon_id,
    bc.date_creation,
    CONVERT(bc.client_nom USING utf8mb4) COLLATE utf8mb4_general_ci AS client_nom,
    ci.id AS item_id,
    ci.product_id,
    ci.quantite,
    ci.prix_unitaire,
    ci.product_snapshot_id,
    COUNT(ps.id) AS nb_snapshots_dispo,
    SUM(ps.quantite) AS stock_total_en_snapshots
FROM bons_comptant bc
JOIN comptant_items ci ON ci.bon_comptant_id = bc.id
JOIN products p ON p.id = ci.product_id
JOIN product_snapshot ps ON ps.product_id = ci.product_id AND ps.quantite > 0
WHERE ci.product_id = 6253
  AND ci.product_snapshot_id IS NULL
  AND bc.date_creation > '2026-03-31'
  AND p.prix_achat = 0
  AND p.cout_revient = 0
GROUP BY bc.id, bc.date_creation, bc.client_nom, ci.id, ci.product_id, ci.quantite, ci.prix_unitaire
HAVING COUNT(ps.id) > 1

UNION ALL

SELECT
    CONVERT('bons_sortie' USING utf8mb4) COLLATE utf8mb4_general_ci AS type_bon,
    bs.id AS bon_id,
    bs.date_creation,
    CAST(NULL AS CHAR) COLLATE utf8mb4_general_ci AS client_nom,
    si.id AS item_id,
    si.product_id,
    si.quantite,
    si.prix_unitaire,
    si.product_snapshot_id,
    COUNT(ps.id) AS nb_snapshots_dispo,
    SUM(ps.quantite) AS stock_total_en_snapshots
FROM bons_sortie bs
JOIN sortie_items si ON si.bon_sortie_id = bs.id
JOIN products p ON p.id = si.product_id
JOIN product_snapshot ps ON ps.product_id = si.product_id AND ps.quantite > 0
WHERE si.product_id = 6253
  AND si.product_snapshot_id IS NULL
  AND bs.date_creation > '2026-03-31'
  AND p.prix_achat = 0
  AND p.cout_revient = 0
GROUP BY bs.id, bs.date_creation, si.id, si.product_id, si.quantite, si.prix_unitaire
HAVING COUNT(ps.id) > 1

UNION ALL

SELECT
    CONVERT('avoir_client' USING utf8mb4) COLLATE utf8mb4_general_ci AS type_bon,
    ac.id AS bon_id,
    ac.date_creation,
    CAST(NULL AS CHAR) COLLATE utf8mb4_general_ci AS client_nom,
    aci.id AS item_id,
    aci.product_id,
    aci.quantite,
    aci.prix_unitaire,
    aci.product_snapshot_id,
    COUNT(ps.id) AS nb_snapshots_dispo,
    SUM(ps.quantite) AS stock_total_en_snapshots
FROM avoirs_client ac
JOIN avoir_client_items aci ON aci.avoir_client_id = ac.id
JOIN products p ON p.id = aci.product_id
JOIN product_snapshot ps ON ps.product_id = aci.product_id AND ps.quantite > 0
WHERE aci.product_id = 6253
  AND aci.product_snapshot_id IS NULL
  AND ac.date_creation > '2026-03-31'
  AND p.prix_achat = 0
  AND p.cout_revient = 0
GROUP BY ac.id, ac.date_creation, aci.id, aci.product_id, aci.quantite, aci.prix_unitaire
HAVING COUNT(ps.id) > 1

UNION ALL

SELECT
    CONVERT('avoir_comptant' USING utf8mb4) COLLATE utf8mb4_general_ci AS type_bon,
    acp.id AS bon_id,
    acp.date_creation,
    CONVERT(acp.client_nom USING utf8mb4) COLLATE utf8mb4_general_ci AS client_nom,
    acpi.id AS item_id,
    acpi.product_id,
    acpi.quantite,
    acpi.prix_unitaire,
    acpi.product_snapshot_id,
    COUNT(ps.id) AS nb_snapshots_dispo,
    SUM(ps.quantite) AS stock_total_en_snapshots
FROM avoirs_comptant acp
JOIN avoir_comptant_items acpi ON acpi.avoir_comptant_id = acp.id
JOIN products p ON p.id = acpi.product_id
JOIN product_snapshot ps ON ps.product_id = acpi.product_id AND ps.quantite > 0
WHERE acpi.product_id = 6253
  AND acpi.product_snapshot_id IS NULL
  AND acp.date_creation > '2026-03-31'
  AND p.prix_achat = 0
  AND p.cout_revient = 0
GROUP BY acp.id, acp.date_creation, acp.client_nom, acpi.id, acpi.product_id, acpi.quantite, acpi.prix_unitaire
HAVING COUNT(ps.id) > 1

ORDER BY date_creation DESC;


-- -----------------------------------------------------------
-- PARTIE B: RESUME - Total quantite non liee au snapshot
--           par type de bon pour le produit 6253
-- -----------------------------------------------------------

WITH items_6253 AS (
    SELECT 'bons_comptant' AS type_bon, ci.quantite
    FROM comptant_items ci
    JOIN bons_comptant bc ON bc.id = ci.bon_comptant_id
    JOIN products p ON p.id = ci.product_id
    JOIN product_snapshot ps ON ps.product_id = ci.product_id AND ps.quantite > 0
    WHERE ci.product_id = 6253
      AND ci.product_snapshot_id IS NULL
      AND bc.date_creation > '2026-03-31'
      AND p.prix_achat = 0 AND p.cout_revient = 0
    GROUP BY ci.id, ci.quantite
    HAVING COUNT(ps.id) > 1

    UNION ALL

    SELECT 'bons_sortie', si.quantite
    FROM sortie_items si
    JOIN bons_sortie bs ON bs.id = si.bon_sortie_id
    JOIN products p ON p.id = si.product_id
    JOIN product_snapshot ps ON ps.product_id = si.product_id AND ps.quantite > 0
    WHERE si.product_id = 6253
      AND si.product_snapshot_id IS NULL
      AND bs.date_creation > '2026-03-31'
      AND p.prix_achat = 0 AND p.cout_revient = 0
    GROUP BY si.id, si.quantite
    HAVING COUNT(ps.id) > 1

    UNION ALL

    SELECT 'avoir_client', aci.quantite
    FROM avoir_client_items aci
    JOIN avoirs_client ac ON ac.id = aci.avoir_client_id
    JOIN products p ON p.id = aci.product_id
    JOIN product_snapshot ps ON ps.product_id = aci.product_id AND ps.quantite > 0
    WHERE aci.product_id = 6253
      AND aci.product_snapshot_id IS NULL
      AND ac.date_creation > '2026-03-31'
      AND p.prix_achat = 0 AND p.cout_revient = 0
    GROUP BY aci.id, aci.quantite
    HAVING COUNT(ps.id) > 1

    UNION ALL

    SELECT 'avoir_comptant', acpi.quantite
    FROM avoir_comptant_items acpi
    JOIN avoirs_comptant acp ON acp.id = acpi.avoir_comptant_id
    JOIN products p ON p.id = acpi.product_id
    JOIN product_snapshot ps ON ps.product_id = acpi.product_id AND ps.quantite > 0
    WHERE acpi.product_id = 6253
      AND acpi.product_snapshot_id IS NULL
      AND acp.date_creation > '2026-03-31'
      AND p.prix_achat = 0 AND p.cout_revient = 0
    GROUP BY acpi.id, acpi.quantite
    HAVING COUNT(ps.id) > 1
)
SELECT type_bon,
       COUNT(*)       AS nb_items_problematiques,
       SUM(quantite)  AS qte_totale_non_liee
FROM items_6253
GROUP BY type_bon

UNION ALL

SELECT 'TOTAL',
       COUNT(*)       AS nb_items_problematiques,
       SUM(quantite)  AS qte_totale_non_liee
FROM items_6253;


-- -----------------------------------------------------------
-- PARTIE C: SNAPSHOTS DISPONIBLES pour le produit 6253
--           (pour savoir quoi lier)
-- -----------------------------------------------------------
-- NOTE: PARTIE D et E necessitent d'etre lancees ensemble (CTEs partagees)
--       PARTIE E STANDALONE ci-dessous = lancer seule sans PARTIE D
-- -----------------------------------------------------------

-- PARTIE E STANDALONE: Stock restant apres fix (query autonome)
WITH
comptant_fix AS (
    SELECT ci.id AS item_id, ci.quantite AS item_qte,
        (SELECT ps2.id FROM product_snapshot ps2
         WHERE ps2.product_id = 6253 AND ps2.quantite > 0
         ORDER BY CASE WHEN ps2.quantite >= ci.quantite THEN 0 ELSE 1 END, ps2.created_at DESC
         LIMIT 1) AS target_snapshot_id
    FROM comptant_items ci
    JOIN bons_comptant bc ON bc.id = ci.bon_comptant_id
    JOIN products p ON p.id = ci.product_id
    JOIN product_snapshot ps ON ps.product_id = 6253 AND ps.quantite > 0
    WHERE ci.product_id = 6253 AND ci.product_snapshot_id IS NULL
      AND bc.date_creation > '2026-03-31' AND p.prix_achat = 0 AND p.cout_revient = 0
    GROUP BY ci.id, ci.quantite HAVING COUNT(ps.id) > 1
),
sortie_fix AS (
    SELECT si.id AS item_id, si.quantite AS item_qte,
        (SELECT ps2.id FROM product_snapshot ps2
         WHERE ps2.product_id = 6253 AND ps2.quantite > 0
         ORDER BY CASE WHEN ps2.quantite >= si.quantite THEN 0 ELSE 1 END, ps2.created_at DESC
         LIMIT 1) AS target_snapshot_id
    FROM sortie_items si
    JOIN bons_sortie bs ON bs.id = si.bon_sortie_id
    JOIN products p ON p.id = si.product_id
    JOIN product_snapshot ps ON ps.product_id = 6253 AND ps.quantite > 0
    WHERE si.product_id = 6253 AND si.product_snapshot_id IS NULL
      AND bs.date_creation > '2026-03-31' AND p.prix_achat = 0 AND p.cout_revient = 0
    GROUP BY si.id, si.quantite HAVING COUNT(ps.id) > 1
),
avoir_client_fix AS (
    SELECT aci.id AS item_id, aci.quantite AS item_qte,
        (SELECT ps2.id FROM product_snapshot ps2
         WHERE ps2.product_id = 6253 AND ps2.quantite > 0
         ORDER BY CASE WHEN ps2.quantite >= aci.quantite THEN 0 ELSE 1 END, ps2.created_at DESC
         LIMIT 1) AS target_snapshot_id
    FROM avoir_client_items aci
    JOIN avoirs_client ac ON ac.id = aci.avoir_client_id
    JOIN products p ON p.id = aci.product_id
    JOIN product_snapshot ps ON ps.product_id = 6253 AND ps.quantite > 0
    WHERE aci.product_id = 6253 AND aci.product_snapshot_id IS NULL
      AND ac.date_creation > '2026-03-31' AND p.prix_achat = 0 AND p.cout_revient = 0
    GROUP BY aci.id, aci.quantite HAVING COUNT(ps.id) > 1
)
SELECT
    SUM(ps.quantite)                    AS stock_total_actuel,
    COALESCE(SUM(m.total_a_deduire), 0) AS total_a_deduire,
    COALESCE(SUM(m.total_a_ajouter), 0) AS total_a_ajouter,
    GREATEST(
        SUM(ps.quantite)
        - COALESCE(SUM(m.total_a_deduire), 0)
        + COALESCE(SUM(m.total_a_ajouter), 0),
    0)                                  AS stock_total_apres_fix
FROM product_snapshot ps
LEFT JOIN (
    SELECT target_snapshot_id,
           SUM(total_sortie) AS total_a_deduire,
           SUM(total_retour) AS total_a_ajouter
    FROM (
        SELECT target_snapshot_id, SUM(item_qte) AS total_sortie, 0 AS total_retour FROM comptant_fix GROUP BY target_snapshot_id
        UNION ALL
        SELECT target_snapshot_id, SUM(item_qte), 0 FROM sortie_fix GROUP BY target_snapshot_id
        UNION ALL
        SELECT target_snapshot_id, 0, SUM(item_qte) FROM avoir_client_fix GROUP BY target_snapshot_id
    ) x GROUP BY target_snapshot_id
) m ON m.target_snapshot_id = ps.id
WHERE ps.product_id = 6253;

-- -----------------------------------------------------------

SELECT
    ps.id AS snapshot_id,
    ps.quantite,
    ps.prix_achat,
    ps.prix_vente,
    ps.cout_revient,
    ps.bon_commande_id,
    ps.created_at
FROM product_snapshot ps
WHERE ps.product_id = 6253
  AND ps.quantite > 0
ORDER BY ps.created_at DESC;


-- -----------------------------------------------------------
-- PARTIE D: SIMULATION - Stock restant PAR SNAPSHOT apres UPDATE
-- Logique du fix: chaque item non lie choisit le snapshot
--   le plus recent avec quantite >= item.quantite
--   sinon celui avec le max de quantite
-- Cette query montre ce qui va etre deduit/ajoute par snapshot
-- AUCUNE MODIFICATION - lecture seule
-- -----------------------------------------------------------

WITH

-- Snapshot cible choisi pour chaque item comptant problematique
comptant_fix AS (
    SELECT
        ci.id AS item_id,
        ci.quantite AS item_qte,
        (
            SELECT ps2.id
            FROM product_snapshot ps2
            WHERE ps2.product_id = 6253 AND ps2.quantite > 0
            ORDER BY CASE WHEN ps2.quantite >= ci.quantite THEN 0 ELSE 1 END,
                     ps2.created_at DESC
            LIMIT 1
        ) AS target_snapshot_id
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
),

-- Snapshot cible choisi pour chaque item sortie problematique
sortie_fix AS (
    SELECT
        si.id AS item_id,
        si.quantite AS item_qte,
        (
            SELECT ps2.id
            FROM product_snapshot ps2
            WHERE ps2.product_id = 6253 AND ps2.quantite > 0
            ORDER BY CASE WHEN ps2.quantite >= si.quantite THEN 0 ELSE 1 END,
                     ps2.created_at DESC
            LIMIT 1
        ) AS target_snapshot_id
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
),

-- Snapshot cible choisi pour chaque item avoir_client (AJOUT stock)
avoir_client_fix AS (
    SELECT
        aci.id AS item_id,
        aci.quantite AS item_qte,
        (
            SELECT ps2.id
            FROM product_snapshot ps2
            WHERE ps2.product_id = 6253 AND ps2.quantite > 0
            ORDER BY CASE WHEN ps2.quantite >= aci.quantite THEN 0 ELSE 1 END,
                     ps2.created_at DESC
            LIMIT 1
        ) AS target_snapshot_id
    FROM avoir_client_items aci
    JOIN avoirs_client ac ON ac.id = aci.avoir_client_id
    JOIN products p ON p.id = aci.product_id
    JOIN product_snapshot ps ON ps.product_id = 6253 AND ps.quantite > 0
    WHERE aci.product_id = 6253
      AND aci.product_snapshot_id IS NULL
      AND ac.date_creation > '2026-03-31'
      AND p.prix_achat = 0 AND p.cout_revient = 0
    GROUP BY aci.id, aci.quantite
    HAVING COUNT(ps.id) > 1
),

-- Mouvement net par snapshot (deduction - ajout)
mouvements AS (
    SELECT target_snapshot_id, SUM(item_qte) AS total_sortie, 0 AS total_retour
    FROM comptant_fix GROUP BY target_snapshot_id
    UNION ALL
    SELECT target_snapshot_id, SUM(item_qte), 0
    FROM sortie_fix GROUP BY target_snapshot_id
    UNION ALL
    SELECT target_snapshot_id, 0, SUM(item_qte)
    FROM avoir_client_fix GROUP BY target_snapshot_id
),

mouv_agg AS (
    SELECT
        target_snapshot_id,
        SUM(total_sortie) AS total_a_deduire,
        SUM(total_retour) AS total_a_ajouter
    FROM mouvements
    GROUP BY target_snapshot_id
)

-- RESULTAT FINAL: stock actuel vs stock apres fix par snapshot
SELECT
    ps.id                                                   AS snapshot_id,
    ps.created_at                                           AS date_snapshot,
    ps.prix_achat,
    ps.prix_vente,
    ps.quantite                                             AS stock_actuel,
    COALESCE(m.total_a_deduire, 0)                         AS qte_a_deduire,
    COALESCE(m.total_a_ajouter, 0)                         AS qte_a_ajouter,
    GREATEST(
        ps.quantite
        - COALESCE(m.total_a_deduire, 0)
        + COALESCE(m.total_a_ajouter, 0),
    0)                                                      AS stock_apres_fix
FROM product_snapshot ps
LEFT JOIN mouv_agg m ON m.target_snapshot_id = ps.id
WHERE ps.product_id = 6253
ORDER BY ps.created_at DESC;


-- -----------------------------------------------------------
-- PARTIE E: RESUME GLOBAL - Total stock produit 6253
-- -----------------------------------------------------------

SELECT
    SUM(ps.quantite)                                        AS stock_total_actuel,
    COALESCE(SUM(m.total_a_deduire), 0)                    AS total_a_deduire,
    COALESCE(SUM(m.total_a_ajouter), 0)                    AS total_a_ajouter,
    GREATEST(
        SUM(ps.quantite)
        - COALESCE(SUM(m.total_a_deduire), 0)
        + COALESCE(SUM(m.total_a_ajouter), 0),
    0)                                                      AS stock_total_apres_fix
FROM product_snapshot ps
LEFT JOIN (
    SELECT target_snapshot_id,
           SUM(total_sortie) AS total_a_deduire,
           SUM(total_retour) AS total_a_ajouter
    FROM (
        SELECT target_snapshot_id, SUM(item_qte) AS total_sortie, 0 AS total_retour FROM comptant_fix GROUP BY target_snapshot_id
        UNION ALL
        SELECT target_snapshot_id, SUM(item_qte), 0 FROM sortie_fix GROUP BY target_snapshot_id
        UNION ALL
        SELECT target_snapshot_id, 0, SUM(item_qte) FROM avoir_client_fix GROUP BY target_snapshot_id
    ) x GROUP BY target_snapshot_id
) m ON m.target_snapshot_id = ps.id
WHERE ps.product_id = 6253;
