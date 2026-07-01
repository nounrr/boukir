-- ============================================================================
-- CORRECTION DE STOCK - PARTIE 1 : DETECTION (LECTURE SEULE)
-- ============================================================================
-- Probleme : pendant une periode (a partir du 1er avril 2026), les bons crees
-- (TOUS les types SAUF bon de commande) ont enregistre leurs items SANS lier
-- product_snapshot_id, meme quand un snapshot existait pour le produit/variante.
-- Resultat : le stock du snapshot n'a jamais ete deduit/ajoute, et on ne peut
-- pas voir is_indisponible quand un stock est epuise.
--
-- Cette partie NE MODIFIE RIEN. Elle liste les items concernes pour verification
-- AVANT d'executer 02_correction.sql.
--
-- Tables traitees (items de vente / avoir, JAMAIS commande_items) :
--   - sortie_items          (bons_sortie)        => DEDUIT le stock
--   - comptant_items        (bons_comptant)      => DEDUIT le stock
--   - avoir_fournisseur_items (avoirs_fournisseur)=> DEDUIT le stock (retour AU fournisseur)
--   - avoir_client_items    (avoirs_client)      => AJOUTE le stock (retour DU client)
--   - avoir_comptant_items  (avoirs_comptant)    => AJOUTE le stock (retour DU client)
--
-- Unite speciale : la quantite reelle en stock de base =
--   quantite * conversion_factor (si l'item a un unit_id non-defaut).
-- ============================================================================

SET @DATE_DEBUT = '2026-04-01 00:00:00';

-- ----------------------------------------------------------------------------
-- Vue unifiee de tous les items problematiques (sans snapshot mais snapshot existe)
-- ----------------------------------------------------------------------------
SELECT * FROM (
    SELECT
        CONVERT('sortie' USING utf8mb4) COLLATE utf8mb4_general_ci         AS type_bon,
        'DEDUIT'                                                            AS sens_stock,
        bs.id            AS bon_id,
        bs.date_creation AS date_creation,
        si.id            AS item_id,
        si.product_id,
        NULLIF(si.variant_id, 0) AS variant_id,
        si.unit_id,
        si.quantite      AS quantite_item,
        COALESCE(pu.conversion_factor, 1) AS facteur,
        (si.quantite * COALESCE(pu.conversion_factor, 1)) AS quantite_base,
        si.is_indisponible,
        (SELECT COUNT(*) FROM product_snapshot ps
           WHERE ps.product_id = si.product_id
             AND ((NULLIF(si.variant_id,0) IS NULL AND ps.variant_id IS NULL)
                  OR ps.variant_id = NULLIF(si.variant_id,0))) AS nb_snapshots,
        (SELECT SUM(ps.quantite) FROM product_snapshot ps
           WHERE ps.product_id = si.product_id
             AND ((NULLIF(si.variant_id,0) IS NULL AND ps.variant_id IS NULL)
                  OR ps.variant_id = NULLIF(si.variant_id,0))) AS stock_snapshot_total
    FROM bons_sortie bs
    JOIN sortie_items si ON si.bon_sortie_id = bs.id
    LEFT JOIN product_units pu ON pu.id = si.unit_id
    WHERE si.product_snapshot_id IS NULL
      AND bs.date_creation >= @DATE_DEBUT
      AND EXISTS (SELECT 1 FROM product_snapshot ps
                   WHERE ps.product_id = si.product_id
                     AND ((NULLIF(si.variant_id,0) IS NULL AND ps.variant_id IS NULL)
                          OR ps.variant_id = NULLIF(si.variant_id,0)))

    UNION ALL

    SELECT
        CONVERT('comptant' USING utf8mb4) COLLATE utf8mb4_general_ci,
        'DEDUIT',
        bc.id, bc.date_creation, ci.id, ci.product_id,
        NULLIF(ci.variant_id, 0), ci.unit_id, ci.quantite,
        COALESCE(pu.conversion_factor, 1),
        (ci.quantite * COALESCE(pu.conversion_factor, 1)),
        ci.is_indisponible,
        (SELECT COUNT(*) FROM product_snapshot ps
           WHERE ps.product_id = ci.product_id
             AND ((NULLIF(ci.variant_id,0) IS NULL AND ps.variant_id IS NULL)
                  OR ps.variant_id = NULLIF(ci.variant_id,0))),
        (SELECT SUM(ps.quantite) FROM product_snapshot ps
           WHERE ps.product_id = ci.product_id
             AND ((NULLIF(ci.variant_id,0) IS NULL AND ps.variant_id IS NULL)
                  OR ps.variant_id = NULLIF(ci.variant_id,0)))
    FROM bons_comptant bc
    JOIN comptant_items ci ON ci.bon_comptant_id = bc.id
    LEFT JOIN product_units pu ON pu.id = ci.unit_id
    WHERE ci.product_snapshot_id IS NULL
      AND bc.date_creation >= @DATE_DEBUT
      AND EXISTS (SELECT 1 FROM product_snapshot ps
                   WHERE ps.product_id = ci.product_id
                     AND ((NULLIF(ci.variant_id,0) IS NULL AND ps.variant_id IS NULL)
                          OR ps.variant_id = NULLIF(ci.variant_id,0)))

    UNION ALL

    SELECT
        CONVERT('avoir_fournisseur' USING utf8mb4) COLLATE utf8mb4_general_ci,
        'DEDUIT',
        af.id, af.date_creation, afi.id, afi.product_id,
        NULLIF(afi.variant_id, 0), afi.unit_id, afi.quantite,
        COALESCE(pu.conversion_factor, 1),
        (afi.quantite * COALESCE(pu.conversion_factor, 1)),
        afi.is_indisponible,
        (SELECT COUNT(*) FROM product_snapshot ps
           WHERE ps.product_id = afi.product_id
             AND ((NULLIF(afi.variant_id,0) IS NULL AND ps.variant_id IS NULL)
                  OR ps.variant_id = NULLIF(afi.variant_id,0))),
        (SELECT SUM(ps.quantite) FROM product_snapshot ps
           WHERE ps.product_id = afi.product_id
             AND ((NULLIF(afi.variant_id,0) IS NULL AND ps.variant_id IS NULL)
                  OR ps.variant_id = NULLIF(afi.variant_id,0)))
    FROM avoirs_fournisseur af
    JOIN avoir_fournisseur_items afi ON afi.avoir_fournisseur_id = af.id
    LEFT JOIN product_units pu ON pu.id = afi.unit_id
    WHERE afi.product_snapshot_id IS NULL
      AND af.date_creation >= @DATE_DEBUT
      AND EXISTS (SELECT 1 FROM product_snapshot ps
                   WHERE ps.product_id = afi.product_id
                     AND ((NULLIF(afi.variant_id,0) IS NULL AND ps.variant_id IS NULL)
                          OR ps.variant_id = NULLIF(afi.variant_id,0)))

    UNION ALL

    SELECT
        CONVERT('avoir_client' USING utf8mb4) COLLATE utf8mb4_general_ci,
        'AJOUTE',
        ac.id, ac.date_creation, aci.id, aci.product_id,
        NULLIF(aci.variant_id, 0), aci.unit_id, aci.quantite,
        COALESCE(pu.conversion_factor, 1),
        (aci.quantite * COALESCE(pu.conversion_factor, 1)),
        aci.is_indisponible,
        (SELECT COUNT(*) FROM product_snapshot ps
           WHERE ps.product_id = aci.product_id
             AND ((NULLIF(aci.variant_id,0) IS NULL AND ps.variant_id IS NULL)
                  OR ps.variant_id = NULLIF(aci.variant_id,0))),
        (SELECT SUM(ps.quantite) FROM product_snapshot ps
           WHERE ps.product_id = aci.product_id
             AND ((NULLIF(aci.variant_id,0) IS NULL AND ps.variant_id IS NULL)
                  OR ps.variant_id = NULLIF(aci.variant_id,0)))
    FROM avoirs_client ac
    JOIN avoir_client_items aci ON aci.avoir_client_id = ac.id
    LEFT JOIN product_units pu ON pu.id = aci.unit_id
    WHERE aci.product_snapshot_id IS NULL
      AND ac.date_creation >= @DATE_DEBUT
      AND EXISTS (SELECT 1 FROM product_snapshot ps
                   WHERE ps.product_id = aci.product_id
                     AND ((NULLIF(aci.variant_id,0) IS NULL AND ps.variant_id IS NULL)
                          OR ps.variant_id = NULLIF(aci.variant_id,0)))

    UNION ALL

    SELECT
        CONVERT('avoir_comptant' USING utf8mb4) COLLATE utf8mb4_general_ci,
        'AJOUTE',
        acp.id, acp.date_creation, acpi.id, acpi.product_id,
        NULLIF(acpi.variant_id, 0), acpi.unit_id, acpi.quantite,
        COALESCE(pu.conversion_factor, 1),
        (acpi.quantite * COALESCE(pu.conversion_factor, 1)),
        acpi.is_indisponible,
        (SELECT COUNT(*) FROM product_snapshot ps
           WHERE ps.product_id = acpi.product_id
             AND ((NULLIF(acpi.variant_id,0) IS NULL AND ps.variant_id IS NULL)
                  OR ps.variant_id = NULLIF(acpi.variant_id,0))),
        (SELECT SUM(ps.quantite) FROM product_snapshot ps
           WHERE ps.product_id = acpi.product_id
             AND ((NULLIF(acpi.variant_id,0) IS NULL AND ps.variant_id IS NULL)
                  OR ps.variant_id = NULLIF(acpi.variant_id,0)))
    FROM avoirs_comptant acp
    JOIN avoir_comptant_items acpi ON acpi.avoir_comptant_id = acp.id
    LEFT JOIN product_units pu ON pu.id = acpi.unit_id
    WHERE acpi.product_snapshot_id IS NULL
      AND acp.date_creation >= @DATE_DEBUT
      AND EXISTS (SELECT 1 FROM product_snapshot ps
                   WHERE ps.product_id = acpi.product_id
                     AND ((NULLIF(acpi.variant_id,0) IS NULL AND ps.variant_id IS NULL)
                          OR ps.variant_id = NULLIF(acpi.variant_id,0)))
) AS detail
ORDER BY type_bon, date_creation, bon_id, item_id;


-- ----------------------------------------------------------------------------
-- Resume par produit / variante (combien d'items, quel volume, quel stock dispo)
-- ----------------------------------------------------------------------------
SELECT
    detail.product_id,
    detail.variant_id,
    p.designation,
    COUNT(*)                       AS nb_items,
    SUM(detail.quantite_base)      AS qte_base_totale,
    MAX(detail.nb_snapshots)       AS nb_snapshots,
    MAX(detail.stock_snapshot_total) AS stock_snapshot_total,
    MIN(detail.date_creation)      AS premiere_date,
    MAX(detail.date_creation)      AS derniere_date,
    GROUP_CONCAT(DISTINCT detail.sens_stock ORDER BY detail.sens_stock SEPARATOR ',') AS sens
FROM (
    SELECT 'sortie' t, si.product_id, NULLIF(si.variant_id,0) variant_id,
           (si.quantite*COALESCE(pu.conversion_factor,1)) quantite_base, bs.date_creation,
           'DEDUIT' sens_stock,
           (SELECT COUNT(*) FROM product_snapshot ps WHERE ps.product_id=si.product_id
              AND ((NULLIF(si.variant_id,0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id=NULLIF(si.variant_id,0))) nb_snapshots,
           (SELECT SUM(ps.quantite) FROM product_snapshot ps WHERE ps.product_id=si.product_id
              AND ((NULLIF(si.variant_id,0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id=NULLIF(si.variant_id,0))) stock_snapshot_total
    FROM bons_sortie bs JOIN sortie_items si ON si.bon_sortie_id=bs.id
    LEFT JOIN product_units pu ON pu.id=si.unit_id
    WHERE si.product_snapshot_id IS NULL AND bs.date_creation>=@DATE_DEBUT
      AND EXISTS (SELECT 1 FROM product_snapshot ps WHERE ps.product_id=si.product_id
                   AND ((NULLIF(si.variant_id,0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id=NULLIF(si.variant_id,0)))
    UNION ALL
    SELECT 'comptant', ci.product_id, NULLIF(ci.variant_id,0),
           (ci.quantite*COALESCE(pu.conversion_factor,1)), bc.date_creation, 'DEDUIT',
           (SELECT COUNT(*) FROM product_snapshot ps WHERE ps.product_id=ci.product_id
              AND ((NULLIF(ci.variant_id,0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id=NULLIF(ci.variant_id,0))),
           (SELECT SUM(ps.quantite) FROM product_snapshot ps WHERE ps.product_id=ci.product_id
              AND ((NULLIF(ci.variant_id,0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id=NULLIF(ci.variant_id,0)))
    FROM bons_comptant bc JOIN comptant_items ci ON ci.bon_comptant_id=bc.id
    LEFT JOIN product_units pu ON pu.id=ci.unit_id
    WHERE ci.product_snapshot_id IS NULL AND bc.date_creation>=@DATE_DEBUT
      AND EXISTS (SELECT 1 FROM product_snapshot ps WHERE ps.product_id=ci.product_id
                   AND ((NULLIF(ci.variant_id,0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id=NULLIF(ci.variant_id,0)))
    UNION ALL
    SELECT 'avoir_fournisseur', afi.product_id, NULLIF(afi.variant_id,0),
           (afi.quantite*COALESCE(pu.conversion_factor,1)), af.date_creation, 'DEDUIT',
           (SELECT COUNT(*) FROM product_snapshot ps WHERE ps.product_id=afi.product_id
              AND ((NULLIF(afi.variant_id,0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id=NULLIF(afi.variant_id,0))),
           (SELECT SUM(ps.quantite) FROM product_snapshot ps WHERE ps.product_id=afi.product_id
              AND ((NULLIF(afi.variant_id,0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id=NULLIF(afi.variant_id,0)))
    FROM avoirs_fournisseur af JOIN avoir_fournisseur_items afi ON afi.avoir_fournisseur_id=af.id
    LEFT JOIN product_units pu ON pu.id=afi.unit_id
    WHERE afi.product_snapshot_id IS NULL AND af.date_creation>=@DATE_DEBUT
      AND EXISTS (SELECT 1 FROM product_snapshot ps WHERE ps.product_id=afi.product_id
                   AND ((NULLIF(afi.variant_id,0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id=NULLIF(afi.variant_id,0)))
    UNION ALL
    SELECT 'avoir_client', aci.product_id, NULLIF(aci.variant_id,0),
           (aci.quantite*COALESCE(pu.conversion_factor,1)), ac.date_creation, 'AJOUTE',
           (SELECT COUNT(*) FROM product_snapshot ps WHERE ps.product_id=aci.product_id
              AND ((NULLIF(aci.variant_id,0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id=NULLIF(aci.variant_id,0))),
           (SELECT SUM(ps.quantite) FROM product_snapshot ps WHERE ps.product_id=aci.product_id
              AND ((NULLIF(aci.variant_id,0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id=NULLIF(aci.variant_id,0)))
    FROM avoirs_client ac JOIN avoir_client_items aci ON aci.avoir_client_id=ac.id
    LEFT JOIN product_units pu ON pu.id=aci.unit_id
    WHERE aci.product_snapshot_id IS NULL AND ac.date_creation>=@DATE_DEBUT
      AND EXISTS (SELECT 1 FROM product_snapshot ps WHERE ps.product_id=aci.product_id
                   AND ((NULLIF(aci.variant_id,0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id=NULLIF(aci.variant_id,0)))
    UNION ALL
    SELECT 'avoir_comptant', acpi.product_id, NULLIF(acpi.variant_id,0),
           (acpi.quantite*COALESCE(pu.conversion_factor,1)), acp.date_creation, 'AJOUTE',
           (SELECT COUNT(*) FROM product_snapshot ps WHERE ps.product_id=acpi.product_id
              AND ((NULLIF(acpi.variant_id,0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id=NULLIF(acpi.variant_id,0))),
           (SELECT SUM(ps.quantite) FROM product_snapshot ps WHERE ps.product_id=acpi.product_id
              AND ((NULLIF(acpi.variant_id,0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id=NULLIF(acpi.variant_id,0)))
    FROM avoirs_comptant acp JOIN avoir_comptant_items acpi ON acpi.avoir_comptant_id=acp.id
    LEFT JOIN product_units pu ON pu.id=acpi.unit_id
    WHERE acpi.product_snapshot_id IS NULL AND acp.date_creation>=@DATE_DEBUT
      AND EXISTS (SELECT 1 FROM product_snapshot ps WHERE ps.product_id=acpi.product_id
                   AND ((NULLIF(acpi.variant_id,0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id=NULLIF(acpi.variant_id,0)))
) AS detail
JOIN products p ON p.id = detail.product_id
GROUP BY detail.product_id, detail.variant_id, p.designation
ORDER BY nb_items DESC, detail.product_id, detail.variant_id;
