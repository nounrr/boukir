-- Create tables for client remises (discounts)
CREATE TABLE IF NOT EXISTS client_remises (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NULL,
  cin VARCHAR(50) NULL,
  note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS item_remises (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_remise_id INT NOT NULL,
  product_id INT NOT NULL,
  bon_id INT NULL,
  bon_type ENUM('Commande','Sortie','Comptant') NULL,
  qte INT NOT NULL DEFAULT 0,
  prix_remise DECIMAL(10,2) NOT NULL DEFAULT 0,
  statut ENUM('En attente','Validé','Annulé') NOT NULL DEFAULT 'En attente',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_item_remises_client FOREIGN KEY (client_remise_id) REFERENCES client_remises(id) ON DELETE CASCADE,
  CONSTRAINT fk_item_remises_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);
