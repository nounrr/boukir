CREATE TABLE IF NOT EXISTS product_categories (
  product_id INT NOT NULL,
  category_id INT NOT NULL,
  position INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, category_id),
  INDEX idx_product_categories_category (category_id, product_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS charges_fixes (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  libelle VARCHAR(190) NOT NULL,
  montant_mensuel DECIMAL(12,3) NOT NULL,
  date_debut DATE NULL,
  date_fin DATE NULL,
  created_by INT NULL,
  updated_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  INDEX idx_charges_fixes_dates (deleted_at, date_debut, date_fin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @client_no_response_ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts' AND COLUMN_NAME = 'ne_repond_pas'),
  'SELECT 1',
  'ALTER TABLE contacts ADD COLUMN ne_repond_pas TINYINT(1) NOT NULL DEFAULT 0'
);
PREPARE client_no_response_stmt FROM @client_no_response_ddl;
EXECUTE client_no_response_stmt;
DEALLOCATE PREPARE client_no_response_stmt;
