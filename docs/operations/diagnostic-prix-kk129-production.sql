-- Diagnostic en lecture seule : Silicone Coloré - KERAKOLL / KK129.
-- Identifiants confirmés par l'API e-commerce de production le 12 octobre 2026.
-- À exécuter dans la base utilisée par le backend de PRODUCTION.

SELECT DATABASE() AS base, NOW() AS date_verification;

SELECT p.id AS product_id, p.designation,
       p.prix_vente AS produit_pv, p.prix_vente_2 AS produit_pv2,
       pv.id AS variant_id, pv.product_id AS parent_variante, pv.variant_name,
       pv.prix_vente AS variante_pv, pv.prix_vente_2 AS variante_pv2,
       pv.sale_price_corrected_at, pv.updated_at
FROM product_variants pv
JOIN products p ON p.id = pv.product_id
WHERE pv.id = 93;

-- Inclure tous les snapshots de la variante, même rattachés à un ancien produit.
SELECT id, product_id, variant_id, quantite, prix_vente, prix_vente_2,
       en_validation, sale_price_corrected_at, created_at
FROM product_snapshot
WHERE variant_id = 93
ORDER BY (quantite > 0) DESC, created_at, id;

SELECT id, product_id, variant_id, action, apply_to_all_variants,
       prix_vente, prix_vente_2, expected_prix_vente, expected_prix_vente_2,
       statut, requested_at, decided_at
FROM sale_price_correction_requests
WHERE (product_id = 6190 AND variant_id IS NULL) OR variant_id = 93
ORDER BY requested_at DESC
LIMIT 20;

SELECT TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_TABLE,
       ACTION_TIMING, ACTION_STATEMENT
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA = DATABASE()
  AND EVENT_OBJECT_TABLE IN ('product_variants', 'product_snapshot');
