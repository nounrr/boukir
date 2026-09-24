-- Module Projets (PDG) : projets, devis, avances, bons produits et bons charge.
-- Tables isolées : aucun impact sur le stock, la caisse ni les statistiques.
-- Le serveur applique également ce schéma au démarrage (ensureProjetsSchema).

CREATE TABLE IF NOT EXISTS projets_settings (
  id TINYINT NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  updated_by INT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS projets (
  id INT NOT NULL AUTO_INCREMENT,
  nom VARCHAR(180) NOT NULL,
  description TEXT NULL,
  date_debut DATE NULL,
  date_fin DATE NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS projet_devis_lignes (
  id INT NOT NULL AUTO_INCREMENT,
  projet_id INT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  designation VARCHAR(255) NOT NULL,
  unite VARCHAR(50) NULL,
  quantite DECIMAL(14,3) NOT NULL DEFAULT 1,
  prix_unitaire DECIMAL(14,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_projet_devis_projet (projet_id),
  CONSTRAINT fk_projet_devis_projet FOREIGN KEY (projet_id) REFERENCES projets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS projet_avances (
  id INT NOT NULL AUTO_INCREMENT,
  projet_id INT NOT NULL,
  date_avance DATE NOT NULL,
  montant DECIMAL(14,2) NOT NULL,
  mode_paiement ENUM('Espece', 'Virement', 'Cheque') NOT NULL DEFAULT 'Espece',
  description TEXT NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_projet_avances_projet (projet_id, date_avance),
  CONSTRAINT fk_projet_avances_projet FOREIGN KEY (projet_id) REFERENCES projets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS projet_bons (
  id INT NOT NULL AUTO_INCREMENT,
  projet_id INT NOT NULL,
  type ENUM('products', 'charge') NOT NULL,
  date_bon DATE NOT NULL,
  observations TEXT NULL,
  montant_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_projet_bons_projet (projet_id, type, date_bon),
  CONSTRAINT fk_projet_bons_projet FOREIGN KEY (projet_id) REFERENCES projets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS projet_bon_items (
  id INT NOT NULL AUTO_INCREMENT,
  bon_id INT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  product_id INT NULL,
  variant_id INT NULL,
  unit_id INT NULL,
  designation VARCHAR(255) NOT NULL,
  unite VARCHAR(50) NULL,
  quantite DECIMAL(14,3) NOT NULL DEFAULT 1,
  prix_unitaire DECIMAL(14,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_projet_bon_items_bon (bon_id),
  KEY idx_projet_bon_items_product (product_id),
  CONSTRAINT fk_projet_bon_items_bon FOREIGN KEY (bon_id) REFERENCES projet_bons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
