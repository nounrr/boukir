ALTER TABLE product_variants
ADD COLUMN cout_revient DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN cout_revient_pourcentage DECIMAL(5, 2) DEFAULT 0,
ADD COLUMN prix_gros DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN prix_gros_pourcentage DECIMAL(5, 2) DEFAULT 0,
ADD COLUMN prix_vente_pourcentage DECIMAL(5, 2) DEFAULT 0;
