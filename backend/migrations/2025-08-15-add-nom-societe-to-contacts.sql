-- Add societe (nom de la société) to contacts
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS societe VARCHAR(255) DEFAULT NULL;

-- Backfill: this is manual (no automated backfill)

