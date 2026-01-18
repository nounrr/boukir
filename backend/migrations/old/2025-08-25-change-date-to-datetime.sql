-- Migration pour changer toutes les colonnes DATE en DATETIME
-- Date: 2025-08-25
-- Description: Conversion de toutes les colonnes de type DATE vers DATETIME pour une meilleure précision

-- Table avoirs_client
ALTER TABLE avoirs_client
  MODIFY COLUMN date_creation DATETIME;

-- Table avoirs_fournisseur
ALTER TABLE avoirs_fournisseur
  MODIFY COLUMN date_creation DATETIME;

-- Table bons_commande
ALTER TABLE bons_commande 
  MODIFY COLUMN date_creation DATETIME;

-- Table bons_comptant
ALTER TABLE bons_comptant
  MODIFY COLUMN date_creation DATETIME;

-- Table bons_sortie  
ALTER TABLE bons_sortie
  MODIFY COLUMN date_creation DATETIME;

-- Table bons_vehicule
ALTER TABLE bons_vehicule
  MODIFY COLUMN date_creation DATETIME;


ALTER TABLE devis
  MODIFY COLUMN date_creation DATETIME;
MN date_embauche DATETIME NULL;

ALTER TABLE payments
  MODIFY COLUMN date_paiement DATETIME NULL;

