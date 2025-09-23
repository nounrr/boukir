-- Add isNotCalculated column to all bon tables
-- This column will be TRUE when the bon should not be calculated, NULL otherwise

-- Bon de Commande
ALTER TABLE bons_commande 
ADD COLUMN isNotCalculated BOOLEAN NULL DEFAULT NULL;

-- Bon de Sortie
ALTER TABLE bons_sortie 
ADD COLUMN isNotCalculated BOOLEAN NULL DEFAULT NULL;

-- Bon Comptant
ALTER TABLE bons_comptant 
ADD COLUMN isNotCalculated BOOLEAN NULL DEFAULT NULL;

-- Devis
ALTER TABLE devis 
ADD COLUMN isNotCalculated BOOLEAN NULL DEFAULT NULL;

-- Avoirs Client
ALTER TABLE avoirs_client 
ADD COLUMN isNotCalculated BOOLEAN NULL DEFAULT NULL;

-- Avoirs Fournisseur
ALTER TABLE avoirs_fournisseur 
ADD COLUMN isNotCalculated BOOLEAN NULL DEFAULT NULL;

-- Avoirs Comptant
ALTER TABLE avoirs_comptant 
ADD COLUMN isNotCalculated BOOLEAN NULL DEFAULT NULL;

-- Bons Véhicule
ALTER TABLE bons_vehicule 
ADD COLUMN isNotCalculated BOOLEAN NULL DEFAULT NULL;