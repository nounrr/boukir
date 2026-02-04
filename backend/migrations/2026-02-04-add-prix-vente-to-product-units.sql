-- Add optional per-unit selling price override
-- If prix_vente is NULL, frontend/backoffice can compute default as products.prix_vente * conversion_factor

ALTER TABLE product_units
  ADD COLUMN prix_vente DECIMAL(10,2) DEFAULT NULL AFTER conversion_factor;
