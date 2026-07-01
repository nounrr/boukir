-- ============================================================================
-- CORRECTION DE STOCK - PARTIE 2 : CORRECTION (FIFO) - MODIFIE LES DONNEES
-- ============================================================================
-- A executer SEULEMENT apres avoir verifie les resultats de 01_detection.sql
-- et apres avoir fait une SAUVEGARDE de la base.
--
-- Ce script :
--   1. Detecte tous les items (bons crees a partir du 1er avril 2026) qui n'ont
--      pas de product_snapshot_id alors qu'un snapshot existe pour le
--      produit/variante.   (TOUS les bons SAUF bon de commande)
--   2. Les traite dans l'ordre chronologique (date du bon, puis id item) pour
--      garder un FIFO coherent.
--   3. FIFO :
--        - sens DEDUIT (sortie / comptant / avoir fournisseur) :
--          consomme les snapshots par created_at ASC (le plus ancien d'abord),
--          lie l'item au 1er snapshot consomme, baisse les quantites.
--          Si le stock total est insuffisant => snapshots a 0 + is_indisponible=1.
--        - sens AJOUTE (avoir client / avoir comptant) :
--          ajoute la quantite au snapshot le plus recent (created_at DESC) et
--          lie l'item a ce snapshot.
--   4. La quantite appliquee au stock est en UNITE DE BASE :
--          quantite_item * conversion_factor  (facteur via unit_id / product_units)
--   5. NE MODIFIE AUCUN PRIX (ni prix_unitaire, ni prix_achat, ni prix_vente).
--      Seuls product_snapshot_id, is_indisponible et product_snapshot.quantite
--      sont modifies.
--
-- Gere aussi bien les produits (variant_id NULL) que les variantes.
-- ============================================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS corriger_stock_snapshots $$

CREATE PROCEDURE corriger_stock_snapshots(IN p_date_debut DATETIME, IN p_dry_run TINYINT)
proc: BEGIN
    -- Curseur sur tous les items problematiques, dans l'ordre chronologique
    DECLARE done INT DEFAULT 0;
    DECLARE v_type         VARCHAR(32);
    DECLARE v_sens         VARCHAR(8);
    DECLARE v_item_id      INT;
    DECLARE v_product_id   INT;
    DECLARE v_variant_id   INT;     -- NULL = produit simple
    DECLARE v_qte_base     DECIMAL(20,4);  -- quantite a appliquer en unite de base
    DECLARE v_date_bon     DATETIME;

    -- Variables FIFO
    DECLARE v_remaining    DECIMAL(20,4);
    DECLARE v_first_snap   INT;
    DECLARE v_snap_id      INT;
    DECLARE v_snap_qte     DECIMAL(20,4);
    DECLARE v_take         DECIMAL(20,4);
    DECLARE v_target_snap  INT;     -- snapshot ou on lie l'item
    DECLARE v_indispo      TINYINT;

    DECLARE cur CURSOR FOR
        SELECT * FROM (
            SELECT 'sortie' AS type_bon, 'DEDUIT' AS sens, si.id AS item_id,
                   si.product_id, NULLIF(si.variant_id,0) AS variant_id,
                   (si.quantite * COALESCE(pu.conversion_factor,1)) AS qte_base,
                   bs.date_creation AS d
            FROM bons_sortie bs JOIN sortie_items si ON si.bon_sortie_id=bs.id
            LEFT JOIN product_units pu ON pu.id=si.unit_id
            WHERE si.product_snapshot_id IS NULL AND bs.date_creation>=p_date_debut
              AND EXISTS (SELECT 1 FROM product_snapshot ps WHERE ps.product_id=si.product_id
                           AND ((NULLIF(si.variant_id,0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id=NULLIF(si.variant_id,0)))
            UNION ALL
            SELECT 'comptant','DEDUIT', ci.id, ci.product_id, NULLIF(ci.variant_id,0),
                   (ci.quantite * COALESCE(pu.conversion_factor,1)), bc.date_creation
            FROM bons_comptant bc JOIN comptant_items ci ON ci.bon_comptant_id=bc.id
            LEFT JOIN product_units pu ON pu.id=ci.unit_id
            WHERE ci.product_snapshot_id IS NULL AND bc.date_creation>=p_date_debut
              AND EXISTS (SELECT 1 FROM product_snapshot ps WHERE ps.product_id=ci.product_id
                           AND ((NULLIF(ci.variant_id,0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id=NULLIF(ci.variant_id,0)))
            UNION ALL
            SELECT 'avoir_fournisseur','DEDUIT', afi.id, afi.product_id, NULLIF(afi.variant_id,0),
                   (afi.quantite * COALESCE(pu.conversion_factor,1)), af.date_creation
            FROM avoirs_fournisseur af JOIN avoir_fournisseur_items afi ON afi.avoir_fournisseur_id=af.id
            LEFT JOIN product_units pu ON pu.id=afi.unit_id
            WHERE afi.product_snapshot_id IS NULL AND af.date_creation>=p_date_debut
              AND EXISTS (SELECT 1 FROM product_snapshot ps WHERE ps.product_id=afi.product_id
                           AND ((NULLIF(afi.variant_id,0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id=NULLIF(afi.variant_id,0)))
            UNION ALL
            SELECT 'avoir_client','AJOUTE', aci.id, aci.product_id, NULLIF(aci.variant_id,0),
                   (aci.quantite * COALESCE(pu.conversion_factor,1)), ac.date_creation
            FROM avoirs_client ac JOIN avoir_client_items aci ON aci.avoir_client_id=ac.id
            LEFT JOIN product_units pu ON pu.id=aci.unit_id
            WHERE aci.product_snapshot_id IS NULL AND ac.date_creation>=p_date_debut
              AND EXISTS (SELECT 1 FROM product_snapshot ps WHERE ps.product_id=aci.product_id
                           AND ((NULLIF(aci.variant_id,0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id=NULLIF(aci.variant_id,0)))
            UNION ALL
            SELECT 'avoir_comptant','AJOUTE', acpi.id, acpi.product_id, NULLIF(acpi.variant_id,0),
                   (acpi.quantite * COALESCE(pu.conversion_factor,1)), acp.date_creation
            FROM avoirs_comptant acp JOIN avoir_comptant_items acpi ON acpi.avoir_comptant_id=acp.id
            LEFT JOIN product_units pu ON pu.id=acpi.unit_id
            WHERE acpi.product_snapshot_id IS NULL AND acp.date_creation>=p_date_debut
              AND EXISTS (SELECT 1 FROM product_snapshot ps WHERE ps.product_id=acpi.product_id
                           AND ((NULLIF(acpi.variant_id,0) IS NULL AND ps.variant_id IS NULL) OR ps.variant_id=NULLIF(acpi.variant_id,0)))
        ) AS q
        ORDER BY d ASC, type_bon ASC, item_id ASC;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

    -- Journal des modifications (pour verification, surtout en dry-run)
    DROP TEMPORARY TABLE IF EXISTS tmp_corrections_log;
    CREATE TEMPORARY TABLE tmp_corrections_log (
        type_bon      VARCHAR(32),
        sens          VARCHAR(8),
        item_id       INT,
        product_id    INT,
        variant_id    INT,
        qte_base      DECIMAL(20,4),
        snapshot_lie  INT,
        is_indisponible TINYINT,
        note          VARCHAR(255)
    );

    OPEN cur;
    boucle: LOOP
        FETCH cur INTO v_type, v_sens, v_item_id, v_product_id, v_variant_id, v_qte_base, v_date_bon;
        IF done = 1 THEN LEAVE boucle; END IF;

        SET v_target_snap = NULL;
        SET v_indispo     = 0;

        IF v_qte_base IS NULL OR v_qte_base = 0 THEN
            -- Rien a consommer/ajouter : on lie quand meme au snapshot le plus recent
            SELECT ps.id INTO v_target_snap
            FROM product_snapshot ps
            WHERE ps.product_id = v_product_id
              AND ((v_variant_id IS NULL AND ps.variant_id IS NULL) OR ps.variant_id = v_variant_id)
            ORDER BY ps.created_at DESC, ps.id DESC
            LIMIT 1;
        ELSEIF v_sens = 'AJOUTE' THEN
            -- Retour en stock : ajoute au snapshot le plus recent
            SELECT ps.id INTO v_target_snap
            FROM product_snapshot ps
            WHERE ps.product_id = v_product_id
              AND ((v_variant_id IS NULL AND ps.variant_id IS NULL) OR ps.variant_id = v_variant_id)
            ORDER BY ps.created_at DESC, ps.id DESC
            LIMIT 1;

            IF NOT p_dry_run AND v_target_snap IS NOT NULL THEN
                UPDATE product_snapshot SET quantite = quantite + v_qte_base WHERE id = v_target_snap;
            END IF;
        ELSE
            -- sens DEDUIT : FIFO sur les snapshots, du plus ancien au plus recent
            SET v_remaining  = v_qte_base;
            SET v_first_snap = NULL;

            blkfifo: BEGIN
                DECLARE done2 INT DEFAULT 0;
                DECLARE cur2 CURSOR FOR
                    SELECT ps.id, ps.quantite
                    FROM product_snapshot ps
                    WHERE ps.product_id = v_product_id
                      AND ((v_variant_id IS NULL AND ps.variant_id IS NULL) OR ps.variant_id = v_variant_id)
                    ORDER BY ps.created_at ASC, ps.id ASC;
                DECLARE CONTINUE HANDLER FOR NOT FOUND SET done2 = 1;

                OPEN cur2;
                fifo: LOOP
                    FETCH cur2 INTO v_snap_id, v_snap_qte;
                    IF done2 = 1 THEN LEAVE fifo; END IF;

                    -- Memoriser le 1er snapshot qui a du stock dispo (>0) : c'est le snapshot lie
                    IF v_first_snap IS NULL AND v_snap_qte > 0 THEN
                        SET v_first_snap = v_snap_id;
                    END IF;

                    IF v_remaining > 0 AND v_snap_qte > 0 THEN
                        SET v_take = LEAST(v_snap_qte, v_remaining);
                        IF NOT p_dry_run THEN
                            UPDATE product_snapshot SET quantite = quantite - v_take WHERE id = v_snap_id;
                        END IF;
                        SET v_remaining = v_remaining - v_take;
                    END IF;
                END LOOP;
                CLOSE cur2;
            END blkfifo;

            -- Snapshot a lier : le 1er avec du stock ; sinon (tout etait a 0) le plus recent
            SET v_target_snap = v_first_snap;
            IF v_target_snap IS NULL THEN
                SELECT ps.id INTO v_target_snap
                FROM product_snapshot ps
                WHERE ps.product_id = v_product_id
                  AND ((v_variant_id IS NULL AND ps.variant_id IS NULL) OR ps.variant_id = v_variant_id)
                ORDER BY ps.created_at DESC, ps.id DESC
                LIMIT 1;
            END IF;

            -- Stock insuffisant => item indisponible
            IF v_remaining > 0 THEN
                SET v_indispo = 1;
            END IF;
        END IF;

        -- Appliquer la liaison + is_indisponible sur la bonne table d'items
        IF NOT p_dry_run AND v_target_snap IS NOT NULL THEN
            IF v_type = 'sortie' THEN
                UPDATE sortie_items
                   SET product_snapshot_id = v_target_snap,
                       is_indisponible = GREATEST(is_indisponible, v_indispo)
                 WHERE id = v_item_id;
            ELSEIF v_type = 'comptant' THEN
                UPDATE comptant_items
                   SET product_snapshot_id = v_target_snap,
                       is_indisponible = GREATEST(is_indisponible, v_indispo)
                 WHERE id = v_item_id;
            ELSEIF v_type = 'avoir_fournisseur' THEN
                UPDATE avoir_fournisseur_items
                   SET product_snapshot_id = v_target_snap,
                       is_indisponible = GREATEST(is_indisponible, v_indispo)
                 WHERE id = v_item_id;
            ELSEIF v_type = 'avoir_client' THEN
                UPDATE avoir_client_items
                   SET product_snapshot_id = v_target_snap,
                       is_indisponible = GREATEST(is_indisponible, v_indispo)
                 WHERE id = v_item_id;
            ELSEIF v_type = 'avoir_comptant' THEN
                UPDATE avoir_comptant_items
                   SET product_snapshot_id = v_target_snap,
                       is_indisponible = GREATEST(is_indisponible, v_indispo)
                 WHERE id = v_item_id;
            END IF;
        END IF;

        INSERT INTO tmp_corrections_log
            (type_bon, sens, item_id, product_id, variant_id, qte_base, snapshot_lie, is_indisponible, note)
        VALUES
            (v_type, v_sens, v_item_id, v_product_id, v_variant_id, v_qte_base, v_target_snap, v_indispo,
             IF(p_dry_run, 'DRY-RUN (aucune modif appliquee)', 'applique'));
    END LOOP;
    CLOSE cur;

    -- Resultat : journal des corrections
    SELECT * FROM tmp_corrections_log ORDER BY type_bon, item_id;

    SELECT
        COUNT(*)                              AS total_items_traites,
        SUM(snapshot_lie IS NOT NULL)         AS items_lies,
        SUM(is_indisponible = 1)              AS items_indisponibles,
        IF(p_dry_run, 'DRY-RUN', 'APPLIQUE') AS mode
    FROM tmp_corrections_log;
END proc $$

DELIMITER ;

-- ============================================================================
-- EXECUTION
-- ============================================================================
-- 1) D'abord en DRY-RUN (ne modifie rien, montre seulement ce qui serait fait) :
--    IMPORTANT phpMyAdmin:
--    Execute d'abord ce fichier pour creer la procedure, puis execute le CALL
--    tout seul dans un nouvel onglet SQL. Sinon phpMyAdmin peut lever:
--    #2014 - Commands out of sync
-- CALL corriger_stock_snapshots('2026-04-01 00:00:00', 1);

-- 2) Apres verification du journal ci-dessus ET sauvegarde, lancer en reel :
--    (decommenter la ligne suivante)
-- CALL corriger_stock_snapshots('2026-04-01 00:00:00', 0);

-- Nettoyage optionnel :
-- DROP PROCEDURE IF EXISTS corriger_stock_snapshots;
