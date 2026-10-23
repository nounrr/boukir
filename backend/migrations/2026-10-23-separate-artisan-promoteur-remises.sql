-- Keep the legacy Artisan/Promoteur value for existing accounts until reviewed.
ALTER TABLE contacts
  MODIFY COLUMN type_compte ENUM('Client', 'Artisan', 'Promoteur', 'Artisan/Promoteur', 'Fournisseur') NULL;

ALTER TABLE contacts
  ADD COLUMN type_compte_demande ENUM('Artisan', 'Promoteur') NULL AFTER demande_artisan;

ALTER TABLE products
  ADD COLUMN remise_promoteur DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER remise_artisan;

ALTER TABLE product_variants
  ADD COLUMN remise_promoteur DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER remise_artisan;
