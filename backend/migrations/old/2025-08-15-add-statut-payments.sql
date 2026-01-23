-- Add statut column to payments to support payment workflow statuses
ALTER TABLE payments
  ADD COLUMN statut ENUM('En attente','Validé','Refusé','Annulé') DEFAULT 'En attente';

-- Optional: update existing rows to default if needed and migrate old lowercase values
ALTER TABLE products
  ADD COLUMN kg DECIMAL(10,2) NULL DEFAULT NULL;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS societe VARCHAR(255) DEFAULT NULL;
-- deja fait --
ALTER TABLE bons_comptant
  DROP COLUMN  numero;
ALTER TABLE bons_commande
  DROP COLUMN  numero;
ALTER TABLE bons_sortie
  DROP COLUMN  numero;

-- Correct table names
ALTER TABLE avoirs_client
  DROP COLUMN  numero;
ALTER TABLE avoirs_fournisseur
  DROP COLUMN  numero;