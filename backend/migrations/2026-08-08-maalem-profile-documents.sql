CREATE TABLE IF NOT EXISTS maalem_profile_documents (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  profile_id INT UNSIGNED NOT NULL,
  kind ENUM('cv', 'realization') NOT NULL,
  storage_key VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_maalem_profile_documents_storage_key (storage_key),
  KEY idx_maalem_profile_documents_profile (profile_id, kind, deleted_at),
  CONSTRAINT fk_maalem_profile_documents_profile
    FOREIGN KEY (profile_id) REFERENCES maalem_profiles(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
