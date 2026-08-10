-- Migration consolidée (2026-08-08 -> 2026-08-12)
-- Regroupe :
--   2026-08-08-create-contact-comments.sql
--   2026-08-08-add-contact-reminders.sql
--   2026-08-08-add-employee-client-collaboration-permissions.sql
--   2026-08-08-create-maalem-categories.sql
--   2026-08-08-create-maalem-profiles.sql
--   2026-08-08-maalem-profile-documents.sql
--   2026-08-09-add-maalem-team-creation-audit.sql
--   2026-08-09-create-maalem-profile-history.sql
--   2026-08-09-create-services.sql
--   2026-08-10-create-service-requests.sql
--   2026-08-11-add-service-request-submission-id.sql
--   2026-08-12-strengthen-selected-service-requests.sql
--
-- Idempotente : les CREATE TABLE contiennent déjà l'état final du schéma
-- (enum origin complet, client_submission_id, contrainte CHECK renforcée),
-- et les ALTER sont conditionnés pour les bases où les migrations
-- précédentes ont déjà été appliquées.

-- ---------------------------------------------------------------------------
-- 1. Commentaires clients
-- ---------------------------------------------------------------------------
use boukir3;
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

-- ---------------------------------------------------------------------------
-- 2. Rappels sur les contacts
-- ---------------------------------------------------------------------------

SET @rappel_date_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts' AND COLUMN_NAME = 'rappel_date'
);
SET @rappel_date_sql := IF(@rappel_date_exists = 0, 'ALTER TABLE contacts ADD COLUMN rappel_date DATE NULL', 'SELECT 1');
PREPARE rappel_date_stmt FROM @rappel_date_sql;
EXECUTE rappel_date_stmt;
DEALLOCATE PREPARE rappel_date_stmt;

SET @rappel_jours_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts' AND COLUMN_NAME = 'rappel_jours_initial'
);
SET @rappel_jours_sql := IF(@rappel_jours_exists = 0, 'ALTER TABLE contacts ADD COLUMN rappel_jours_initial INT NULL', 'SELECT 1');
PREPARE rappel_jours_stmt FROM @rappel_jours_sql;
EXECUTE rappel_jours_stmt;
DEALLOCATE PREPARE rappel_jours_stmt;

SET @rappel_defini_le_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts' AND COLUMN_NAME = 'rappel_defini_le'
);
SET @rappel_defini_le_sql := IF(@rappel_defini_le_exists = 0, 'ALTER TABLE contacts ADD COLUMN rappel_defini_le DATETIME NULL', 'SELECT 1');
PREPARE rappel_defini_le_stmt FROM @rappel_defini_le_sql;
EXECUTE rappel_defini_le_stmt;
DEALLOCATE PREPARE rappel_defini_le_stmt;

SET @rappel_defini_par_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts' AND COLUMN_NAME = 'rappel_defini_par'
);
SET @rappel_defini_par_sql := IF(@rappel_defini_par_exists = 0, 'ALTER TABLE contacts ADD COLUMN rappel_defini_par INT NULL', 'SELECT 1');
PREPARE rappel_defini_par_stmt FROM @rappel_defini_par_sql;
EXECUTE rappel_defini_par_stmt;
DEALLOCATE PREPARE rappel_defini_par_stmt;

SET @rappel_date_index_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts' AND INDEX_NAME = 'idx_contacts_rappel_date'
);
SET @rappel_date_index_sql := IF(@rappel_date_index_exists = 0, 'ALTER TABLE contacts ADD KEY idx_contacts_rappel_date (rappel_date)', 'SELECT 1');
PREPARE rappel_date_index_stmt FROM @rappel_date_index_sql;
EXECUTE rappel_date_index_stmt;
DEALLOCATE PREPARE rappel_date_index_stmt;

-- ---------------------------------------------------------------------------
-- 3. Permissions employés (collaboration clients)
-- ---------------------------------------------------------------------------

SET @comments_permission_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'employees'
    AND COLUMN_NAME = 'acces_commentaires_clients'
);
SET @comments_permission_sql := IF(
  @comments_permission_exists = 0,
  'ALTER TABLE employees ADD COLUMN acces_commentaires_clients TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE comments_permission_stmt FROM @comments_permission_sql;
EXECUTE comments_permission_stmt;
DEALLOCATE PREPARE comments_permission_stmt;

SET @reminders_permission_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'employees'
    AND COLUMN_NAME = 'acces_rappels_clients'
);
SET @reminders_permission_sql := IF(
  @reminders_permission_exists = 0,
  'ALTER TABLE employees ADD COLUMN acces_rappels_clients TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE reminders_permission_stmt FROM @reminders_permission_sql;
EXECUTE reminders_permission_stmt;
DEALLOCATE PREPARE reminders_permission_stmt;

-- ---------------------------------------------------------------------------
-- 4. Catégories maalem
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 5. Profils maalem (état final : origin complet + audit création équipe)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS maalem_profiles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  contact_id INT NOT NULL,
  category_id INT UNSIGNED NULL,
  status ENUM('draft', 'submitted', 'under_review', 'approved', 'rejected', 'suspended') NOT NULL DEFAULT 'draft',
  origin ENUM('SELF_SERVICE', 'NEW_REGISTRATION', 'ARTISAN_CONVERSION', 'TEAM_CREATED') NOT NULL DEFAULT 'SELF_SERVICE',
  professional_data JSON NULL,
  status_reason VARCHAR(500) NULL,
  submitted_at DATETIME NULL,
  reviewed_at DATETIME NULL,
  reviewed_by INT NULL,
  created_by_employee_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_maalem_profiles_contact (contact_id),
  KEY idx_maalem_profiles_status (status, deleted_at),
  KEY idx_maalem_profiles_category (category_id, status, deleted_at),
  KEY idx_maalem_profiles_origin (origin, created_at),
  KEY idx_maalem_profiles_created_by_employee (created_by_employee_id),
  CONSTRAINT fk_maalem_profiles_contact
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_maalem_profiles_category
    FOREIGN KEY (category_id) REFERENCES maalem_categories(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_maalem_profiles_created_by_employee
    FOREIGN KEY (created_by_employee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Rattrapage si la table existait déjà sans les colonnes d'audit.
SET @origin_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'maalem_profiles' AND COLUMN_NAME = 'origin'
);
SET @origin_sql := IF(
  @origin_exists = 0,
  'ALTER TABLE maalem_profiles ADD COLUMN origin ENUM(''SELF_SERVICE'', ''NEW_REGISTRATION'', ''ARTISAN_CONVERSION'', ''TEAM_CREATED'') NOT NULL DEFAULT ''SELF_SERVICE'' AFTER status, ADD KEY idx_maalem_profiles_origin (origin, created_at)',
  'ALTER TABLE maalem_profiles MODIFY COLUMN origin ENUM(''SELF_SERVICE'', ''NEW_REGISTRATION'', ''ARTISAN_CONVERSION'', ''TEAM_CREATED'') NOT NULL DEFAULT ''SELF_SERVICE'''
);
PREPARE origin_stmt FROM @origin_sql;
EXECUTE origin_stmt;
DEALLOCATE PREPARE origin_stmt;

SET @created_by_employee_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'maalem_profiles' AND COLUMN_NAME = 'created_by_employee_id'
);
SET @created_by_employee_sql := IF(
  @created_by_employee_exists = 0,
  'ALTER TABLE maalem_profiles ADD COLUMN created_by_employee_id INT NULL AFTER reviewed_by, ADD KEY idx_maalem_profiles_created_by_employee (created_by_employee_id), ADD CONSTRAINT fk_maalem_profiles_created_by_employee FOREIGN KEY (created_by_employee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE created_by_employee_stmt FROM @created_by_employee_sql;
EXECUTE created_by_employee_stmt;
DEALLOCATE PREPARE created_by_employee_stmt;

-- ---------------------------------------------------------------------------
-- 6. Documents des profils maalem
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 7. Journal des profils maalem
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 8. Services et liaison avec les catégories maalem
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 9. Demandes de service (état final : submission_id + CHECK renforcé)
-- ---------------------------------------------------------------------------

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
  client_submission_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_service_requests_number (request_number),
  UNIQUE KEY uq_service_requests_requester_submission (requester_contact_id, client_submission_id),
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
      OR (
        request_source = 'selected_service'
        AND service_id IS NOT NULL
        AND requested_maalem_profile_id IS NULL
        AND qualified_category_id IS NULL
        AND problem_description IS NOT NULL
        AND CHAR_LENGTH(TRIM(problem_description)) > 0
      )
      OR (
        request_source = 'quick_request'
        AND service_id IS NULL
        AND requested_maalem_profile_id IS NULL
        AND qualified_category_id IS NULL
        AND problem_description IS NOT NULL
        AND CHAR_LENGTH(TRIM(problem_description)) > 0
      )
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Rattrapage si la table existait déjà sans client_submission_id.
SET @submission_id_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_requests' AND COLUMN_NAME = 'client_submission_id'
);
SET @submission_id_sql := IF(
  @submission_id_exists = 0,
  'ALTER TABLE service_requests ADD COLUMN client_submission_id VARCHAR(64) NULL AFTER request_channel, ADD UNIQUE KEY uq_service_requests_requester_submission (requester_contact_id, client_submission_id)',
  'SELECT 1'
);
PREPARE submission_id_stmt FROM @submission_id_sql;
EXECUTE submission_id_stmt;
DEALLOCATE PREPARE submission_id_stmt;

-- Rattrapage de la contrainte CHECK renforcée sur une base existante.
SET @source_check_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'service_requests'
    AND CONSTRAINT_NAME = 'chk_service_requests_source_fields'
);
SET @drop_source_check_sql := IF(
  @source_check_exists > 0,
  'ALTER TABLE service_requests DROP CHECK chk_service_requests_source_fields',
  'SELECT 1'
);
PREPARE drop_source_check_stmt FROM @drop_source_check_sql;
EXECUTE drop_source_check_stmt;
DEALLOCATE PREPARE drop_source_check_stmt;

ALTER TABLE service_requests
  ADD CONSTRAINT chk_service_requests_source_fields
    CHECK (
      (request_source = 'selected_maalem' AND requested_maalem_profile_id IS NOT NULL)
      OR (
        request_source = 'selected_service'
        AND service_id IS NOT NULL
        AND requested_maalem_profile_id IS NULL
        AND qualified_category_id IS NULL
        AND problem_description IS NOT NULL
        AND CHAR_LENGTH(TRIM(problem_description)) > 0
      )
      OR (
        request_source = 'quick_request'
        AND service_id IS NULL
        AND requested_maalem_profile_id IS NULL
        AND qualified_category_id IS NULL
        AND problem_description IS NOT NULL
        AND CHAR_LENGTH(TRIM(problem_description)) > 0
      )
    );

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
