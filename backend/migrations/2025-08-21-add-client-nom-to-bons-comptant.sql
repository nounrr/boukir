-- Migration: add client_nom to bons_comptant for free-text client name on cash sales
ALTER TABLE bons_comptant
  ADD COLUMN client_nom VARCHAR(255) NULL AFTER client_id;

-- Backfill (optional): copy current linked contact names into client_nom for convenience
UPDATE bons_comptant bc
LEFT JOIN contacts c ON c.id = bc.client_id
SET bc.client_nom = COALESCE(bc.client_nom, c.nom_complet)
WHERE bc.client_nom IS NULL;
