CREATE TABLE IF NOT EXISTS fond_caisse_entries (
  id INT NOT NULL AUTO_INCREMENT,
  montant DECIMAL(12,2) NOT NULL DEFAULT 0,
  opened_at DATETIME NOT NULL,
  jour DATE NOT NULL,
  created_by INT NULL,
  created_by_name VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fond_caisse_entries_jour (jour),
  KEY idx_fond_caisse_entries_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
