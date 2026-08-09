CREATE TABLE IF NOT EXISTS maalem_profiles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  contact_id INT NOT NULL,
  category_id INT UNSIGNED NULL,
  status ENUM('draft', 'submitted', 'under_review', 'approved', 'rejected', 'suspended') NOT NULL DEFAULT 'draft',
  professional_data JSON NULL,
  status_reason VARCHAR(500) NULL,
  submitted_at DATETIME NULL,
  reviewed_at DATETIME NULL,
  reviewed_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_maalem_profiles_contact (contact_id),
  KEY idx_maalem_profiles_status (status, deleted_at),
  KEY idx_maalem_profiles_category (category_id, status, deleted_at),
  CONSTRAINT fk_maalem_profiles_contact
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_maalem_profiles_category
    FOREIGN KEY (category_id) REFERENCES maalem_categories(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
