-- Add societe (nom de la société) to contacts
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS societe VARCHAR(255) DEFAULT NULL;

-- Backfill: if nom_complet contains a company-like value this is manual; skip automated backfill

