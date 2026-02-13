-- Backfill: remplir prix_achat_snapshot pour les anciens items qui n'ont PAS de bon_commande_id
-- On prend le prix_achat actuel du produit comme valeur par défaut.
-- (C'est la meilleure approximation possible pour les lignes historiques.)

-- sortie_items
UPDATE sortie_items si
JOIN products p ON p.id = si.product_id
SET si.prix_achat_snapshot = p.prix_achat
WHERE si.bon_commande_id IS NULL
  AND si.prix_achat_snapshot IS NULL;

-- comptant_items
UPDATE comptant_items ci
JOIN products p ON p.id = ci.product_id
SET ci.prix_achat_snapshot = p.prix_achat
WHERE ci.bon_commande_id IS NULL
  AND ci.prix_achat_snapshot IS NULL;

-- devis_items
UPDATE devis_items di
JOIN products p ON p.id = di.product_id
SET di.prix_achat_snapshot = p.prix_achat
WHERE di.bon_commande_id IS NULL
  AND di.prix_achat_snapshot IS NULL;

-- vehicule_items
UPDATE vehicule_items vi
JOIN products p ON p.id = vi.product_id
SET vi.prix_achat_snapshot = p.prix_achat
WHERE vi.bon_commande_id IS NULL
  AND vi.prix_achat_snapshot IS NULL;

-- avoir_client_items
UPDATE avoir_client_items ai
JOIN products p ON p.id = ai.product_id
SET ai.prix_achat_snapshot = p.prix_achat
WHERE ai.bon_commande_id IS NULL
  AND ai.prix_achat_snapshot IS NULL;

-- avoir_comptant_items
UPDATE avoir_comptant_items ai
JOIN products p ON p.id = ai.product_id
SET ai.prix_achat_snapshot = p.prix_achat
WHERE ai.bon_commande_id IS NULL
  AND ai.prix_achat_snapshot IS NULL;

-- avoir_fournisseur_items
UPDATE avoir_fournisseur_items ai
JOIN products p ON p.id = ai.product_id
SET ai.prix_achat_snapshot = p.prix_achat
WHERE ai.bon_commande_id IS NULL
  AND ai.prix_achat_snapshot IS NULL;

-- ecommerce_order_items
UPDATE ecommerce_order_items oi
JOIN products p ON p.id = oi.product_id
SET oi.prix_achat_snapshot = p.prix_achat
WHERE oi.bon_commande_id IS NULL
  AND oi.prix_achat_snapshot IS NULL;

-- avoir_ecommerce_items
UPDATE avoir_ecommerce_items ai
JOIN products p ON p.id = ai.product_id
SET ai.prix_achat_snapshot = p.prix_achat
WHERE ai.bon_commande_id IS NULL
  AND ai.prix_achat_snapshot IS NULL;

/* =====================================================
   Vérifications
   ===================================================== */
SELECT 'sortie_items' AS tbl,
       COUNT(*) AS total,
       SUM(bon_commande_id IS NOT NULL) AS with_bon,
       SUM(prix_achat_snapshot IS NOT NULL) AS with_snapshot
FROM sortie_items
UNION ALL
SELECT 'comptant_items', COUNT(*), SUM(bon_commande_id IS NOT NULL), SUM(prix_achat_snapshot IS NOT NULL)
FROM comptant_items
UNION ALL
SELECT 'devis_items', COUNT(*), SUM(bon_commande_id IS NOT NULL), SUM(prix_achat_snapshot IS NOT NULL)
FROM devis_items
UNION ALL
SELECT 'vehicule_items', COUNT(*), SUM(bon_commande_id IS NOT NULL), SUM(prix_achat_snapshot IS NOT NULL)
FROM vehicule_items
UNION ALL
SELECT 'avoir_client_items', COUNT(*), SUM(bon_commande_id IS NOT NULL), SUM(prix_achat_snapshot IS NOT NULL)
FROM avoir_client_items
UNION ALL
SELECT 'avoir_comptant_items', COUNT(*), SUM(bon_commande_id IS NOT NULL), SUM(prix_achat_snapshot IS NOT NULL)
FROM avoir_comptant_items
UNION ALL
SELECT 'avoir_fournisseur_items', COUNT(*), SUM(bon_commande_id IS NOT NULL), SUM(prix_achat_snapshot IS NOT NULL)
FROM avoir_fournisseur_items
UNION ALL
SELECT 'ecommerce_order_items', COUNT(*), SUM(bon_commande_id IS NOT NULL), SUM(prix_achat_snapshot IS NOT NULL)
FROM ecommerce_order_items
UNION ALL
SELECT 'avoir_ecommerce_items', COUNT(*), SUM(bon_commande_id IS NOT NULL), SUM(prix_achat_snapshot IS NOT NULL)
FROM avoir_ecommerce_items;
