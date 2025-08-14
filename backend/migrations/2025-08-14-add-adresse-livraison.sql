-- Add adresse_livraison column to various bon tables
ALTER TABLE bons_commande ADD COLUMN  adresse_livraison VARCHAR(255) NULL;
ALTER TABLE bons_sortie ADD COLUMN  adresse_livraison VARCHAR(255) NULL;
ALTER TABLE bons_comptant ADD COLUMN  adresse_livraison VARCHAR(255) NULL;
ALTER TABLE devis ADD COLUMN  adresse_livraison VARCHAR(255) NULL;
ALTER TABLE avoirs_client ADD COLUMN  adresse_livraison VARCHAR(255) NULL;
ALTER TABLE avoirs_fournisseur ADD COLUMN  adresse_livraison VARCHAR(255) NULL;
