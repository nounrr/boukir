CREATE TABLE IF NOT EXISTS contact_comments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  contact_id INT NOT NULL,
  contenu TEXT NOT NULL,
  couleur VARCHAR(20) NULL,
  epingle TINYINT(1) NOT NULL DEFAULT 0,
  created_by INT NULL,
  updated_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  KEY idx_contact_comments_contact (contact_id, deleted_at),
  KEY idx_contact_comments_recent (contact_id, epingle, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
