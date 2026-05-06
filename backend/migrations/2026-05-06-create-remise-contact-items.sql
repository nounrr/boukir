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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
