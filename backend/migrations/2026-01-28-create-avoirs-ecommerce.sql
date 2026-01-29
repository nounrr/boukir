-- Migration: create tables for ecommerce credit notes (avoirs_ecommerce)
-- Created: 2026-01-28

CREATE TABLE IF NOT EXISTS avoirs_ecommerce (
  id INT PRIMARY KEY AUTO_INCREMENT,

  -- Link to original ecommerce order (optional but recommended)
  ecommerce_order_id INT DEFAULT NULL,
  order_number VARCHAR(50) DEFAULT NULL,

  -- Customer snapshot
  customer_name VARCHAR(255) DEFAULT NULL,
  customer_email VARCHAR(255) DEFAULT NULL,
  customer_phone VARCHAR(50) DEFAULT NULL,
  adresse_livraison VARCHAR(255) DEFAULT NULL,

  date_creation DATETIME NOT NULL,
  montant_total DECIMAL(10, 2) NOT NULL,

  statut ENUM('En attente','Validé','Appliqué','Annulé') DEFAULT 'En attente',
  created_by INT NOT NULL,
  isNotCalculated TINYINT(1) DEFAULT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (ecommerce_order_id) REFERENCES ecommerce_orders(id) ON DELETE SET NULL,
  INDEX idx_avoirs_ecommerce_order_id (ecommerce_order_id),
  INDEX idx_avoirs_ecommerce_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS avoir_ecommerce_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  avoir_ecommerce_id INT NOT NULL,
  product_id INT NOT NULL,
  variant_id INT DEFAULT NULL,
  unit_id INT DEFAULT NULL,

  quantite INT NOT NULL,
  prix_unitaire DECIMAL(10, 2) NOT NULL,
  remise_pourcentage DECIMAL(5, 2) DEFAULT 0.00,
  remise_montant DECIMAL(10, 2) DEFAULT 0.00,
  total DECIMAL(10, 2) NOT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (avoir_ecommerce_id) REFERENCES avoirs_ecommerce(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL,
  FOREIGN KEY (unit_id) REFERENCES product_units(id) ON DELETE SET NULL,
  INDEX idx_avoir_ecom_id (avoir_ecommerce_id),
  INDEX idx_avoir_ecom_product_id (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
