-- Fix wrong snapshot variant links.
--
-- This file DOES NOT run automatically. Execute it manually in MySQL.
-- It works like:
--   wrong snapshot stock is restored,
--   correct FIFO snapshot stock is changed,
--   item.product_snapshot_id is replaced by the correct snapshot id.
--
-- Negative product_snapshot.quantite is allowed.
-- Bons with status Annulé/Annule/Refusé/Refuse are excluded.
--
-- Recommended workflow:
--   1. Run the SELECT BEFORE section.
--   2. Run START TRANSACTION + UPDATE sections.
--   3. Run SELECT AFTER.
--   4. If OK: COMMIT; otherwise ROLLBACK;

-- =========================================================
-- SELECT BEFORE: rows that will be corrected
-- =========================================================

SELECT
  'Sortie' AS bon_type,
  si.id AS item_id,
  si.bon_sortie_id AS bon_id,
  bs.statut,
  si.product_id,
  si.variant_id AS item_variant_id,
  si.product_snapshot_id AS wrong_snapshot_id,
  ps_old.variant_id AS wrong_snapshot_variant_id,
  (
    SELECT ps2.id
    FROM product_snapshot ps2
    WHERE ps2.product_id = si.product_id
      AND ps2.variant_id = si.variant_id
      AND COALESCE(ps2.en_validation, 1) <> 0
    ORDER BY
      CASE WHEN ps2.prix_vente = si.prix_unitaire THEN 0 ELSE 1 END,
      ps2.created_at ASC,
      ps2.id ASC
    LIMIT 1
  ) AS correct_snapshot_id,
  si.quantite
FROM sortie_items si
JOIN bons_sortie bs ON bs.id = si.bon_sortie_id
JOIN product_snapshot ps_old ON ps_old.id = si.product_snapshot_id
WHERE COALESCE(bs.statut, '') NOT IN ('Annulé', 'Annule', 'Refusé', 'Refuse')
  AND si.product_snapshot_id IS NOT NULL
  AND si.variant_id IS NOT NULL
  AND ps_old.variant_id IS NOT NULL
  AND si.variant_id <> ps_old.variant_id

UNION ALL

SELECT
  'Comptant',
  ci.id,
  ci.bon_comptant_id,
  bc.statut,
  ci.product_id,
  ci.variant_id,
  ci.product_snapshot_id,
  ps_old.variant_id,
  (
    SELECT ps2.id
    FROM product_snapshot ps2
    WHERE ps2.product_id = ci.product_id
      AND ps2.variant_id = ci.variant_id
      AND COALESCE(ps2.en_validation, 1) <> 0
    ORDER BY
      CASE WHEN ps2.prix_vente = ci.prix_unitaire THEN 0 ELSE 1 END,
      ps2.created_at ASC,
      ps2.id ASC
    LIMIT 1
  ),
  ci.quantite
FROM comptant_items ci
JOIN bons_comptant bc ON bc.id = ci.bon_comptant_id
JOIN product_snapshot ps_old ON ps_old.id = ci.product_snapshot_id
WHERE COALESCE(bc.statut, '') NOT IN ('Annulé', 'Annule', 'Refusé', 'Refuse')
  AND ci.product_snapshot_id IS NOT NULL
  AND ci.variant_id IS NOT NULL
  AND ps_old.variant_id IS NOT NULL
  AND ci.variant_id <> ps_old.variant_id

UNION ALL

SELECT
  'Charge',
  chi.id,
  chi.bon_charge_id,
  bch.statut,
  chi.product_id,
  chi.variant_id,
  chi.product_snapshot_id,
  ps_old.variant_id,
  (
    SELECT ps2.id
    FROM product_snapshot ps2
    WHERE ps2.product_id = chi.product_id
      AND ps2.variant_id = chi.variant_id
      AND COALESCE(ps2.en_validation, 1) <> 0
    ORDER BY
      CASE WHEN ps2.prix_vente = chi.prix_unitaire THEN 0 ELSE 1 END,
      ps2.created_at ASC,
      ps2.id ASC
    LIMIT 1
  ),
  chi.quantite
FROM charge_items chi
JOIN bons_charge bch ON bch.id = chi.bon_charge_id
JOIN product_snapshot ps_old ON ps_old.id = chi.product_snapshot_id
WHERE COALESCE(bch.statut, '') NOT IN ('Annulé', 'Annule', 'Refusé', 'Refuse')
  AND chi.product_snapshot_id IS NOT NULL
  AND chi.variant_id IS NOT NULL
  AND ps_old.variant_id IS NOT NULL
  AND chi.variant_id <> ps_old.variant_id

UNION ALL

SELECT
  'AvoirFournisseur',
  afi.id,
  afi.avoir_fournisseur_id,
  af.statut,
  afi.product_id,
  afi.variant_id,
  afi.product_snapshot_id,
  ps_old.variant_id,
  (
    SELECT ps2.id
    FROM product_snapshot ps2
    WHERE ps2.product_id = afi.product_id
      AND ps2.variant_id = afi.variant_id
      AND COALESCE(ps2.en_validation, 1) <> 0
    ORDER BY
      CASE WHEN ps2.prix_vente = afi.prix_unitaire THEN 0 ELSE 1 END,
      ps2.created_at ASC,
      ps2.id ASC
    LIMIT 1
  ),
  afi.quantite
FROM avoir_fournisseur_items afi
JOIN avoirs_fournisseur af ON af.id = afi.avoir_fournisseur_id
JOIN product_snapshot ps_old ON ps_old.id = afi.product_snapshot_id
WHERE COALESCE(af.statut, '') NOT IN ('Annulé', 'Annule', 'Refusé', 'Refuse')
  AND afi.product_snapshot_id IS NOT NULL
  AND afi.variant_id IS NOT NULL
  AND ps_old.variant_id IS NOT NULL
  AND afi.variant_id <> ps_old.variant_id

UNION ALL

SELECT
  'AvoirClient',
  aci.id,
  aci.avoir_client_id,
  ac.statut,
  aci.product_id,
  aci.variant_id,
  aci.product_snapshot_id,
  ps_old.variant_id,
  (
    SELECT ps2.id
    FROM product_snapshot ps2
    WHERE ps2.product_id = aci.product_id
      AND ps2.variant_id = aci.variant_id
      AND COALESCE(ps2.en_validation, 1) <> 0
    ORDER BY
      CASE WHEN ps2.prix_vente = aci.prix_unitaire THEN 0 ELSE 1 END,
      ps2.created_at ASC,
      ps2.id ASC
    LIMIT 1
  ),
  aci.quantite
FROM avoir_client_items aci
JOIN avoirs_client ac ON ac.id = aci.avoir_client_id
JOIN product_snapshot ps_old ON ps_old.id = aci.product_snapshot_id
WHERE COALESCE(ac.statut, '') NOT IN ('Annulé', 'Annule', 'Refusé', 'Refuse')
  AND aci.product_snapshot_id IS NOT NULL
  AND aci.variant_id IS NOT NULL
  AND ps_old.variant_id IS NOT NULL
  AND aci.variant_id <> ps_old.variant_id

UNION ALL

SELECT
  'AvoirComptant',
  acpi.id,
  acpi.avoir_comptant_id,
  acp.statut,
  acpi.product_id,
  acpi.variant_id,
  acpi.product_snapshot_id,
  ps_old.variant_id,
  (
    SELECT ps2.id
    FROM product_snapshot ps2
    WHERE ps2.product_id = acpi.product_id
      AND ps2.variant_id = acpi.variant_id
      AND COALESCE(ps2.en_validation, 1) <> 0
    ORDER BY
      CASE WHEN ps2.prix_vente = acpi.prix_unitaire THEN 0 ELSE 1 END,
      ps2.created_at ASC,
      ps2.id ASC
    LIMIT 1
  ),
  acpi.quantite
FROM avoir_comptant_items acpi
JOIN avoirs_comptant acp ON acp.id = acpi.avoir_comptant_id
JOIN product_snapshot ps_old ON ps_old.id = acpi.product_snapshot_id
WHERE COALESCE(acp.statut, '') NOT IN ('Annulé', 'Annule', 'Refusé', 'Refuse')
  AND acpi.product_snapshot_id IS NOT NULL
  AND acpi.variant_id IS NOT NULL
  AND ps_old.variant_id IS NOT NULL
  AND acpi.variant_id <> ps_old.variant_id
ORDER BY bon_type, bon_id, item_id;

-- =========================================================
-- APPLY FIX
-- =========================================================

START TRANSACTION;

-- OUT tables: stock had been deducted from the wrong snapshot.
-- Restore wrong snapshot and deduct correct FIFO snapshot.

UPDATE sortie_items si
JOIN bons_sortie bs ON bs.id = si.bon_sortie_id
JOIN product_snapshot ps_old ON ps_old.id = si.product_snapshot_id
JOIN product_snapshot ps_new ON ps_new.id = (
  SELECT ps2.id
  FROM product_snapshot ps2
  WHERE ps2.product_id = si.product_id
    AND ps2.variant_id = si.variant_id
    AND COALESCE(ps2.en_validation, 1) <> 0
  ORDER BY
    CASE WHEN ps2.prix_vente = si.prix_unitaire THEN 0 ELSE 1 END,
    ps2.created_at ASC,
    ps2.id ASC
  LIMIT 1
)
SET
  ps_old.quantite = ps_old.quantite + si.quantite,
  ps_new.quantite = ps_new.quantite - si.quantite,
  si.product_snapshot_id = ps_new.id
WHERE COALESCE(bs.statut, '') NOT IN ('Annulé', 'Annule', 'Refusé', 'Refuse')
  AND si.product_snapshot_id IS NOT NULL
  AND si.variant_id IS NOT NULL
  AND ps_old.variant_id IS NOT NULL
  AND si.variant_id <> ps_old.variant_id;

UPDATE comptant_items ci
JOIN bons_comptant bc ON bc.id = ci.bon_comptant_id
JOIN product_snapshot ps_old ON ps_old.id = ci.product_snapshot_id
JOIN product_snapshot ps_new ON ps_new.id = (
  SELECT ps2.id
  FROM product_snapshot ps2
  WHERE ps2.product_id = ci.product_id
    AND ps2.variant_id = ci.variant_id
    AND COALESCE(ps2.en_validation, 1) <> 0
  ORDER BY
    CASE WHEN ps2.prix_vente = ci.prix_unitaire THEN 0 ELSE 1 END,
    ps2.created_at ASC,
    ps2.id ASC
  LIMIT 1
)
SET
  ps_old.quantite = ps_old.quantite + ci.quantite,
  ps_new.quantite = ps_new.quantite - ci.quantite,
  ci.product_snapshot_id = ps_new.id
WHERE COALESCE(bc.statut, '') NOT IN ('Annulé', 'Annule', 'Refusé', 'Refuse')
  AND ci.product_snapshot_id IS NOT NULL
  AND ci.variant_id IS NOT NULL
  AND ps_old.variant_id IS NOT NULL
  AND ci.variant_id <> ps_old.variant_id;

UPDATE charge_items chi
JOIN bons_charge bch ON bch.id = chi.bon_charge_id
JOIN product_snapshot ps_old ON ps_old.id = chi.product_snapshot_id
JOIN product_snapshot ps_new ON ps_new.id = (
  SELECT ps2.id
  FROM product_snapshot ps2
  WHERE ps2.product_id = chi.product_id
    AND ps2.variant_id = chi.variant_id
    AND COALESCE(ps2.en_validation, 1) <> 0
  ORDER BY
    CASE WHEN ps2.prix_vente = chi.prix_unitaire THEN 0 ELSE 1 END,
    ps2.created_at ASC,
    ps2.id ASC
  LIMIT 1
)
SET
  ps_old.quantite = ps_old.quantite + chi.quantite,
  ps_new.quantite = ps_new.quantite - chi.quantite,
  chi.product_snapshot_id = ps_new.id
WHERE COALESCE(bch.statut, '') NOT IN ('Annulé', 'Annule', 'Refusé', 'Refuse')
  AND chi.product_snapshot_id IS NOT NULL
  AND chi.variant_id IS NOT NULL
  AND ps_old.variant_id IS NOT NULL
  AND chi.variant_id <> ps_old.variant_id;

UPDATE avoir_fournisseur_items afi
JOIN avoirs_fournisseur af ON af.id = afi.avoir_fournisseur_id
JOIN product_snapshot ps_old ON ps_old.id = afi.product_snapshot_id
JOIN product_snapshot ps_new ON ps_new.id = (
  SELECT ps2.id
  FROM product_snapshot ps2
  WHERE ps2.product_id = afi.product_id
    AND ps2.variant_id = afi.variant_id
    AND COALESCE(ps2.en_validation, 1) <> 0
  ORDER BY
    CASE WHEN ps2.prix_vente = afi.prix_unitaire THEN 0 ELSE 1 END,
    ps2.created_at ASC,
    ps2.id ASC
  LIMIT 1
)
SET
  ps_old.quantite = ps_old.quantite + afi.quantite,
  ps_new.quantite = ps_new.quantite - afi.quantite,
  afi.product_snapshot_id = ps_new.id
WHERE COALESCE(af.statut, '') NOT IN ('Annulé', 'Annule', 'Refusé', 'Refuse')
  AND afi.product_snapshot_id IS NOT NULL
  AND afi.variant_id IS NOT NULL
  AND ps_old.variant_id IS NOT NULL
  AND afi.variant_id <> ps_old.variant_id;

-- IN tables: stock had been added to the wrong snapshot.
-- Remove from wrong snapshot and add to correct FIFO snapshot.

UPDATE avoir_client_items aci
JOIN avoirs_client ac ON ac.id = aci.avoir_client_id
JOIN product_snapshot ps_old ON ps_old.id = aci.product_snapshot_id
JOIN product_snapshot ps_new ON ps_new.id = (
  SELECT ps2.id
  FROM product_snapshot ps2
  WHERE ps2.product_id = aci.product_id
    AND ps2.variant_id = aci.variant_id
    AND COALESCE(ps2.en_validation, 1) <> 0
  ORDER BY
    CASE WHEN ps2.prix_vente = aci.prix_unitaire THEN 0 ELSE 1 END,
    ps2.created_at ASC,
    ps2.id ASC
  LIMIT 1
)
SET
  ps_old.quantite = ps_old.quantite - aci.quantite,
  ps_new.quantite = ps_new.quantite + aci.quantite,
  aci.product_snapshot_id = ps_new.id
WHERE COALESCE(ac.statut, '') NOT IN ('Annulé', 'Annule', 'Refusé', 'Refuse')
  AND aci.product_snapshot_id IS NOT NULL
  AND aci.variant_id IS NOT NULL
  AND ps_old.variant_id IS NOT NULL
  AND aci.variant_id <> ps_old.variant_id;

UPDATE avoir_comptant_items acpi
JOIN avoirs_comptant acp ON acp.id = acpi.avoir_comptant_id
JOIN product_snapshot ps_old ON ps_old.id = acpi.product_snapshot_id
JOIN product_snapshot ps_new ON ps_new.id = (
  SELECT ps2.id
  FROM product_snapshot ps2
  WHERE ps2.product_id = acpi.product_id
    AND ps2.variant_id = acpi.variant_id
    AND COALESCE(ps2.en_validation, 1) <> 0
  ORDER BY
    CASE WHEN ps2.prix_vente = acpi.prix_unitaire THEN 0 ELSE 1 END,
    ps2.created_at ASC,
    ps2.id ASC
  LIMIT 1
)
SET
  ps_old.quantite = ps_old.quantite - acpi.quantite,
  ps_new.quantite = ps_new.quantite + acpi.quantite,
  acpi.product_snapshot_id = ps_new.id
WHERE COALESCE(acp.statut, '') NOT IN ('Annulé', 'Annule', 'Refusé', 'Refuse')
  AND acpi.product_snapshot_id IS NOT NULL
  AND acpi.variant_id IS NOT NULL
  AND ps_old.variant_id IS NOT NULL
  AND acpi.variant_id <> ps_old.variant_id;

-- =========================================================
-- SELECT AFTER: must return 0 rows for non-cancelled/non-refused docs
-- =========================================================

SELECT
  'Sortie' AS bon_type,
  si.id AS item_id,
  si.bon_sortie_id AS bon_id,
  bs.statut,
  si.product_id,
  si.variant_id AS item_variant_id,
  si.product_snapshot_id,
  ps.variant_id AS snapshot_variant_id,
  si.quantite
FROM sortie_items si
JOIN bons_sortie bs ON bs.id = si.bon_sortie_id
JOIN product_snapshot ps ON ps.id = si.product_snapshot_id
WHERE COALESCE(bs.statut, '') NOT IN ('Annulé', 'Annule', 'Refusé', 'Refuse')
  AND si.product_snapshot_id IS NOT NULL
  AND si.variant_id IS NOT NULL
  AND ps.variant_id IS NOT NULL
  AND si.variant_id <> ps.variant_id

UNION ALL

SELECT 'Comptant', ci.id, ci.bon_comptant_id, bc.statut, ci.product_id, ci.variant_id, ci.product_snapshot_id, ps.variant_id, ci.quantite
FROM comptant_items ci
JOIN bons_comptant bc ON bc.id = ci.bon_comptant_id
JOIN product_snapshot ps ON ps.id = ci.product_snapshot_id
WHERE COALESCE(bc.statut, '') NOT IN ('Annulé', 'Annule', 'Refusé', 'Refuse')
  AND ci.product_snapshot_id IS NOT NULL
  AND ci.variant_id IS NOT NULL
  AND ps.variant_id IS NOT NULL
  AND ci.variant_id <> ps.variant_id

UNION ALL

SELECT 'Charge', chi.id, chi.bon_charge_id, bch.statut, chi.product_id, chi.variant_id, chi.product_snapshot_id, ps.variant_id, chi.quantite
FROM charge_items chi
JOIN bons_charge bch ON bch.id = chi.bon_charge_id
JOIN product_snapshot ps ON ps.id = chi.product_snapshot_id
WHERE COALESCE(bch.statut, '') NOT IN ('Annulé', 'Annule', 'Refusé', 'Refuse')
  AND chi.product_snapshot_id IS NOT NULL
  AND chi.variant_id IS NOT NULL
  AND ps.variant_id IS NOT NULL
  AND chi.variant_id <> ps.variant_id

UNION ALL

SELECT 'AvoirFournisseur', afi.id, afi.avoir_fournisseur_id, af.statut, afi.product_id, afi.variant_id, afi.product_snapshot_id, ps.variant_id, afi.quantite
FROM avoir_fournisseur_items afi
JOIN avoirs_fournisseur af ON af.id = afi.avoir_fournisseur_id
JOIN product_snapshot ps ON ps.id = afi.product_snapshot_id
WHERE COALESCE(af.statut, '') NOT IN ('Annulé', 'Annule', 'Refusé', 'Refuse')
  AND afi.product_snapshot_id IS NOT NULL
  AND afi.variant_id IS NOT NULL
  AND ps.variant_id IS NOT NULL
  AND afi.variant_id <> ps.variant_id

UNION ALL

SELECT 'AvoirClient', aci.id, aci.avoir_client_id, ac.statut, aci.product_id, aci.variant_id, aci.product_snapshot_id, ps.variant_id, aci.quantite
FROM avoir_client_items aci
JOIN avoirs_client ac ON ac.id = aci.avoir_client_id
JOIN product_snapshot ps ON ps.id = aci.product_snapshot_id
WHERE COALESCE(ac.statut, '') NOT IN ('Annulé', 'Annule', 'Refusé', 'Refuse')
  AND aci.product_snapshot_id IS NOT NULL
  AND aci.variant_id IS NOT NULL
  AND ps.variant_id IS NOT NULL
  AND aci.variant_id <> ps.variant_id

UNION ALL

SELECT 'AvoirComptant', acpi.id, acpi.avoir_comptant_id, acp.statut, acpi.product_id, acpi.variant_id, acpi.product_snapshot_id, ps.variant_id, acpi.quantite
FROM avoir_comptant_items acpi
JOIN avoirs_comptant acp ON acp.id = acpi.avoir_comptant_id
JOIN product_snapshot ps ON ps.id = acpi.product_snapshot_id
WHERE COALESCE(acp.statut, '') NOT IN ('Annulé', 'Annule', 'Refusé', 'Refuse')
  AND acpi.product_snapshot_id IS NOT NULL
  AND acpi.variant_id IS NOT NULL
  AND ps.variant_id IS NOT NULL
  AND acpi.variant_id <> ps.variant_id
ORDER BY bon_type, bon_id, item_id;

-- If SELECT AFTER is empty, run:
-- COMMIT;
--
-- If SELECT AFTER still shows problems, run:
-- ROLLBACK;

