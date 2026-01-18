-- Migration: create tables for avoirs_comptant (cash credit notes without registered client)
-- Assumption: numbering prefix will be 'AVCC' (Avoir Comptant) distinct from client avoirs 'AVC'.
-- Adjust if you prefer a different prefix.

CREATE TABLE  avoirs_comptant (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date_creation DATETIME NOT NULL,
  client_nom VARCHAR(255) NOT NULL, -- direct free text client name
  lieu_chargement VARCHAR(255) NULL,
  adresse_livraison VARCHAR(255) NULL,
  montant_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  statut ENUM('En attente','Validé','Appliqué','Annulé') NOT NULL DEFAULT 'En attente',
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_date_creation (date_creation),
  INDEX idx_statut (statut)
);

CREATE TABLE  avoir_comptant_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  avoir_comptant_id INT NOT NULL,
  product_id INT NOT NULL,
  quantite DECIMAL(12,3) NOT NULL DEFAULT 0,
  prix_unitaire DECIMAL(12,3) NOT NULL DEFAULT 0,
  remise_pourcentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  remise_montant DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  FOREIGN KEY (avoir_comptant_id) REFERENCES avoirs_comptant(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  INDEX idx_avoir_comptant_id (avoir_comptant_id)
);
