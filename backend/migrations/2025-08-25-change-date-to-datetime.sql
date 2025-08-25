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

-- Table devis
ALTER TABLE devis
  MODIFY COLUMN date_creation DATETIME;

-- Table employees - GARDER date_embauche en DATE
-- ALTER TABLE employees
--   MODIFY COLUMN date_embauche DATETIME NULL;

-- Table payments - changer SEULEMENT date_paiement en DATETIME, garder date_echeance en DATE
ALTER TABLE payments
  MODIFY COLUMN date_paiement DATETIME NULL;

-- Mettre à jour les index sur les colonnes de date si nécessaire
-- Les index existants sur les colonnes DATE seront automatiquement mis à jour

-- Note: Les valeurs existantes seront automatiquement converties
-- Les dates comme '2025-01-15' deviendront '2025-01-15 00:00:00'
