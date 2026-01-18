-- Migration: Ajouter les colonnes personne, factures et disponible à old_talons_caisse
-- Date: 2025-08-29

ALTER TABLE old_talons_caisse 
ADD COLUMN personne TEXT NULL COMMENT 'Nom de la personne',
ADD COLUMN factures TEXT NULL COMMENT 'Informations sur les factures',
ADD COLUMN disponible TEXT NULL COMMENT 'Statut de disponibilité';
