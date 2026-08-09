CREATE TABLE IF NOT EXISTS service_request_sequences (
  sequence_name VARCHAR(50) NOT NULL PRIMARY KEY,
  current_value BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO service_request_sequences (sequence_name, current_value)
VALUES ('service_request', 0);

CREATE TABLE IF NOT EXISTS service_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_number VARCHAR(32) NOT NULL,
  requester_contact_id INT NOT NULL,
  request_source ENUM('selected_maalem', 'selected_service', 'quick_request') NOT NULL,
  service_id INT UNSIGNED NULL,
  requested_maalem_profile_id INT UNSIGNED NULL,
  qualified_category_id INT UNSIGNED NULL,
  title VARCHAR(160) NULL,
  problem_description TEXT NULL,
  requester_name VARCHAR(255) NULL,
  requester_phone VARCHAR(50) NULL,
  requester_email VARCHAR(255) NULL,
  city VARCHAR(100) NULL,
  intervention_address VARCHAR(500) NULL,
  latitude DECIMAL(10, 7) NULL,
  longitude DECIMAL(10, 7) NULL,
  desired_date DATE NULL,
  desired_time_slot VARCHAR(100) NULL,
  status ENUM('new') NOT NULL DEFAULT 'new',
  request_channel ENUM('ECOMMERCE') NOT NULL DEFAULT 'ECOMMERCE',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_service_requests_number (request_number),
  KEY idx_service_requests_requester (requester_contact_id, created_at),
  KEY idx_service_requests_status (status, deleted_at, created_at),
  KEY idx_service_requests_source (request_source, created_at),
  KEY idx_service_requests_service (service_id, status, deleted_at),
  KEY idx_service_requests_requested_maalem (requested_maalem_profile_id, status, deleted_at),
  KEY idx_service_requests_category (qualified_category_id, status, deleted_at),
  CONSTRAINT fk_service_requests_requester
    FOREIGN KEY (requester_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_service_requests_service
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_service_requests_requested_maalem
    FOREIGN KEY (requested_maalem_profile_id) REFERENCES maalem_profiles(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_service_requests_category
    FOREIGN KEY (qualified_category_id) REFERENCES maalem_categories(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_service_requests_coordinates
    CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL)),
  CONSTRAINT chk_service_requests_source_fields
    CHECK (
      (request_source = 'selected_maalem' AND requested_maalem_profile_id IS NOT NULL)
      OR (request_source = 'selected_service' AND service_id IS NOT NULL)
      OR (request_source = 'quick_request' AND problem_description IS NOT NULL AND CHAR_LENGTH(TRIM(problem_description)) > 0)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS service_request_attachments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT UNSIGNED NOT NULL,
  kind ENUM('PHOTO', 'DOCUMENT') NOT NULL,
  storage_key VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  uploaded_by_contact_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_service_request_attachments_storage (storage_key),
  KEY idx_service_request_attachments_request (request_id, deleted_at, created_at),
  CONSTRAINT fk_service_request_attachments_request
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_service_request_attachments_contact
    FOREIGN KEY (uploaded_by_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS service_request_notes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT UNSIGNED NOT NULL,
  visibility ENUM('INTERNAL', 'SHARED') NOT NULL,
  body TEXT NOT NULL,
  actor_type ENUM('CONTACT', 'EMPLOYEE', 'SYSTEM') NOT NULL,
  created_by_contact_id INT NULL,
  created_by_employee_id INT NULL,
  actor_name VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_service_request_notes_request (request_id, visibility, created_at),
  CONSTRAINT fk_service_request_notes_request
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_service_request_notes_contact
    FOREIGN KEY (created_by_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_service_request_notes_employee
    FOREIGN KEY (created_by_employee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_service_request_notes_actor
    CHECK (
      (actor_type = 'CONTACT' AND created_by_contact_id IS NOT NULL AND created_by_employee_id IS NULL)
      OR (actor_type = 'EMPLOYEE' AND created_by_employee_id IS NOT NULL AND created_by_contact_id IS NULL)
      OR (actor_type = 'SYSTEM' AND created_by_contact_id IS NULL AND created_by_employee_id IS NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS service_request_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  old_status VARCHAR(50) NULL,
  new_status VARCHAR(50) NULL,
  old_value JSON NULL,
  new_value JSON NULL,
  metadata JSON NULL,
  actor_type ENUM('CONTACT', 'EMPLOYEE', 'SYSTEM') NOT NULL,
  actor_contact_id INT NULL,
  actor_employee_id INT NULL,
  actor_name VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_service_request_history_request (request_id, created_at, id),
  KEY idx_service_request_history_event (event_type, created_at),
  CONSTRAINT fk_service_request_history_request
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_service_request_history_contact
    FOREIGN KEY (actor_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_service_request_history_employee
    FOREIGN KEY (actor_employee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_service_request_history_actor
    CHECK (
      (actor_type = 'CONTACT' AND actor_contact_id IS NOT NULL AND actor_employee_id IS NULL)
      OR (actor_type = 'EMPLOYEE' AND actor_employee_id IS NOT NULL AND actor_contact_id IS NULL)
      OR (actor_type = 'SYSTEM' AND actor_contact_id IS NULL AND actor_employee_id IS NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
