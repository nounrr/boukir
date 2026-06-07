ALTER TABLE contacts
  ADD COLUMN montant_garantie DECIMAL(12,2) NULL AFTER plafond,
  ADD COLUMN numero_garantie VARCHAR(255) NULL AFTER montant_garantie;
