ALTER TABLE maalem_profiles
  MODIFY COLUMN origin ENUM(
    'SELF_SERVICE',
    'NEW_REGISTRATION',
    'ARTISAN_CONVERSION',
    'TEAM_CREATED'
  ) NOT NULL DEFAULT 'SELF_SERVICE';

CREATE TABLE IF NOT EXISTS maalem_profile_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  profile_id INT UNSIGNED NOT NULL,
  event_type ENUM('STATUS_CHANGED', 'CATEGORY_CHANGED', 'INTERNAL_NOTE') NOT NULL,
  old_status ENUM('draft', 'submitted', 'under_review', 'approved', 'rejected', 'suspended') NULL,
  new_status ENUM('draft', 'submitted', 'under_review', 'approved', 'rejected', 'suspended') NULL,
  old_category_id INT UNSIGNED NULL,
  new_category_id INT UNSIGNED NULL,
  note TEXT NULL,
  actor_type ENUM('CANDIDATE', 'BACKOFFICE', 'SYSTEM') NOT NULL,
  actor_employee_id INT NULL,
  actor_contact_id INT NULL,
  actor_name VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_maalem_profile_history_profile (profile_id, created_at, id),
  KEY idx_maalem_profile_history_employee (actor_employee_id, created_at),
  KEY idx_maalem_profile_history_contact (actor_contact_id, created_at),
  CONSTRAINT fk_maalem_profile_history_profile
    FOREIGN KEY (profile_id) REFERENCES maalem_profiles(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_maalem_profile_history_old_category
    FOREIGN KEY (old_category_id) REFERENCES maalem_categories(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_maalem_profile_history_new_category
    FOREIGN KEY (new_category_id) REFERENCES maalem_categories(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_maalem_profile_history_employee
    FOREIGN KEY (actor_employee_id) REFERENCES employees(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_maalem_profile_history_contact
    FOREIGN KEY (actor_contact_id) REFERENCES contacts(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO maalem_profile_history
  (profile_id, event_type, old_status, new_status, note, actor_type, actor_name, created_at)
SELECT mp.id,
       'STATUS_CHANGED',
       NULL,
       mp.status,
       'État initial repris lors de l’activation du journal KAN-7',
       'SYSTEM',
       'Migration KAN-7',
       COALESCE(mp.reviewed_at, mp.submitted_at, mp.created_at)
FROM maalem_profiles mp
WHERE mp.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM maalem_profile_history mph WHERE mph.profile_id = mp.id
  );
