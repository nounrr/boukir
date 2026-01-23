-- Migration complète : Suppression de l'ancienne table bons et création des nouvelles tables séparées

-- 1. Supprimer les anciennes tables
DROP TABLE IF EXISTS bon_items;
DROP TABLE IF EXISTS bons;

-- 2. Créer les nouvelles tables par type de document

-- Table des bons de commande
CREATE TABLE bons_commande (
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
  FOREIGN KEY (fournisseur_id) REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (vehicule_id) REFERENCES vehicules(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES employees(id)
);

-- Table des bons de sortie
CREATE TABLE bons_sortie (
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
  bon_commande_id INT,
  notes TEXT,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_client (client_id),
  INDEX idx_vehicule (vehicule_id),
  INDEX idx_statut (statut),
  INDEX idx_date_creation (date_creation),
  INDEX idx_bon_commande (bon_commande_id),
  FOREIGN KEY (client_id) REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (vehicule_id) REFERENCES vehicules(id) ON DELETE SET NULL,
  FOREIGN KEY (bon_commande_id) REFERENCES bons_commande(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES employees(id)
);

-- Table des bons comptant
CREATE TABLE bons_comptant (
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
  FOREIGN KEY (client_id) REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (vehicule_id) REFERENCES vehicules(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES employees(id)
);

-- Table des devis
CREATE TABLE devis (
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
  FOREIGN KEY (client_id) REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES employees(id)
);

-- Table des avoirs client
CREATE TABLE avoirs_client (
  id INT PRIMARY KEY AUTO_INCREMENT,
  numero VARCHAR(50) UNIQUE NOT NULL,
  date_creation DATE NOT NULL,
  client_id INT,
  bon_origine_id INT,
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
  FOREIGN KEY (client_id) REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES employees(id)
);

-- Table des avoirs fournisseur
CREATE TABLE avoirs_fournisseur (
  id INT PRIMARY KEY AUTO_INCREMENT,
  numero VARCHAR(50) UNIQUE NOT NULL,
  date_creation DATE NOT NULL,
  fournisseur_id INT,
  bon_commande_id INT,
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
  FOREIGN KEY (fournisseur_id) REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (bon_commande_id) REFERENCES bons_commande(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES employees(id)
);

-- 3. Tables des items pour chaque type de document

-- Items des bons de commande
CREATE TABLE commande_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  bon_commande_id INT NOT NULL,
  product_id INT NOT NULL,
  quantite DECIMAL(10,2) NOT NULL,
  prix_unitaire DECIMAL(10,2) NOT NULL,
  remise_pourcentage DECIMAL(5,2) DEFAULT 0,
  remise_montant DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_bon_commande (bon_commande_id),
  INDEX idx_product (product_id),
  FOREIGN KEY (bon_commande_id) REFERENCES bons_commande(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Items des bons de sortie
CREATE TABLE sortie_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  bon_sortie_id INT NOT NULL,
  product_id INT NOT NULL,
  quantite DECIMAL(10,2) NOT NULL,
  prix_unitaire DECIMAL(10,2) NOT NULL,
  remise_pourcentage DECIMAL(5,2) DEFAULT 0,
  remise_montant DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_bon_sortie (bon_sortie_id),
  INDEX idx_product (product_id),
  FOREIGN KEY (bon_sortie_id) REFERENCES bons_sortie(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Items des bons comptant
CREATE TABLE comptant_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  bon_comptant_id INT NOT NULL,
  product_id INT NOT NULL,
  quantite DECIMAL(10,2) NOT NULL,
  prix_unitaire DECIMAL(10,2) NOT NULL,
  remise_pourcentage DECIMAL(5,2) DEFAULT 0,
  remise_montant DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_bon_comptant (bon_comptant_id),
  INDEX idx_product (product_id),
  FOREIGN KEY (bon_comptant_id) REFERENCES bons_comptant(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Items des devis
CREATE TABLE devis_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  devis_id INT NOT NULL,
  product_id INT NOT NULL,
  quantite DECIMAL(10,2) NOT NULL,
  prix_unitaire DECIMAL(10,2) NOT NULL,
  remise_pourcentage DECIMAL(5,2) DEFAULT 0,
  remise_montant DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_devis (devis_id),
  INDEX idx_product (product_id),
  FOREIGN KEY (devis_id) REFERENCES devis(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Items des avoirs client
CREATE TABLE avoir_client_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  avoir_client_id INT NOT NULL,
  product_id INT NOT NULL,
  quantite DECIMAL(10,2) NOT NULL,
  prix_unitaire DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_avoir_client (avoir_client_id),
  INDEX idx_product (product_id),
  FOREIGN KEY (avoir_client_id) REFERENCES avoirs_client(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Items des avoirs fournisseur
CREATE TABLE avoir_fournisseur_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  avoir_fournisseur_id INT NOT NULL,
  product_id INT NOT NULL,
  quantite DECIMAL(10,2) NOT NULL,
  prix_unitaire DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_avoir_fournisseur (avoir_fournisseur_id),
  INDEX idx_product (product_id),
  FOREIGN KEY (avoir_fournisseur_id) REFERENCES avoirs_fournisseur(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);
