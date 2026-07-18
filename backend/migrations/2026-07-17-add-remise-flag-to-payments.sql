ALTER TABLE payments
  ADD COLUMN remise TINYINT(1) NOT NULL DEFAULT 0 AFTER montant_ignorer;
