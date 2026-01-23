-- Migration pour ajouter le champ client_nom à la table devis
-- Date: 2025-09-18
-- Description: Permet de sauvegarder un nom de client libre pour les devis sans créer de contact

ALTER TABLE devis ADD COLUMN client_nom VARCHAR(255) NULL AFTER client_id;

-- Commentaire sur la colonne
ALTER TABLE devis MODIFY client_nom VARCHAR(255) NULL COMMENT 'Nom libre du client pour devis sans contact enregistré';