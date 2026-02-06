-- Add facteur_isNormal to product_units
-- 1 => default/auto price from product price × conversion_factor
-- 0 => manual override (prix_vente is set)

ALTER TABLE product_units
  ADD COLUMN facteur_isNormal TINYINT(1) NOT NULL DEFAULT 1 AFTER prix_vente;

-- Backfill: units that already have an explicit selling price are not auto
UPDATE product_units
SET facteur_isNormal = 0
WHERE prix_vente IS NOT NULL;
