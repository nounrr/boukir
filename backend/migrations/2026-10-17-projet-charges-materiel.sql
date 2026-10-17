-- Les charges existantes restent des charges produit.
ALTER TABLE projet_bons MODIFY COLUMN type ENUM('products', 'charge', 'charge_materiel') NOT NULL;
