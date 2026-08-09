CREATE TABLE IF NOT EXISTS maalem_categories (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(100) NOT NULL,
  nom_ar VARCHAR(100) NOT NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT NULL,
  updated_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_maalem_categories_nom (nom),
  KEY idx_maalem_categories_available (is_active, deleted_at),
  KEY idx_maalem_categories_nom_ar (nom_ar)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
