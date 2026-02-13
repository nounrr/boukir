-- ============================================================
-- Migration complète : bon_commande_id + prix_achat_snapshot
-- ============================================================
-- Exécuté le 2026-02-11 avec succès via fix-prix-achat-snapshot.mjs
--
-- 2 objectifs :
--   1) Remplir bon_commande_id dans les items pour les produits
--      qui ont un bon commande validé (via products.last_boncommande_id)
--   2) Pour les produits SANS aucun bon commande, stocker le prix_achat
--      actuel dans prix_achat_snapshot comme fallback historique
--
-- Note : vehicule_items n'a PAS de colonne variant_id
-- ============================================================


-- ========================================================
-- ÉTAPE 1 : Remplir bon_commande_id manquants
--           via products.last_boncommande_id
-- ========================================================

UPDATE sortie_items si
  JOIN products p ON p.id = si.product_id
SET si.bon_commande_id = p.last_boncommande_id
WHERE si.bon_commande_id IS NULL
  AND p.last_boncommande_id IS NOT NULL;

UPDATE comptant_items ci
  JOIN products p ON p.id = ci.product_id
SET ci.bon_commande_id = p.last_boncommande_id
WHERE ci.bon_commande_id IS NULL
  AND p.last_boncommande_id IS NOT NULL;

UPDATE devis_items di
  JOIN products p ON p.id = di.product_id
SET di.bon_commande_id = p.last_boncommande_id
WHERE di.bon_commande_id IS NULL
  AND p.last_boncommande_id IS NOT NULL;

UPDATE vehicule_items vi
  JOIN products p ON p.id = vi.product_id
SET vi.bon_commande_id = p.last_boncommande_id
WHERE vi.bon_commande_id IS NULL
  AND p.last_boncommande_id IS NOT NULL;

UPDATE avoir_client_items ai
  JOIN products p ON p.id = ai.product_id
SET ai.bon_commande_id = p.last_boncommande_id
WHERE ai.bon_commande_id IS NULL
  AND p.last_boncommande_id IS NOT NULL;

UPDATE avoir_comptant_items aci
  JOIN products p ON p.id = aci.product_id
SET aci.bon_commande_id = p.last_boncommande_id
WHERE aci.bon_commande_id IS NULL
  AND p.last_boncommande_id IS NOT NULL;

UPDATE avoir_fournisseur_items afi
  JOIN products p ON p.id = afi.product_id
SET afi.bon_commande_id = p.last_boncommande_id
WHERE afi.bon_commande_id IS NULL
  AND p.last_boncommande_id IS NOT NULL;

UPDATE ecommerce_order_items oi
  JOIN products p ON p.id = oi.product_id
SET oi.bon_commande_id = p.last_boncommande_id
WHERE oi.bon_commande_id IS NULL
  AND p.last_boncommande_id IS NOT NULL;

UPDATE avoir_ecommerce_items aei
  JOIN products p ON p.id = aei.product_id
SET aei.bon_commande_id = p.last_boncommande_id
WHERE aei.bon_commande_id IS NULL
  AND p.last_boncommande_id IS NOT NULL;


-- ========================================================
-- ÉTAPE 2 : Remplir bon_commande_id manquants
--           via lookup dans commande_items (pour les produits
--           dont last_boncommande_id est NULL mais qui
--           apparaissent dans un bon commande validé)
-- ========================================================

UPDATE sortie_items si
  JOIN products p ON p.id = si.product_id
SET si.bon_commande_id = (
  SELECT ci2.bon_commande_id FROM commande_items ci2
  JOIN bons_commande bc2 ON bc2.id = ci2.bon_commande_id
  WHERE ci2.product_id = si.product_id AND (ci2.variant_id <=> si.variant_id)
    AND LOWER(TRIM(bc2.statut)) IN ('validé','valide')
  ORDER BY bc2.id DESC LIMIT 1
)
WHERE si.bon_commande_id IS NULL AND p.last_boncommande_id IS NULL
  AND EXISTS (
    SELECT 1 FROM commande_items ci2 JOIN bons_commande bc2 ON bc2.id = ci2.bon_commande_id
    WHERE ci2.product_id = si.product_id AND (ci2.variant_id <=> si.variant_id)
      AND LOWER(TRIM(bc2.statut)) IN ('validé','valide')
  );

UPDATE comptant_items ci
  JOIN products p ON p.id = ci.product_id
SET ci.bon_commande_id = (
  SELECT ci2.bon_commande_id FROM commande_items ci2
  JOIN bons_commande bc2 ON bc2.id = ci2.bon_commande_id
  WHERE ci2.product_id = ci.product_id AND (ci2.variant_id <=> ci.variant_id)
    AND LOWER(TRIM(bc2.statut)) IN ('validé','valide')
  ORDER BY bc2.id DESC LIMIT 1
)
WHERE ci.bon_commande_id IS NULL AND p.last_boncommande_id IS NULL
  AND EXISTS (
    SELECT 1 FROM commande_items ci2 JOIN bons_commande bc2 ON bc2.id = ci2.bon_commande_id
    WHERE ci2.product_id = ci.product_id AND (ci2.variant_id <=> ci.variant_id)
      AND LOWER(TRIM(bc2.statut)) IN ('validé','valide')
  );

UPDATE devis_items di
  JOIN products p ON p.id = di.product_id
SET di.bon_commande_id = (
  SELECT ci2.bon_commande_id FROM commande_items ci2
  JOIN bons_commande bc2 ON bc2.id = ci2.bon_commande_id
  WHERE ci2.product_id = di.product_id AND (ci2.variant_id <=> di.variant_id)
    AND LOWER(TRIM(bc2.statut)) IN ('validé','valide')
  ORDER BY bc2.id DESC LIMIT 1
)
WHERE di.bon_commande_id IS NULL AND p.last_boncommande_id IS NULL
  AND EXISTS (
    SELECT 1 FROM commande_items ci2 JOIN bons_commande bc2 ON bc2.id = ci2.bon_commande_id
    WHERE ci2.product_id = di.product_id AND (ci2.variant_id <=> di.variant_id)
      AND LOWER(TRIM(bc2.statut)) IN ('validé','valide')
  );

-- vehicule_items : PAS de variant_id
UPDATE vehicule_items vi
  JOIN products p ON p.id = vi.product_id
SET vi.bon_commande_id = (
  SELECT ci2.bon_commande_id FROM commande_items ci2
  JOIN bons_commande bc2 ON bc2.id = ci2.bon_commande_id
  WHERE ci2.product_id = vi.product_id AND ci2.variant_id IS NULL
    AND LOWER(TRIM(bc2.statut)) IN ('validé','valide')
  ORDER BY bc2.id DESC LIMIT 1
)
WHERE vi.bon_commande_id IS NULL AND p.last_boncommande_id IS NULL
  AND EXISTS (
    SELECT 1 FROM commande_items ci2 JOIN bons_commande bc2 ON bc2.id = ci2.bon_commande_id
    WHERE ci2.product_id = vi.product_id AND ci2.variant_id IS NULL
      AND LOWER(TRIM(bc2.statut)) IN ('validé','valide')
  );

UPDATE avoir_client_items ai
  JOIN products p ON p.id = ai.product_id
SET ai.bon_commande_id = (
  SELECT ci2.bon_commande_id FROM commande_items ci2
  JOIN bons_commande bc2 ON bc2.id = ci2.bon_commande_id
  WHERE ci2.product_id = ai.product_id AND (ci2.variant_id <=> ai.variant_id)
    AND LOWER(TRIM(bc2.statut)) IN ('validé','valide')
  ORDER BY bc2.id DESC LIMIT 1
)
WHERE ai.bon_commande_id IS NULL AND p.last_boncommande_id IS NULL
  AND EXISTS (
    SELECT 1 FROM commande_items ci2 JOIN bons_commande bc2 ON bc2.id = ci2.bon_commande_id
    WHERE ci2.product_id = ai.product_id AND (ci2.variant_id <=> ai.variant_id)
      AND LOWER(TRIM(bc2.statut)) IN ('validé','valide')
  );

UPDATE avoir_comptant_items aci
  JOIN products p ON p.id = aci.product_id
SET aci.bon_commande_id = (
  SELECT ci2.bon_commande_id FROM commande_items ci2
  JOIN bons_commande bc2 ON bc2.id = ci2.bon_commande_id
  WHERE ci2.product_id = aci.product_id AND (ci2.variant_id <=> aci.variant_id)
    AND LOWER(TRIM(bc2.statut)) IN ('validé','valide')
  ORDER BY bc2.id DESC LIMIT 1
)
WHERE aci.bon_commande_id IS NULL AND p.last_boncommande_id IS NULL
  AND EXISTS (
    SELECT 1 FROM commande_items ci2 JOIN bons_commande bc2 ON bc2.id = ci2.bon_commande_id
    WHERE ci2.product_id = aci.product_id AND (ci2.variant_id <=> aci.variant_id)
      AND LOWER(TRIM(bc2.statut)) IN ('validé','valide')
  );

UPDATE avoir_fournisseur_items afi
  JOIN products p ON p.id = afi.product_id
SET afi.bon_commande_id = (
  SELECT ci2.bon_commande_id FROM commande_items ci2
  JOIN bons_commande bc2 ON bc2.id = ci2.bon_commande_id
  WHERE ci2.product_id = afi.product_id AND (ci2.variant_id <=> afi.variant_id)
    AND LOWER(TRIM(bc2.statut)) IN ('validé','valide')
  ORDER BY bc2.id DESC LIMIT 1
)
WHERE afi.bon_commande_id IS NULL AND p.last_boncommande_id IS NULL
  AND EXISTS (
    SELECT 1 FROM commande_items ci2 JOIN bons_commande bc2 ON bc2.id = ci2.bon_commande_id
    WHERE ci2.product_id = afi.product_id AND (ci2.variant_id <=> afi.variant_id)
      AND LOWER(TRIM(bc2.statut)) IN ('validé','valide')
  );

UPDATE ecommerce_order_items oi
  JOIN products p ON p.id = oi.product_id
SET oi.bon_commande_id = (
  SELECT ci2.bon_commande_id FROM commande_items ci2
  JOIN bons_commande bc2 ON bc2.id = ci2.bon_commande_id
  WHERE ci2.product_id = oi.product_id AND (ci2.variant_id <=> oi.variant_id)
    AND LOWER(TRIM(bc2.statut)) IN ('validé','valide')
  ORDER BY bc2.id DESC LIMIT 1
)
WHERE oi.bon_commande_id IS NULL AND p.last_boncommande_id IS NULL
  AND EXISTS (
    SELECT 1 FROM commande_items ci2 JOIN bons_commande bc2 ON bc2.id = ci2.bon_commande_id
    WHERE ci2.product_id = oi.product_id AND (ci2.variant_id <=> oi.variant_id)
      AND LOWER(TRIM(bc2.statut)) IN ('validé','valide')
  );

UPDATE avoir_ecommerce_items aei
  JOIN products p ON p.id = aei.product_id
SET aei.bon_commande_id = (
  SELECT ci2.bon_commande_id FROM commande_items ci2
  JOIN bons_commande bc2 ON bc2.id = ci2.bon_commande_id
  WHERE ci2.product_id = aei.product_id AND (ci2.variant_id <=> aei.variant_id)
    AND LOWER(TRIM(bc2.statut)) IN ('validé','valide')
  ORDER BY bc2.id DESC LIMIT 1
)
WHERE aei.bon_commande_id IS NULL AND p.last_boncommande_id IS NULL
  AND EXISTS (
    SELECT 1 FROM commande_items ci2 JOIN bons_commande bc2 ON bc2.id = ci2.bon_commande_id
    WHERE ci2.product_id = aei.product_id AND (ci2.variant_id <=> aei.variant_id)
      AND LOWER(TRIM(bc2.statut)) IN ('validé','valide')
  );


-- ========================================================
-- ÉTAPE 3 : Supprimer prix_achat_snapshot si existant (reset)
-- ========================================================

ALTER TABLE sortie_items DROP COLUMN IF EXISTS prix_achat_snapshot;
ALTER TABLE comptant_items DROP COLUMN IF EXISTS prix_achat_snapshot;
ALTER TABLE devis_items DROP COLUMN IF EXISTS prix_achat_snapshot;
ALTER TABLE vehicule_items DROP COLUMN IF EXISTS prix_achat_snapshot;
ALTER TABLE avoir_client_items DROP COLUMN IF EXISTS prix_achat_snapshot;
ALTER TABLE avoir_comptant_items DROP COLUMN IF EXISTS prix_achat_snapshot;
ALTER TABLE avoir_fournisseur_items DROP COLUMN IF EXISTS prix_achat_snapshot;
ALTER TABLE ecommerce_order_items DROP COLUMN IF EXISTS prix_achat_snapshot;
ALTER TABLE avoir_ecommerce_items DROP COLUMN IF EXISTS prix_achat_snapshot;


-- ========================================================
-- ÉTAPE 4 : Ajouter colonne prix_achat_snapshot
-- ========================================================

ALTER TABLE sortie_items ADD COLUMN prix_achat_snapshot DECIMAL(10,2) DEFAULT NULL AFTER bon_commande_id;
ALTER TABLE comptant_items ADD COLUMN prix_achat_snapshot DECIMAL(10,2) DEFAULT NULL AFTER bon_commande_id;
ALTER TABLE devis_items ADD COLUMN prix_achat_snapshot DECIMAL(10,2) DEFAULT NULL AFTER bon_commande_id;
ALTER TABLE vehicule_items ADD COLUMN prix_achat_snapshot DECIMAL(10,2) DEFAULT NULL AFTER bon_commande_id;
ALTER TABLE avoir_client_items ADD COLUMN prix_achat_snapshot DECIMAL(10,2) DEFAULT NULL AFTER bon_commande_id;
ALTER TABLE avoir_comptant_items ADD COLUMN prix_achat_snapshot DECIMAL(10,2) DEFAULT NULL AFTER bon_commande_id;
ALTER TABLE avoir_fournisseur_items ADD COLUMN prix_achat_snapshot DECIMAL(10,2) DEFAULT NULL AFTER bon_commande_id;
ALTER TABLE ecommerce_order_items ADD COLUMN prix_achat_snapshot DECIMAL(10,2) DEFAULT NULL AFTER bon_commande_id;
ALTER TABLE avoir_ecommerce_items ADD COLUMN prix_achat_snapshot DECIMAL(10,2) DEFAULT NULL AFTER bon_commande_id;


-- ========================================================
-- ÉTAPE 5 : Backfill prix_achat_snapshot
--           SEULEMENT pour les items qui n'ont TOUJOURS PAS
--           de bon_commande_id (après étapes 1 & 2)
--           = les vrais produits sans aucun bon commande
-- ========================================================

UPDATE sortie_items si
  JOIN products p ON p.id = si.product_id
SET si.prix_achat_snapshot = p.prix_achat
WHERE si.bon_commande_id IS NULL AND si.prix_achat_snapshot IS NULL
  AND p.prix_achat IS NOT NULL AND p.prix_achat > 0;

UPDATE comptant_items ci
  JOIN products p ON p.id = ci.product_id
SET ci.prix_achat_snapshot = p.prix_achat
WHERE ci.bon_commande_id IS NULL AND ci.prix_achat_snapshot IS NULL
  AND p.prix_achat IS NOT NULL AND p.prix_achat > 0;

UPDATE devis_items di
  JOIN products p ON p.id = di.product_id
SET di.prix_achat_snapshot = p.prix_achat
WHERE di.bon_commande_id IS NULL AND di.prix_achat_snapshot IS NULL
  AND p.prix_achat IS NOT NULL AND p.prix_achat > 0;

UPDATE vehicule_items vi
  JOIN products p ON p.id = vi.product_id
SET vi.prix_achat_snapshot = p.prix_achat
WHERE vi.bon_commande_id IS NULL AND vi.prix_achat_snapshot IS NULL
  AND p.prix_achat IS NOT NULL AND p.prix_achat > 0;

UPDATE avoir_client_items ai
  JOIN products p ON p.id = ai.product_id
SET ai.prix_achat_snapshot = p.prix_achat
WHERE ai.bon_commande_id IS NULL AND ai.prix_achat_snapshot IS NULL
  AND p.prix_achat IS NOT NULL AND p.prix_achat > 0;

UPDATE avoir_comptant_items aci
  JOIN products p ON p.id = aci.product_id
SET aci.prix_achat_snapshot = p.prix_achat
WHERE aci.bon_commande_id IS NULL AND aci.prix_achat_snapshot IS NULL
  AND p.prix_achat IS NOT NULL AND p.prix_achat > 0;

UPDATE avoir_fournisseur_items afi
  JOIN products p ON p.id = afi.product_id
SET afi.prix_achat_snapshot = p.prix_achat
WHERE afi.bon_commande_id IS NULL AND afi.prix_achat_snapshot IS NULL
  AND p.prix_achat IS NOT NULL AND p.prix_achat > 0;

UPDATE ecommerce_order_items oi
  JOIN products p ON p.id = oi.product_id
SET oi.prix_achat_snapshot = p.prix_achat
WHERE oi.bon_commande_id IS NULL AND oi.prix_achat_snapshot IS NULL
  AND p.prix_achat IS NOT NULL AND p.prix_achat > 0;

UPDATE avoir_ecommerce_items aei
  JOIN products p ON p.id = aei.product_id
SET aei.prix_achat_snapshot = p.prix_achat
WHERE aei.bon_commande_id IS NULL AND aei.prix_achat_snapshot IS NULL
  AND p.prix_achat IS NOT NULL AND p.prix_achat > 0;


-- ========================================================
-- ÉTAPE 6 : Vérification
-- ========================================================

SELECT 'sortie_items' AS table_name,
       COUNT(*) AS total,
       SUM(bon_commande_id IS NOT NULL) AS avec_bon_cmd,
       SUM(bon_commande_id IS NULL) AS sans_bon_cmd,
       SUM(prix_achat_snapshot IS NOT NULL) AS avec_snapshot,
       SUM(bon_commande_id IS NULL AND prix_achat_snapshot IS NULL) AS sans_rien
FROM sortie_items
UNION ALL
SELECT 'comptant_items', COUNT(*), SUM(bon_commande_id IS NOT NULL), SUM(bon_commande_id IS NULL), SUM(prix_achat_snapshot IS NOT NULL), SUM(bon_commande_id IS NULL AND prix_achat_snapshot IS NULL)
FROM comptant_items
UNION ALL
SELECT 'devis_items', COUNT(*), SUM(bon_commande_id IS NOT NULL), SUM(bon_commande_id IS NULL), SUM(prix_achat_snapshot IS NOT NULL), SUM(bon_commande_id IS NULL AND prix_achat_snapshot IS NULL)
FROM devis_items
UNION ALL
SELECT 'vehicule_items', COUNT(*), SUM(bon_commande_id IS NOT NULL), SUM(bon_commande_id IS NULL), SUM(prix_achat_snapshot IS NOT NULL), SUM(bon_commande_id IS NULL AND prix_achat_snapshot IS NULL)
FROM vehicule_items
UNION ALL
SELECT 'avoir_client_items', COUNT(*), SUM(bon_commande_id IS NOT NULL), SUM(bon_commande_id IS NULL), SUM(prix_achat_snapshot IS NOT NULL), SUM(bon_commande_id IS NULL AND prix_achat_snapshot IS NULL)
FROM avoir_client_items
UNION ALL
SELECT 'avoir_comptant_items', COUNT(*), SUM(bon_commande_id IS NOT NULL), SUM(bon_commande_id IS NULL), SUM(prix_achat_snapshot IS NOT NULL), SUM(bon_commande_id IS NULL AND prix_achat_snapshot IS NULL)
FROM avoir_comptant_items
UNION ALL
SELECT 'avoir_fournisseur_items', COUNT(*), SUM(bon_commande_id IS NOT NULL), SUM(bon_commande_id IS NULL), SUM(prix_achat_snapshot IS NOT NULL), SUM(bon_commande_id IS NULL AND prix_achat_snapshot IS NULL)
FROM avoir_fournisseur_items
UNION ALL
SELECT 'ecommerce_order_items', COUNT(*), SUM(bon_commande_id IS NOT NULL), SUM(bon_commande_id IS NULL), SUM(prix_achat_snapshot IS NOT NULL), SUM(bon_commande_id IS NULL AND prix_achat_snapshot IS NULL)
FROM ecommerce_order_items
UNION ALL
SELECT 'avoir_ecommerce_items', COUNT(*), SUM(bon_commande_id IS NOT NULL), SUM(bon_commande_id IS NULL), SUM(prix_achat_snapshot IS NOT NULL), SUM(bon_commande_id IS NULL AND prix_achat_snapshot IS NULL)
FROM avoir_ecommerce_items;
