CREATE TABLE IF NOT EXISTS services (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(150) NOT NULL,
  nom_ar VARCHAR(150) NOT NULL,
  description TEXT NULL,
  description_ar TEXT NULL,
  image_url VARCHAR(1024) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT NULL,
  updated_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_services_nom (nom),
  KEY idx_services_available (is_active, deleted_at),
  KEY idx_services_nom_ar (nom_ar)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS service_maalem_categories (
  service_id INT UNSIGNED NOT NULL,
  category_id INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (service_id, category_id),
  KEY idx_service_maalem_categories_category (category_id, service_id),
  CONSTRAINT fk_service_maalem_categories_service
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_service_maalem_categories_category
    FOREIGN KEY (category_id) REFERENCES maalem_categories(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
