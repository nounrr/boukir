-- Add phone column to all bon-related tables (per-bon phone, not tied to contact)
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS when supported; otherwise checks are manual.

ALTER TABLE bons_commande 
  ADD COLUMN  phone VARCHAR(50) NULL AFTER fournisseur_id;

ALTER TABLE bons_sortie 
  ADD COLUMN  phone VARCHAR(50) NULL AFTER client_id;

ALTER TABLE bons_comptant 
  ADD COLUMN  phone VARCHAR(50) NULL AFTER client_id;

ALTER TABLE devis 
  ADD COLUMN  phone VARCHAR(50) NULL AFTER client_id;

ALTER TABLE avoirs_client 
  ADD COLUMN  phone VARCHAR(50) NULL AFTER client_id;

ALTER TABLE avoirs_fournisseur 
  ADD COLUMN  phone VARCHAR(50) NULL AFTER fournisseur_id;

ALTER TABLE avoirs_comptant 
  ADD COLUMN  phone VARCHAR(50) NULL AFTER client_nom;

ALTER TABLE bons_vehicule 
  ADD COLUMN  phone VARCHAR(50) NULL AFTER vehicule_id;
