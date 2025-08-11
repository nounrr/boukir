-- Migration vers tables séparées par type de bon

-- 1. Tables pour les différents types de bons
CREATE TABLE IF NOT EXISTS bons_commande (
  id INT PRIMARY KEY AUTO_INCREMENT,
  numero VARCHAR(50) UNIQUE NOT NULL,
  date_creation DATE NOT NULL,
  date_echeance DATE,
  fournisseur_id INT,
  vehicule_id INT,
  lieu_chargement VARCHAR(255),
  montant_ht DECIMAL(10,2) DEFAULT 0,
  montant_tva DECIMAL(10,2) DEFAULT 0,
  montant_total DECIMAL(10,2) NOT NULL,
  statut ENUM('Brouillon', 'En attente', 'Validé', 'Livré', 'Facturé', 'Annulé') DEFAULT 'Brouillon',
  notes TEXT,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_fournisseur (fournisseur_id),
  INDEX idx_vehicule (vehicule_id),
  INDEX idx_statut (statut),
  INDEX idx_date_creation (date_creation),
  FOREIGN KEY (fournisseur_id) REFERENCES contacts(id),
  FOREIGN KEY (vehicule_id) REFERENCES vehicules(id),
  FOREIGN KEY (created_by) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS bons_sortie (
  id INT PRIMARY KEY AUTO_INCREMENT,
  numero VARCHAR(50) UNIQUE NOT NULL,
  date_creation DATE NOT NULL,
  date_livraison DATE,
  client_id INT,
  vehicule_id INT,
  lieu_livraison VARCHAR(255),
  montant_ht DECIMAL(10,2) DEFAULT 0,
  montant_tva DECIMAL(10,2) DEFAULT 0,
  montant_total DECIMAL(10,2) NOT NULL,
  statut ENUM('Brouillon', 'En attente', 'Validé', 'Livré', 'Facturé', 'Annulé') DEFAULT 'Brouillon',
  bon_commande_id INT, -- Lien vers le bon de commande d'origine
  notes TEXT,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_client (client_id),
  INDEX idx_vehicule (vehicule_id),
  INDEX idx_statut (statut),
  INDEX idx_date_creation (date_creation),
  INDEX idx_bon_commande (bon_commande_id),
  FOREIGN KEY (client_id) REFERENCES contacts(id),
  FOREIGN KEY (vehicule_id) REFERENCES vehicules(id),
  FOREIGN KEY (bon_commande_id) REFERENCES bons_commande(id),
  FOREIGN KEY (created_by) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS bons_comptant (
  id INT PRIMARY KEY AUTO_INCREMENT,
  numero VARCHAR(50) UNIQUE NOT NULL,
  date_creation DATE NOT NULL,
  date_livraison DATE,
  client_id INT,
  vehicule_id INT,
  lieu_livraison VARCHAR(255),
  montant_ht DECIMAL(10,2) DEFAULT 0,
  montant_tva DECIMAL(10,2) DEFAULT 0,
  montant_total DECIMAL(10,2) NOT NULL,
  montant_paye DECIMAL(10,2) DEFAULT 0,
  mode_paiement ENUM('Espèces', 'Chèque', 'Virement', 'Carte') DEFAULT 'Espèces',
  statut ENUM('Brouillon', 'En attente', 'Validé', 'Livré', 'Payé', 'Annulé') DEFAULT 'Brouillon',
  notes TEXT,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_client (client_id),
  INDEX idx_vehicule (vehicule_id),
  INDEX idx_statut (statut),
  INDEX idx_date_creation (date_creation),
  FOREIGN KEY (client_id) REFERENCES contacts(id),
  FOREIGN KEY (vehicule_id) REFERENCES vehicules(id),
  FOREIGN KEY (created_by) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS devis (
  id INT PRIMARY KEY AUTO_INCREMENT,
  numero VARCHAR(50) UNIQUE NOT NULL,
  date_creation DATE NOT NULL,
  date_validite DATE,
  client_id INT,
  montant_ht DECIMAL(10,2) DEFAULT 0,
  montant_tva DECIMAL(10,2) DEFAULT 0,
  montant_total DECIMAL(10,2) NOT NULL,
  statut ENUM('Brouillon', 'Envoyé', 'Accepté', 'Refusé', 'Expiré') DEFAULT 'Brouillon',
  notes TEXT,
  conditions_particulieres TEXT,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_client (client_id),
  INDEX idx_statut (statut),
  INDEX idx_date_creation (date_creation),
  FOREIGN KEY (client_id) REFERENCES contacts(id),
  FOREIGN KEY (created_by) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS avoirs_client (
  id INT PRIMARY KEY AUTO_INCREMENT,
  numero VARCHAR(50) UNIQUE NOT NULL,
  date_creation DATE NOT NULL,
  client_id INT,
  bon_origine_id INT, -- Référence vers le bon d'origine (sortie ou comptant)
  bon_origine_type ENUM('sortie', 'comptant') NOT NULL,
  motif TEXT,
  montant_ht DECIMAL(10,2) DEFAULT 0,
  montant_tva DECIMAL(10,2) DEFAULT 0,
  montant_total DECIMAL(10,2) NOT NULL,
  statut ENUM('Brouillon', 'Validé', 'Appliqué', 'Annulé') DEFAULT 'Brouillon',
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_client (client_id),
  INDEX idx_statut (statut),
  INDEX idx_date_creation (date_creation),
  FOREIGN KEY (client_id) REFERENCES contacts(id),
  FOREIGN KEY (created_by) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS avoirs_fournisseur (
  id INT PRIMARY KEY AUTO_INCREMENT,
  numero VARCHAR(50) UNIQUE NOT NULL,
  date_creation DATE NOT NULL,
  fournisseur_id INT,
  bon_commande_id INT, -- Référence vers le bon de commande d'origine
  motif TEXT,
  montant_ht DECIMAL(10,2) DEFAULT 0,
  montant_tva DECIMAL(10,2) DEFAULT 0,
  montant_total DECIMAL(10,2) NOT NULL,
  statut ENUM('Brouillon', 'Validé', 'Appliqué', 'Annulé') DEFAULT 'Brouillon',
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_fournisseur (fournisseur_id),
  INDEX idx_statut (statut),
  INDEX idx_date_creation (date_creation),
  FOREIGN KEY (fournisseur_id) REFERENCES contacts(id),
  FOREIGN KEY (bon_commande_id) REFERENCES bons_commande(id),
  FOREIGN KEY (created_by) REFERENCES employees(id)
);

-- 2. Tables des items pour chaque type de bon
CREATE TABLE IF NOT EXISTS commande_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  bon_commande_id INT NOT NULL,
  product_id INT NOT NULL,
  quantite DECIMAL(10,2) NOT NULL,
  prix_unitaire DECIMAL(10,2) NOT NULL,
  remise_pourcentage DECIMAL(5,2) DEFAULT 0,
  remise_montant DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bon_commande_id) REFERENCES bons_commande(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS sortie_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  bon_sortie_id INT NOT NULL,
  product_id INT NOT NULL,
  quantite DECIMAL(10,2) NOT NULL,
  prix_unitaire DECIMAL(10,2) NOT NULL,
  remise_pourcentage DECIMAL(5,2) DEFAULT 0,
  remise_montant DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bon_sortie_id) REFERENCES bons_sortie(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS comptant_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  bon_comptant_id INT NOT NULL,
  product_id INT NOT NULL,
  quantite DECIMAL(10,2) NOT NULL,
  prix_unitaire DECIMAL(10,2) NOT NULL,
  remise_pourcentage DECIMAL(5,2) DEFAULT 0,
  remise_montant DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bon_comptant_id) REFERENCES bons_comptant(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS devis_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  devis_id INT NOT NULL,
  product_id INT NOT NULL,
  quantite DECIMAL(10,2) NOT NULL,
  prix_unitaire DECIMAL(10,2) NOT NULL,
  remise_pourcentage DECIMAL(5,2) DEFAULT 0,
  remise_montant DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (devis_id) REFERENCES devis(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS avoir_client_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  avoir_client_id INT NOT NULL,
  product_id INT NOT NULL,
  quantite DECIMAL(10,2) NOT NULL,
  prix_unitaire DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (avoir_client_id) REFERENCES avoirs_client(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS avoir_fournisseur_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  avoir_fournisseur_id INT NOT NULL,
  product_id INT NOT NULL,
  quantite DECIMAL(10,2) NOT NULL,
  prix_unitaire DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (avoir_fournisseur_id) REFERENCES avoirs_fournisseur(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);
