ALTER TABLE products
  ADD COLUMN prix_vente_2 DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER prix_vente;
ALTER TABLE product_variants
  ADD COLUMN prix_vente_2 DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER prix_vente;
