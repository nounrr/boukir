-- Create bons_vehicule and vehicule_items tables
CREATE TABLE IF NOT EXISTS bons_vehicule (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date_creation DATE NOT NULL,
  vehicule_id INT NULL,
  lieu_chargement VARCHAR(255) NULL,
  adresse_livraison VARCHAR(255) NULL,
  montant_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  statut ENUM('Brouillon','En attente','Validé','Livré','Annulé') NOT NULL DEFAULT 'Brouillon',
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bv_vehicule FOREIGN KEY (vehicule_id) REFERENCES vehicules(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS vehicule_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bon_vehicule_id INT NOT NULL,
  product_id INT NOT NULL,
  quantite DECIMAL(12,3) NOT NULL DEFAULT 0,
  prix_unitaire DECIMAL(12,2) NOT NULL DEFAULT 0,
  remise_pourcentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  remise_montant DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_vi_bv FOREIGN KEY (bon_vehicule_id) REFERENCES bons_vehicule(id) ON DELETE CASCADE,
  CONSTRAINT fk_vi_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
