-- ============================================================
-- DETECTION: Nouvelle quantite produit 6253 apres fix
-- LECTURE SEULE - aucune modification de la base
--
-- LOGIQUE: On vide chaque snapshot completement (oldest first)
-- avant de passer au suivant. On ne laisse PAS de reste
-- sauf sur le dernier snapshot qui a encore du stock.
-- ============================================================

DROP TEMPORARY TABLE IF EXISTS fix_items_6253;
DROP TEMPORARY TABLE IF EXISTS fix_mapping_6253;
DROP TEMPORARY TABLE IF EXISTS snapshot_stock_6253;

-- Tous les items a fixer
CREATE TEMPORARY TABLE fix_items_6253 (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bon_type VARCHAR(20),
    item_id INT,
    item_qte DECIMAL(20,3)
);

INSERT INTO fix_items_6253 (bon_type, item_id, item_qte)
SELECT 'comptant', ci.id, ci.quantite
FROM comptant_items ci
JOIN bons_comptant bc ON bc.id = ci.bon_comptant_id
WHERE ci.product_id = 6253
  AND ci.product_snapshot_id IS NULL
  AND bc.date_creation >= '2026-03-01'
UNION ALL
SELECT 'sortie', si.id, si.quantite
FROM sortie_items si
JOIN bons_sortie bs ON bs.id = si.bon_sortie_id
WHERE si.product_id = 6253
  AND si.product_snapshot_id IS NULL
  AND bs.date_creation >= '2026-03-01'
UNION ALL
SELECT 'avoir_client', aci.id, aci.quantite
FROM avoir_client_items aci
JOIN avoirs_client ac ON ac.id = aci.avoir_client_id
WHERE aci.product_id = 6253
  AND aci.product_snapshot_id IS NULL
  AND ac.date_creation >= '2026-03-01';

CREATE TEMPORARY TABLE fix_mapping_6253 (
    bon_type VARCHAR(20),
    item_id INT,
    item_qte DECIMAL(20,3),
    target_snapshot_id INT,
    is_indisponible TINYINT DEFAULT 0
);

CREATE TEMPORARY TABLE snapshot_stock_6253 AS
SELECT id AS snapshot_id, quantite AS remaining, prix_vente, created_at
FROM product_snapshot WHERE product_id = 6253 AND quantite > 0;
ALTER TABLE snapshot_stock_6253 ADD INDEX idx_snap (snapshot_id);

DROP PROCEDURE IF EXISTS detect_fix_6253;

DELIMITER //
CREATE PROCEDURE detect_fix_6253()
BEGIN
    DECLARE v_snap_id INT;
    DECLARE v_snap_remaining DECIMAL(20,3);
    DECLARE v_item_row_id INT;
    DECLARE v_bon_type VARCHAR(20);
    DECLARE v_item_id INT;
    DECLARE v_item_qte DECIMAL(20,3);
    DECLARE v_count INT;

    -- =====================================================
    -- 1. AVOIR_CLIENT d'abord (retours => ajouter au stock)
    --    Ajout au snapshot le plus recent
    -- =====================================================
    avoir_loop: LOOP
        SELECT COUNT(*) INTO v_count FROM fix_items_6253 WHERE bon_type = 'avoir_client';
        IF v_count = 0 THEN LEAVE avoir_loop; END IF;

        SELECT id, item_id, item_qte INTO v_item_row_id, v_item_id, v_item_qte
        FROM fix_items_6253 WHERE bon_type = 'avoir_client' LIMIT 1;

        SELECT snapshot_id INTO v_snap_id
        FROM snapshot_stock_6253 ORDER BY created_at DESC LIMIT 1;

        IF v_snap_id IS NOT NULL THEN
            UPDATE snapshot_stock_6253 SET remaining = remaining + v_item_qte WHERE snapshot_id = v_snap_id;
        END IF;

        INSERT INTO fix_mapping_6253 VALUES ('avoir_client', v_item_id, v_item_qte, v_snap_id, 0);
        DELETE FROM fix_items_6253 WHERE id = v_item_row_id;
    END LOOP;

    -- =====================================================
    -- 2. COMPTANT + SORTIE (ventes/sorties => deduire)
    --    FIFO: vider chaque snapshot completement avant
    --    de passer au suivant (du plus ancien au plus recent)
    -- =====================================================
    snap_loop: LOOP
        -- Des items restants?
        SELECT COUNT(*) INTO v_count FROM fix_items_6253;
        IF v_count = 0 THEN LEAVE snap_loop; END IF;

        -- Prendre le snapshot le plus ancien avec du stock
        SET v_snap_id = NULL;
        SELECT COUNT(*) INTO v_count FROM snapshot_stock_6253 WHERE remaining > 0;
        IF v_count = 0 THEN
            -- Plus de stock positif => lier au dernier snapshot, meme si sa quantite est 0.
            SELECT id INTO v_snap_id
            FROM product_snapshot
            WHERE product_id = 6253
            ORDER BY created_at DESC, id DESC
            LIMIT 1;

            INSERT INTO fix_mapping_6253 (bon_type, item_id, item_qte, target_snapshot_id, is_indisponible)
            SELECT bon_type, item_id, item_qte, v_snap_id, 1 FROM fix_items_6253;
            DELETE FROM fix_items_6253;
            LEAVE snap_loop;
        END IF;

        SELECT snapshot_id, remaining INTO v_snap_id, v_snap_remaining
        FROM snapshot_stock_6253 WHERE remaining > 0
        ORDER BY created_at ASC
        LIMIT 1;

        -- Vider ce snapshot completement
        drain_loop: LOOP
            -- Rafraichir le stock restant
            SELECT remaining INTO v_snap_remaining FROM snapshot_stock_6253 WHERE snapshot_id = v_snap_id;
            IF v_snap_remaining <= 0 THEN LEAVE drain_loop; END IF;

            -- Des items restants?
            SELECT COUNT(*) INTO v_count FROM fix_items_6253;
            IF v_count = 0 THEN LEAVE drain_loop; END IF;

            -- Chercher le plus grand item qui rentre dans le stock restant
            SET v_item_row_id = NULL;
            SELECT COUNT(*) INTO v_count FROM fix_items_6253 WHERE item_qte <= v_snap_remaining;

            IF v_count > 0 THEN
                -- Prendre le plus grand qui rentre
                SELECT id, bon_type, item_id, item_qte
                INTO v_item_row_id, v_bon_type, v_item_id, v_item_qte
                FROM fix_items_6253
                WHERE item_qte <= v_snap_remaining
                ORDER BY item_qte DESC
                LIMIT 1;
            ELSE
                -- Aucun item ne rentre => prendre le plus petit
                -- (va mettre le snapshot a 0 et le surplus ira au suivant)
                SELECT id, bon_type, item_id, item_qte
                INTO v_item_row_id, v_bon_type, v_item_id, v_item_qte
                FROM fix_items_6253
                ORDER BY item_qte ASC
                LIMIT 1;
            END IF;

            IF v_item_row_id IS NULL THEN LEAVE drain_loop; END IF;

            -- Deduire
            UPDATE snapshot_stock_6253
            SET remaining = GREATEST(remaining - v_item_qte, 0)
            WHERE snapshot_id = v_snap_id;

            INSERT INTO fix_mapping_6253 VALUES (v_bon_type, v_item_id, v_item_qte, v_snap_id, 0);
            DELETE FROM fix_items_6253 WHERE id = v_item_row_id;
        END LOOP;
    END LOOP;
END //
DELIMITER ;

CALL detect_fix_6253();
DROP PROCEDURE IF EXISTS detect_fix_6253;

SELECT bon_type, COUNT(*) AS nb_lignes_indisponibles
FROM fix_mapping_6253
WHERE is_indisponible = 1
GROUP BY bon_type;

SELECT
    ps.id                                                                          AS snapshot_id,
    ps.quantite                                                                    AS stock_avant,
    COALESCE(ch.a_deduire, 0)                                                     AS a_deduire,
    COALESCE(ch.a_ajouter, 0)                                                     AS a_ajouter,
    GREATEST(ps.quantite - COALESCE(ch.a_deduire,0) + COALESCE(ch.a_ajouter,0), 0) AS stock_apres,
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
ORDER BY ps.created_at ASC;

DROP TEMPORARY TABLE IF EXISTS fix_items_6253;
DROP TEMPORARY TABLE IF EXISTS fix_mapping_6253;
DROP TEMPORARY TABLE IF EXISTS snapshot_stock_6253;
