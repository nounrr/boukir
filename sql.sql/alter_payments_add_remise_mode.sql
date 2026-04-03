ALTER TABLE payments
  MODIFY COLUMN mode_paiement ENUM('Espèces','Chèque','Traite','Virement','Remise') DEFAULT NULL;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS remise_account_id INT NULL AFTER contact_id,
  ADD COLUMN IF NOT EXISTS remise_account_type VARCHAR(32) NULL AFTER remise_account_id,
  ADD COLUMN IF NOT EXISTS remise_account_name VARCHAR(255) NULL AFTER remise_account_type;