ALTER TABLE payments
  ADD COLUMN payment_group_id VARCHAR(64) NULL AFTER numero;

ALTER TABLE payments
  ADD COLUMN remise_account_id INT NULL AFTER contact_id;

ALTER TABLE payments
  ADD COLUMN remise_account_type VARCHAR(32) NULL AFTER remise_account_id;

ALTER TABLE payments
  ADD COLUMN remise_account_name VARCHAR(255) NULL AFTER remise_account_type;

ALTER TABLE payments
  ADD COLUMN montant_ignorer DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER montant_total;

ALTER TABLE payments
  ADD COLUMN date_ajout_reelle DATETIME DEFAULT CURRENT_TIMESTAMP AFTER created_at;

CREATE INDEX idx_payments_group_id ON payments (payment_group_id);

CREATE INDEX idx_payments_remise_account_id ON payments (remise_account_id);

CREATE TABLE IF NOT EXISTS remise_contact_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contact_id INT NOT NULL,
  product_id INT NOT NULL,
  bon_id INT NULL,
  bon_type ENUM('Commande','Sortie','Comptant') NULL,
  qte INT NOT NULL DEFAULT 1,
  prix_remise DECIMAL(10,2) NOT NULL DEFAULT 0,
  statut ENUM('En attente','Validé','Annulé') NOT NULL DEFAULT 'En attente',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_remise_contact_items_contact_id (contact_id),
  KEY idx_remise_contact_items_bon (bon_type, bon_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
