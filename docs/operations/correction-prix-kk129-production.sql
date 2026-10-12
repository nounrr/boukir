-- PRODUCTION : prix demandés par l'utilisateur pour Silicone Coloré - KERAKOLL / KK129.
-- Produit 6190, variante 93 ; ne modifie ni les quantités ni les autres variantes.
START TRANSACTION;

SELECT id, product_id, variant_name, prix_vente, prix_vente_2
FROM product_variants
WHERE id = 93 AND product_id = 6190 AND UPPER(TRIM(variant_name)) = 'KK129'
FOR UPDATE;

UPDATE product_snapshot ps
JOIN product_variants pv ON pv.id = ps.variant_id AND pv.product_id = ps.product_id
SET ps.prix_vente = 140, ps.prix_vente_2 = 140,
    ps.sale_price_corrected_at = NOW()
WHERE pv.id = 93 AND pv.product_id = 6190
  AND UPPER(TRIM(pv.variant_name)) = 'KK129';

UPDATE product_variants
SET prix_vente = 140, prix_vente_2 = 140,
    sale_price_corrected_at = NOW(), updated_at = NOW()
WHERE id = 93 AND product_id = 6190 AND UPPER(TRIM(variant_name)) = 'KK129';

COMMIT;

SELECT pv.id AS variant_id, pv.variant_name,
       pv.prix_vente AS variante_pv, pv.prix_vente_2 AS variante_pv2,
       ps.id AS snapshot_id, ps.prix_vente AS stock_pv, ps.prix_vente_2 AS stock_pv2
FROM product_variants pv
LEFT JOIN product_snapshot ps ON ps.variant_id = pv.id AND ps.product_id = pv.product_id
WHERE pv.id = 93 AND pv.product_id = 6190;
