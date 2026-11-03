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
