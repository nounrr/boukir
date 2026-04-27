-- ============================================================
-- FIX UPDATE - Produit 6253
-- LOGIQUE FIFO: vider chaque snapshot completement (du plus
-- ancien au plus recent) avant de passer au suivant.
--
-- REGLES:
--   - NE PAS modifier prix_unitaire des items
--   - Seulement: SET product_snapshot_id = <snapshot choisi>
--   - Ajuster product_snapshot.quantite
--   - comptant/sortie => DEDUIRE
--   - avoir_client    => AJOUTER
--
-- ⚠️ IMPORTANT: ARRETER LE SERVEUR NODE (npm run dev:full)
--    AVANT DE LANCER CE SCRIPT !
--    Sinon le backend cree des ALTER TABLE qui bloquent tout.
-- ============================================================

-- -----------------------------------------------------------
-- ETAPE 0: ETAT AVANT
-- -----------------------------------------------------------

SELECT '=== ETAT AVANT FIX ===' AS etape;

SELECT ps.product_id, ps.variant_id, ps.id AS snapshot_id, ps.quantite AS stock_actuel, ps.prix_vente, ps.created_at
FROM product_snapshot ps
WHERE ps.product_id = 6253
ORDER BY ps.product_id, ps.variant_id, ps.created_at DESC;

SELECT product_id, variant_id, SUM(quantite) AS stock_total_avant
FROM product_snapshot
WHERE product_id = 6253
GROUP BY product_id, variant_id;


-- -----------------------------------------------------------
-- ETAPE 1: Preparer les tables + procedure
-- -----------------------------------------------------------

DROP TEMPORARY TABLE IF EXISTS fix_items_6253;
DROP TEMPORARY TABLE IF EXISTS fix_mapping_6253;
DROP TEMPORARY TABLE IF EXISTS snapshot_stock_6253;

CREATE TEMPORARY TABLE fix_items_6253 (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT,
    variant_id INT NULL,
    bon_type VARCHAR(20),
    item_id INT,
    item_qte DECIMAL(20,3)
);

INSERT INTO fix_items_6253 (product_id, variant_id, bon_type, item_id, item_qte)
SELECT ci.product_id, ci.variant_id, 'comptant', ci.id, ci.quantite
FROM comptant_items ci
JOIN bons_comptant bc ON bc.id = ci.bon_comptant_id
WHERE ci.product_id = 6253
  AND ci.product_snapshot_id IS NULL
  AND bc.date_creation >= '2026-03-01'
UNION ALL
SELECT si.product_id, si.variant_id, 'sortie', si.id, si.quantite
FROM sortie_items si
JOIN bons_sortie bs ON bs.id = si.bon_sortie_id
WHERE si.product_id = 6253
  AND si.product_snapshot_id IS NULL
  AND bs.date_creation >= '2026-03-01'
UNION ALL
SELECT aci.product_id, aci.variant_id, 'avoir_client', aci.id, aci.quantite
FROM avoir_client_items aci
JOIN avoirs_client ac ON ac.id = aci.avoir_client_id
WHERE aci.product_id = 6253
  AND aci.product_snapshot_id IS NULL
  AND ac.date_creation >= '2026-03-01';

CREATE TEMPORARY TABLE fix_mapping_6253 (
    product_id INT, variant_id INT NULL, bon_type VARCHAR(20), item_id INT, item_qte DECIMAL(20,3), target_snapshot_id INT
);

CREATE TEMPORARY TABLE snapshot_stock_6253 AS
SELECT product_id, variant_id, id AS snapshot_id, quantite AS remaining, prix_vente, created_at
FROM product_snapshot
WHERE product_id = 6253
  AND quantite > 0;
ALTER TABLE snapshot_stock_6253 ADD INDEX idx_snap (snapshot_id);
ALTER TABLE snapshot_stock_6253 ADD INDEX idx_product_variant_remaining (product_id, variant_id, remaining);

SELECT '=== ITEMS A TRAITER ===' AS etape;
SELECT product_id, variant_id, bon_type, COUNT(*) AS nb_items, SUM(item_qte) AS total_qte
FROM fix_items_6253 GROUP BY product_id, variant_id, bon_type;


-- -----------------------------------------------------------
-- ETAPE 2: Distribution FIFO
-- -----------------------------------------------------------

DROP PROCEDURE IF EXISTS distribute_fix_6253;

DELIMITER //
CREATE PROCEDURE distribute_fix_6253()
BEGIN
    DECLARE v_snap_id INT;
    DECLARE v_product_id INT;
    DECLARE v_variant_id INT;
    DECLARE v_snap_remaining DECIMAL(20,3);
    DECLARE v_item_row_id INT;
    DECLARE v_bon_type VARCHAR(20);
    DECLARE v_item_id INT;
    DECLARE v_item_qte DECIMAL(20,3);
    DECLARE v_count INT;

    -- 1. AVOIR_CLIENT (retours => ajouter au snapshot le plus recent)
    avoir_loop: LOOP
        SELECT COUNT(*) INTO v_count FROM fix_items_6253 WHERE bon_type = 'avoir_client';
        IF v_count = 0 THEN LEAVE avoir_loop; END IF;

        SELECT id, product_id, variant_id, item_id, item_qte INTO v_item_row_id, v_product_id, v_variant_id, v_item_id, v_item_qte
        FROM fix_items_6253 WHERE bon_type = 'avoir_client' LIMIT 1;

        SET v_snap_id = NULL;
        SELECT COUNT(*) INTO v_count
        FROM snapshot_stock_6253
        WHERE product_id = v_product_id
          AND ((NULLIF(v_variant_id, 0) IS NULL AND variant_id IS NULL) OR variant_id = NULLIF(v_variant_id, 0));

        IF v_count > 0 THEN
            SELECT snapshot_id INTO v_snap_id
            FROM snapshot_stock_6253
            WHERE product_id = v_product_id
              AND ((NULLIF(v_variant_id, 0) IS NULL AND variant_id IS NULL) OR variant_id = NULLIF(v_variant_id, 0))
            ORDER BY created_at DESC LIMIT 1;
        END IF;

        IF v_snap_id IS NOT NULL THEN
            UPDATE snapshot_stock_6253 SET remaining = remaining + v_item_qte WHERE snapshot_id = v_snap_id;
        END IF;

        INSERT INTO fix_mapping_6253 VALUES (v_product_id, v_variant_id, 'avoir_client', v_item_id, v_item_qte, v_snap_id);
        DELETE FROM fix_items_6253 WHERE id = v_item_row_id;
    END LOOP;

    -- 2. COMPTANT + SORTIE: FIFO - vider chaque snapshot completement
    snap_loop: LOOP
        SELECT COUNT(*) INTO v_count FROM fix_items_6253;
        IF v_count = 0 THEN LEAVE snap_loop; END IF;

        SET v_snap_id = NULL;
        SET v_product_id = NULL;
        SET v_variant_id = NULL;
        SELECT COUNT(*) INTO v_count
        FROM fix_items_6253 fi
        JOIN snapshot_stock_6253 ss ON ss.product_id = fi.product_id
            AND ((NULLIF(fi.variant_id, 0) IS NULL AND ss.variant_id IS NULL) OR ss.variant_id = NULLIF(fi.variant_id, 0))
            AND ss.remaining > 0;
        IF v_count = 0 THEN
            INSERT INTO fix_mapping_6253 (product_id, variant_id, bon_type, item_id, item_qte, target_snapshot_id)
            SELECT product_id, variant_id, bon_type, item_id, item_qte, NULL FROM fix_items_6253;
            DELETE FROM fix_items_6253;
            LEAVE snap_loop;
        END IF;

        SELECT fi.product_id, fi.variant_id INTO v_product_id, v_variant_id
        FROM fix_items_6253 fi
        JOIN snapshot_stock_6253 ss ON ss.product_id = fi.product_id
            AND ((NULLIF(fi.variant_id, 0) IS NULL AND ss.variant_id IS NULL) OR ss.variant_id = NULLIF(fi.variant_id, 0))
            AND ss.remaining > 0
        GROUP BY fi.product_id, fi.variant_id
        ORDER BY MIN(ss.created_at) ASC LIMIT 1;

        SELECT snapshot_id, remaining INTO v_snap_id, v_snap_remaining
        FROM snapshot_stock_6253
        WHERE product_id = v_product_id
          AND ((NULLIF(v_variant_id, 0) IS NULL AND variant_id IS NULL) OR variant_id = NULLIF(v_variant_id, 0))
          AND remaining > 0
        ORDER BY created_at ASC LIMIT 1;

        drain_loop: LOOP
            SELECT remaining INTO v_snap_remaining FROM snapshot_stock_6253 WHERE snapshot_id = v_snap_id;
            IF v_snap_remaining <= 0 THEN LEAVE drain_loop; END IF;

            SELECT COUNT(*) INTO v_count
            FROM fix_items_6253
            WHERE product_id = v_product_id
              AND ((NULLIF(v_variant_id, 0) IS NULL AND variant_id IS NULL) OR variant_id = NULLIF(v_variant_id, 0));
            IF v_count = 0 THEN LEAVE drain_loop; END IF;

            SET v_item_row_id = NULL;
            SELECT COUNT(*) INTO v_count
            FROM fix_items_6253
            WHERE product_id = v_product_id
              AND ((NULLIF(v_variant_id, 0) IS NULL AND variant_id IS NULL) OR variant_id = NULLIF(v_variant_id, 0))
              AND item_qte <= v_snap_remaining;

            IF v_count > 0 THEN
                SELECT id, bon_type, item_id, item_qte
                INTO v_item_row_id, v_bon_type, v_item_id, v_item_qte
                FROM fix_items_6253
                WHERE product_id = v_product_id
                  AND ((NULLIF(v_variant_id, 0) IS NULL AND variant_id IS NULL) OR variant_id = NULLIF(v_variant_id, 0))
                  AND item_qte <= v_snap_remaining
                ORDER BY item_qte DESC LIMIT 1;
            ELSE
                SELECT id, bon_type, item_id, item_qte
                INTO v_item_row_id, v_bon_type, v_item_id, v_item_qte
                FROM fix_items_6253
                WHERE product_id = v_product_id
                  AND ((NULLIF(v_variant_id, 0) IS NULL AND variant_id IS NULL) OR variant_id = NULLIF(v_variant_id, 0))
                ORDER BY item_qte ASC LIMIT 1;
            END IF;

            IF v_item_row_id IS NULL THEN LEAVE drain_loop; END IF;

            UPDATE snapshot_stock_6253
            SET remaining = GREATEST(remaining - v_item_qte, 0)
            WHERE snapshot_id = v_snap_id;

            INSERT INTO fix_mapping_6253 VALUES (v_product_id, v_variant_id, v_bon_type, v_item_id, v_item_qte, v_snap_id);
            DELETE FROM fix_items_6253 WHERE id = v_item_row_id;
        END LOOP;
    END LOOP;
END //
DELIMITER ;

CALL distribute_fix_6253();
DROP PROCEDURE IF EXISTS distribute_fix_6253;


-- -----------------------------------------------------------
-- ETAPE 3: VERIFICATION DU MAPPING (simulation)
-- -----------------------------------------------------------

SELECT '=== SIMULATION APRES FIX ===' AS etape;

SELECT
    ps.product_id,
    ps.variant_id,
    ps.id                                                    AS snapshot_id,
    ps.quantite                                              AS stock_actuel,
    COALESCE(ch.a_deduire, 0)                               AS a_deduire,
    COALESCE(ch.a_ajouter, 0)                               AS a_ajouter,
    GREATEST(ps.quantite - COALESCE(ch.a_deduire,0) + COALESCE(ch.a_ajouter,0), 0) AS nouvelle_qte,
    ps.prix_vente,
    ps.created_at
FROM product_snapshot ps
LEFT JOIN (
    SELECT target_snapshot_id,
        SUM(CASE WHEN bon_type IN ('comptant','sortie') THEN item_qte ELSE 0 END) AS a_deduire,
        SUM(CASE WHEN bon_type = 'avoir_client'         THEN item_qte ELSE 0 END) AS a_ajouter
    FROM fix_mapping_6253 WHERE target_snapshot_id IS NOT NULL
    GROUP BY target_snapshot_id
) ch ON ch.target_snapshot_id = ps.id
WHERE ps.product_id = 6253
ORDER BY ps.product_id, ps.variant_id, ps.created_at DESC;

-- Items sans cible?
SELECT COUNT(*) AS items_sans_cible FROM fix_mapping_6253 WHERE target_snapshot_id IS NULL;


-- ============================================================
-- VERIFIER LES RESULTATS CI-DESSUS AVANT DE CONTINUER
-- Si OK => executer ETAPE 4+ ci-dessous
-- ============================================================


-- -----------------------------------------------------------
-- ETAPE 4: APPLIQUER LE FIX (auto-commit, pas de transaction)
-- -----------------------------------------------------------

-- 4a: UPDATE product_snapshot (quantites)
UPDATE product_snapshot ps
JOIN (
    SELECT target_snapshot_id,
        SUM(CASE WHEN bon_type IN ('comptant','sortie') THEN item_qte ELSE 0 END) AS total_a_deduire,
        SUM(CASE WHEN bon_type = 'avoir_client'         THEN item_qte ELSE 0 END) AS total_a_ajouter
    FROM fix_mapping_6253 WHERE target_snapshot_id IS NOT NULL
    GROUP BY target_snapshot_id
) changes ON ps.id = changes.target_snapshot_id
SET ps.quantite = GREATEST(
    ps.quantite - changes.total_a_deduire + changes.total_a_ajouter, 0
);

-- 4b: Lier comptant_items (seulement snapshot_id, PAS de prix)
UPDATE comptant_items ci
JOIN fix_mapping_6253 fm ON fm.item_id = ci.id AND fm.bon_type = 'comptant'
SET ci.product_snapshot_id = fm.target_snapshot_id
WHERE fm.target_snapshot_id IS NOT NULL;

-- 4c: Lier sortie_items
UPDATE sortie_items si
JOIN fix_mapping_6253 fm ON fm.item_id = si.id AND fm.bon_type = 'sortie'
SET si.product_snapshot_id = fm.target_snapshot_id
WHERE fm.target_snapshot_id IS NOT NULL;

-- 4d: Lier avoir_client_items
UPDATE avoir_client_items aci
JOIN fix_mapping_6253 fm ON fm.item_id = aci.id AND fm.bon_type = 'avoir_client'
SET aci.product_snapshot_id = fm.target_snapshot_id
WHERE fm.target_snapshot_id IS NOT NULL;

-- 4e: Si aucun stock positif n'a permis la liaison, lier au dernier snapshot exact
-- et marquer la vente/sortie indisponible. La quantite snapshot reste a 0.
UPDATE comptant_items ci
JOIN bons_comptant bc ON bc.id = ci.bon_comptant_id
JOIN (
    SELECT
        ci2.id AS item_id,
        (
            SELECT ps_last.id
            FROM product_snapshot ps_last
            WHERE ps_last.product_id = ci2.product_id
              AND ((NULLIF(ci2.variant_id, 0) IS NULL AND ps_last.variant_id IS NULL) OR ps_last.variant_id = NULLIF(ci2.variant_id, 0))
            ORDER BY ps_last.created_at DESC, ps_last.id DESC
            LIMIT 1
        ) AS last_snapshot_id
    FROM comptant_items ci2
    JOIN bons_comptant bc2 ON bc2.id = ci2.bon_comptant_id
    WHERE ci2.product_id = 6253
      AND ci2.product_snapshot_id IS NULL
      AND bc2.date_creation >= '2026-03-01'
) fallback ON fallback.item_id = ci.id
SET ci.product_snapshot_id = fallback.last_snapshot_id,
    ci.is_indisponible = 1
WHERE fallback.last_snapshot_id IS NOT NULL
  AND bc.date_creation >= '2026-03-01';

UPDATE sortie_items si
JOIN bons_sortie bs ON bs.id = si.bon_sortie_id
JOIN (
    SELECT
        si2.id AS item_id,
        (
            SELECT ps_last.id
            FROM product_snapshot ps_last
            WHERE ps_last.product_id = si2.product_id
              AND ((NULLIF(si2.variant_id, 0) IS NULL AND ps_last.variant_id IS NULL) OR ps_last.variant_id = NULLIF(si2.variant_id, 0))
            ORDER BY ps_last.created_at DESC, ps_last.id DESC
            LIMIT 1
        ) AS last_snapshot_id
    FROM sortie_items si2
    JOIN bons_sortie bs2 ON bs2.id = si2.bon_sortie_id
    WHERE si2.product_id = 6253
      AND si2.product_snapshot_id IS NULL
      AND bs2.date_creation >= '2026-03-01'
) fallback ON fallback.item_id = si.id
SET si.product_snapshot_id = fallback.last_snapshot_id,
    si.is_indisponible = 1
WHERE fallback.last_snapshot_id IS NOT NULL
  AND bs.date_creation >= '2026-03-01';


-- -----------------------------------------------------------
-- ETAPE 5: VERIFICATION FINALE
-- -----------------------------------------------------------

SELECT '=== ETAT APRES FIX ===' AS etape;

SELECT ps.product_id, ps.variant_id, ps.id AS snapshot_id, ps.quantite AS stock_apres_fix, ps.prix_vente, ps.created_at
FROM product_snapshot ps
WHERE ps.product_id = 6253
ORDER BY ps.product_id, ps.variant_id, ps.created_at DESC;

SELECT product_id, variant_id, SUM(quantite) AS stock_total_apres
FROM product_snapshot
WHERE product_id = 6253
GROUP BY product_id, variant_id;

SELECT ci.product_id, ci.variant_id, 'comptant' AS type, COUNT(*) AS reste
FROM comptant_items ci
WHERE ci.product_id = 6253 AND ci.product_snapshot_id IS NULL
GROUP BY ci.product_id, ci.variant_id
UNION ALL
SELECT si.product_id, si.variant_id, 'sortie', COUNT(*)
FROM sortie_items si
WHERE si.product_id = 6253 AND si.product_snapshot_id IS NULL
GROUP BY si.product_id, si.variant_id
UNION ALL
SELECT aci.product_id, aci.variant_id, 'avoir_client', COUNT(*)
FROM avoir_client_items aci
WHERE aci.product_id = 6253 AND aci.product_snapshot_id IS NULL
GROUP BY aci.product_id, aci.variant_id;

-- Pas de COMMIT/ROLLBACK necessaire (auto-commit)

DROP TEMPORARY TABLE IF EXISTS fix_items_6253;
DROP TEMPORARY TABLE IF EXISTS fix_mapping_6253;
DROP TEMPORARY TABLE IF EXISTS snapshot_stock_6253;
