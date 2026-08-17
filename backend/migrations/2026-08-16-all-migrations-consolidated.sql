-- ============================================================
-- Source: 2026-08-12-consolidated-maalem-services-contacts.sql
-- ============================================================

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
-- (enum origin complet, claient_submission_id, contrainte CHECK renforcée),
-- et les ALTER sont conditionnés pour les bases où les migrations
-- précédentes ont déjà été appliquées.

-- ---------------------------------------------------------------------------
-- 1. Commentaires clients
-- ---------------------------------------------------------------------------
use boukir;
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


-- ============================================================
-- Source: 2026-08-12-kan-17-service-request-backoffice.sql
-- ============================================================

-- KAN-17 - Qualification et traitement Back-office des demandes de service.

ALTER TABLE service_requests
  MODIFY COLUMN status ENUM(
    'new', 'to_contact', 'processing', 'waiting_customer', 'confirmed', 'cancelled'
  ) NOT NULL DEFAULT 'new',
  ADD COLUMN priority ENUM('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal' AFTER status,
  ADD COLUMN qualified_service_id INT UNSIGNED NULL AFTER qualified_category_id,
  ADD COLUMN qualified_description TEXT NULL AFTER problem_description,
  ADD COLUMN handled_by_employee_id INT NULL AFTER priority,
  ADD COLUMN confirmed_by_employee_id INT NULL AFTER handled_by_employee_id,
  ADD COLUMN confirmed_at DATETIME NULL AFTER confirmed_by_employee_id,
  ADD COLUMN cancelled_by_employee_id INT NULL AFTER confirmed_at,
  ADD COLUMN cancelled_at DATETIME NULL AFTER cancelled_by_employee_id,
  ADD COLUMN cancellation_reason VARCHAR(1000) NULL AFTER cancelled_at,
  ADD KEY idx_service_requests_backoffice (status, handled_by_employee_id, priority, created_at),
  ADD KEY idx_service_requests_qualified_service (qualified_service_id, status, deleted_at),
  ADD CONSTRAINT fk_service_requests_qualified_service
    FOREIGN KEY (qualified_service_id) REFERENCES services(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_service_requests_handler
    FOREIGN KEY (handled_by_employee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_service_requests_confirmer
    FOREIGN KEY (confirmed_by_employee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_service_requests_canceller
    FOREIGN KEY (cancelled_by_employee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- La qualification ne modifie jamais request_source. Une demande rapide peut donc
-- recevoir une catégorie et/ou un service qualifiés après sa création.
SET @kan17_source_check_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'service_requests'
    AND CONSTRAINT_NAME = 'chk_service_requests_source_fields'
);
SET @kan17_drop_source_check_sql := IF(
  @kan17_source_check_exists > 0,
  'ALTER TABLE service_requests DROP CHECK chk_service_requests_source_fields',
  'SELECT 1'
);
PREPARE kan17_drop_source_check_stmt FROM @kan17_drop_source_check_sql;
EXECUTE kan17_drop_source_check_stmt;
DEALLOCATE PREPARE kan17_drop_source_check_stmt;

ALTER TABLE service_requests
  ADD CONSTRAINT chk_service_requests_source_fields
    CHECK (
      (request_source = 'selected_maalem' AND requested_maalem_profile_id IS NOT NULL)
      OR (
        request_source = 'selected_service'
        AND service_id IS NOT NULL
        AND requested_maalem_profile_id IS NULL
        AND problem_description IS NOT NULL
        AND CHAR_LENGTH(TRIM(problem_description)) > 0
      )
      OR (
        request_source = 'quick_request'
        AND service_id IS NULL
        AND requested_maalem_profile_id IS NULL
        AND problem_description IS NOT NULL
        AND CHAR_LENGTH(TRIM(problem_description)) > 0
      )
    ),
  ADD CONSTRAINT chk_service_requests_resolution
    CHECK (
      (status = 'confirmed' AND confirmed_by_employee_id IS NOT NULL AND confirmed_at IS NOT NULL
        AND cancelled_by_employee_id IS NULL AND cancelled_at IS NULL AND cancellation_reason IS NULL)
      OR (status = 'cancelled' AND cancelled_by_employee_id IS NOT NULL AND cancelled_at IS NOT NULL
        AND cancellation_reason IS NOT NULL AND CHAR_LENGTH(TRIM(cancellation_reason)) > 0
        AND confirmed_by_employee_id IS NULL AND confirmed_at IS NULL)
      OR (status NOT IN ('confirmed', 'cancelled') AND confirmed_by_employee_id IS NULL
        AND confirmed_at IS NULL AND cancelled_by_employee_id IS NULL
        AND cancelled_at IS NULL AND cancellation_reason IS NULL)
    );

ALTER TABLE service_request_attachments
  DROP FOREIGN KEY fk_service_request_attachments_contact,
  ADD CONSTRAINT fk_service_request_attachments_contact
    FOREIGN KEY (uploaded_by_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD COLUMN uploaded_by_employee_id INT NULL AFTER uploaded_by_contact_id,
  ADD CONSTRAINT fk_service_request_attachments_employee
    FOREIGN KEY (uploaded_by_employee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT chk_service_request_attachments_actor
    CHECK (NOT (uploaded_by_contact_id IS NOT NULL AND uploaded_by_employee_id IS NOT NULL));

CREATE TABLE service_request_contacts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT UNSIGNED NOT NULL,
  channel ENUM('WHATSAPP', 'PHONE', 'OTHER') NOT NULL,
  contacted_at DATETIME NOT NULL,
  result VARCHAR(500) NOT NULL,
  internal_observation TEXT NULL,
  created_by_employee_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_service_request_contacts_request (request_id, contacted_at, id),
  CONSTRAINT fk_service_request_contacts_request
    FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_service_request_contacts_employee
    FOREIGN KEY (created_by_employee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ============================================================
-- Source: 2026-08-12-kan-18-service-request-assignments.sql
-- ============================================================

-- KAN-18 - Affectation et réaffectation historisées des Maalems.

CREATE TABLE service_request_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  service_request_id BIGINT UNSIGNED NOT NULL,
  maalem_profile_id INT UNSIGNED NOT NULL,
  assigned_by_employee_id INT NOT NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  assignment_reason VARCHAR(1000) NOT NULL,
  compatibility_override TINYINT(1) NOT NULL DEFAULT 0,
  compatibility_override_reason VARCHAR(1000) NULL,
  unassigned_at DATETIME NULL,
  unassigned_by_employee_id INT NULL,
  unassignment_reason VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  active_request_id BIGINT UNSIGNED
    GENERATED ALWAYS AS (
      CASE WHEN unassigned_at IS NULL THEN service_request_id ELSE NULL END
    ) STORED,
  UNIQUE KEY uq_service_request_assignments_current (active_request_id),
  KEY idx_service_request_assignments_history (service_request_id, assigned_at, id),
  KEY idx_service_request_assignments_maalem (maalem_profile_id, unassigned_at, assigned_at),
  CONSTRAINT fk_service_request_assignments_request
    FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_service_request_assignments_maalem
    FOREIGN KEY (maalem_profile_id) REFERENCES maalem_profiles(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_service_request_assignments_assigner
    FOREIGN KEY (assigned_by_employee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_service_request_assignments_unassigner
    FOREIGN KEY (unassigned_by_employee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_service_request_assignments_override
    CHECK (
      (compatibility_override = 0 AND compatibility_override_reason IS NULL)
      OR (compatibility_override = 1 AND compatibility_override_reason IS NOT NULL
        AND CHAR_LENGTH(TRIM(compatibility_override_reason)) > 0)
    ),
  CONSTRAINT chk_service_request_assignments_unassignment
    CHECK (
      (unassigned_at IS NULL AND unassigned_by_employee_id IS NULL AND unassignment_reason IS NULL)
      OR (unassigned_at IS NOT NULL AND unassigned_by_employee_id IS NOT NULL
        AND unassignment_reason IS NOT NULL AND CHAR_LENGTH(TRIM(unassignment_reason)) > 0)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE service_requests
  MODIFY COLUMN status ENUM(
    'new', 'to_contact', 'processing', 'waiting_customer', 'confirmed', 'assigned', 'cancelled'
  ) NOT NULL DEFAULT 'new',
  ADD COLUMN current_assignment_id BIGINT UNSIGNED NULL AFTER cancellation_reason,
  ADD UNIQUE KEY uq_service_requests_current_assignment (current_assignment_id),
  ADD CONSTRAINT fk_service_requests_current_assignment
    FOREIGN KEY (current_assignment_id) REFERENCES service_request_assignments(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Le statut assigned conserve les informations de confirmation KAN-17.
SET @kan18_resolution_check_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'service_requests'
    AND CONSTRAINT_NAME = 'chk_service_requests_resolution'
);
SET @kan18_drop_resolution_check_sql := IF(
  @kan18_resolution_check_exists > 0,
  'ALTER TABLE service_requests DROP CHECK chk_service_requests_resolution',
  'SELECT 1'
);
PREPARE kan18_drop_resolution_check_stmt FROM @kan18_drop_resolution_check_sql;
EXECUTE kan18_drop_resolution_check_stmt;
DEALLOCATE PREPARE kan18_drop_resolution_check_stmt;

ALTER TABLE service_requests
  ADD CONSTRAINT chk_service_requests_resolution
    CHECK (
      (status IN ('confirmed', 'assigned')
        AND confirmed_by_employee_id IS NOT NULL AND confirmed_at IS NOT NULL
        AND cancelled_by_employee_id IS NULL AND cancelled_at IS NULL AND cancellation_reason IS NULL)
      OR (status = 'cancelled'
        AND cancelled_by_employee_id IS NOT NULL AND cancelled_at IS NOT NULL
        AND cancellation_reason IS NOT NULL AND CHAR_LENGTH(TRIM(cancellation_reason)) > 0
        AND confirmed_by_employee_id IS NULL AND confirmed_at IS NULL)
      OR (status NOT IN ('confirmed', 'assigned', 'cancelled')
        AND confirmed_by_employee_id IS NULL AND confirmed_at IS NULL
        AND cancelled_by_employee_id IS NULL AND cancelled_at IS NULL AND cancellation_reason IS NULL)
    ),
  ADD CONSTRAINT chk_service_requests_current_assignment
    CHECK (
      (status = 'assigned' AND current_assignment_id IS NOT NULL)
      OR (status <> 'assigned' AND current_assignment_id IS NULL)
    );


-- ============================================================
-- Source: 2026-08-12-kan-19-service-interventions.sql
-- ============================================================

-- KAN-19 - Planification, exécution et clôture des interventions.

CREATE TABLE service_interventions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  service_request_id BIGINT UNSIGNED NOT NULL,
  status ENUM('assigned', 'scheduled', 'to_do', 'en_route', 'arrived', 'work_in_progress', 'completed', 'closed') NOT NULL DEFAULT 'assigned',
  planned_date DATE NULL,
  planned_time_slot VARCHAR(100) NULL,
  mission_address VARCHAR(500) NULL,
  mission_city VARCHAR(100) NULL,
  latitude DECIMAL(10, 7) NULL,
  longitude DECIMAL(10, 7) NULL,
  planned_service_id INT UNSIGNED NULL,
  planned_category_id INT UNSIGNED NULL,
  mission_contact_name VARCHAR(255) NULL,
  mission_contact_phone VARCHAR(50) NULL,
  shared_instructions TEXT NULL,
  special_information TEXT NULL,
  progress_percent TINYINT UNSIGNED NOT NULL DEFAULT 0,
  work_summary TEXT NULL,
  maalem_observations TEXT NULL,
  work_finished TINYINT(1) NULL,
  additional_intervention_required TINYINT(1) NULL,
  incomplete_reason TEXT NULL,
  scheduled_by_employee_id INT NULL,
  scheduled_at DATETIME NULL,
  en_route_at DATETIME NULL,
  en_route_by_contact_id INT NULL,
  arrived_at DATETIME NULL,
  arrived_by_contact_id INT NULL,
  started_at DATETIME NULL,
  started_by_contact_id INT NULL,
  completed_at DATETIME NULL,
  completed_by_contact_id INT NULL,
  closed_at DATETIME NULL,
  closed_by_employee_id INT NULL,
  closure_internal_note TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_service_interventions_request (service_request_id),
  KEY idx_service_interventions_status (status, planned_date, updated_at),
  KEY idx_service_interventions_schedule (planned_date, planned_time_slot),
  CONSTRAINT fk_service_interventions_request
    FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_service_interventions_service
    FOREIGN KEY (planned_service_id) REFERENCES services(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_service_interventions_category
    FOREIGN KEY (planned_category_id) REFERENCES maalem_categories(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_service_interventions_scheduler
    FOREIGN KEY (scheduled_by_employee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_service_interventions_en_route_actor
    FOREIGN KEY (en_route_by_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_service_interventions_arrived_actor
    FOREIGN KEY (arrived_by_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_service_interventions_started_actor
    FOREIGN KEY (started_by_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_service_interventions_completed_actor
    FOREIGN KEY (completed_by_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_service_interventions_closer
    FOREIGN KEY (closed_by_employee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_service_interventions_coordinates
    CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL)),
  CONSTRAINT chk_service_interventions_progress
    CHECK (progress_percent BETWEEN 0 AND 100),
  CONSTRAINT chk_service_interventions_completion
    CHECK (
      (status NOT IN ('completed', 'closed'))
      OR (completed_at IS NOT NULL AND completed_by_contact_id IS NOT NULL
        AND work_summary IS NOT NULL AND CHAR_LENGTH(TRIM(work_summary)) > 0
        AND work_finished IS NOT NULL AND additional_intervention_required IS NOT NULL)
    ),
  CONSTRAINT chk_service_interventions_closure
    CHECK (
      (status <> 'closed' AND closed_at IS NULL AND closed_by_employee_id IS NULL)
      OR (status = 'closed' AND closed_at IS NOT NULL AND closed_by_employee_id IS NOT NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE service_intervention_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  intervention_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(60) NOT NULL,
  old_status VARCHAR(40) NULL,
  new_status VARCHAR(40) NULL,
  old_value JSON NULL,
  new_value JSON NULL,
  metadata JSON NULL,
  actor_type ENUM('EMPLOYEE', 'MAALEM', 'SYSTEM') NOT NULL,
  actor_employee_id INT NULL,
  actor_contact_id INT NULL,
  actor_name VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_service_intervention_history (intervention_id, created_at, id),
  CONSTRAINT fk_service_intervention_history_intervention
    FOREIGN KEY (intervention_id) REFERENCES service_interventions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_service_intervention_history_employee
    FOREIGN KEY (actor_employee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_service_intervention_history_contact
    FOREIGN KEY (actor_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_service_intervention_history_actor
    CHECK (
      (actor_type = 'EMPLOYEE' AND actor_employee_id IS NOT NULL AND actor_contact_id IS NULL)
      OR (actor_type = 'MAALEM' AND actor_contact_id IS NOT NULL AND actor_employee_id IS NULL)
      OR (actor_type = 'SYSTEM' AND actor_employee_id IS NULL AND actor_contact_id IS NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE service_intervention_photos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  intervention_id BIGINT UNSIGNED NOT NULL,
  assignment_id BIGINT UNSIGNED NOT NULL,
  phase ENUM('BEFORE', 'DURING', 'AFTER') NOT NULL,
  storage_key VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  uploaded_by_contact_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_service_intervention_photos_storage (storage_key),
  KEY idx_service_intervention_photos (intervention_id, phase, deleted_at, created_at),
  CONSTRAINT fk_service_intervention_photos_intervention
    FOREIGN KEY (intervention_id) REFERENCES service_interventions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_service_intervention_photos_assignment
    FOREIGN KEY (assignment_id) REFERENCES service_request_assignments(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_service_intervention_photos_contact
    FOREIGN KEY (uploaded_by_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE service_requests
  MODIFY COLUMN status ENUM(
    'new', 'to_contact', 'processing', 'waiting_customer', 'confirmed', 'assigned',
    'scheduled', 'to_do', 'en_route', 'arrived', 'work_in_progress', 'completed', 'closed', 'cancelled'
  ) NOT NULL DEFAULT 'new';

SET @kan19_resolution_check_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'service_requests'
    AND CONSTRAINT_NAME = 'chk_service_requests_resolution'
);
SET @kan19_drop_resolution_sql := IF(@kan19_resolution_check_exists > 0,
  'ALTER TABLE service_requests DROP CHECK chk_service_requests_resolution', 'SELECT 1');
PREPARE kan19_drop_resolution_stmt FROM @kan19_drop_resolution_sql;
EXECUTE kan19_drop_resolution_stmt;
DEALLOCATE PREPARE kan19_drop_resolution_stmt;

SET @kan19_assignment_check_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'service_requests'
    AND CONSTRAINT_NAME = 'chk_service_requests_current_assignment'
);
SET @kan19_drop_assignment_sql := IF(@kan19_assignment_check_exists > 0,
  'ALTER TABLE service_requests DROP CHECK chk_service_requests_current_assignment', 'SELECT 1');
PREPARE kan19_drop_assignment_stmt FROM @kan19_drop_assignment_sql;
EXECUTE kan19_drop_assignment_stmt;
DEALLOCATE PREPARE kan19_drop_assignment_stmt;

ALTER TABLE service_requests
  ADD CONSTRAINT chk_service_requests_resolution CHECK (
    (status IN ('confirmed', 'assigned', 'scheduled', 'to_do', 'en_route', 'arrived', 'work_in_progress', 'completed', 'closed')
      AND confirmed_by_employee_id IS NOT NULL AND confirmed_at IS NOT NULL
      AND cancelled_by_employee_id IS NULL AND cancelled_at IS NULL AND cancellation_reason IS NULL)
    OR (status = 'cancelled' AND cancelled_by_employee_id IS NOT NULL AND cancelled_at IS NOT NULL
      AND cancellation_reason IS NOT NULL AND CHAR_LENGTH(TRIM(cancellation_reason)) > 0
      AND confirmed_by_employee_id IS NULL AND confirmed_at IS NULL)
    OR (status NOT IN ('confirmed', 'assigned', 'scheduled', 'to_do', 'en_route', 'arrived', 'work_in_progress', 'completed', 'closed', 'cancelled')
      AND confirmed_by_employee_id IS NULL AND confirmed_at IS NULL
      AND cancelled_by_employee_id IS NULL AND cancelled_at IS NULL AND cancellation_reason IS NULL)
  ),
  ADD CONSTRAINT chk_service_requests_current_assignment CHECK (
    (status IN ('assigned', 'scheduled', 'to_do', 'en_route', 'arrived', 'work_in_progress', 'completed', 'closed')
      AND current_assignment_id IS NOT NULL)
    OR (status NOT IN ('assigned', 'scheduled', 'to_do', 'en_route', 'arrived', 'work_in_progress', 'completed', 'closed')
      AND current_assignment_id IS NULL)
  );


-- ============================================================
-- Source: 2026-08-12-kan-22-maalem-statistics.sql
-- ============================================================

-- KAN-22 - Statistiques Maalem vérifiées depuis les interventions clôturées.
-- L'affectation exécutante est figée lors de la clôture. Les agrégats restent
-- calculés depuis les données transactionnelles et ne sont pas stockés.

ALTER TABLE service_interventions
  ADD COLUMN executing_assignment_id BIGINT UNSIGNED NULL AFTER service_request_id,
  ADD KEY idx_service_interventions_verified_stats
    (status, executing_assignment_id, closed_at),
  ADD CONSTRAINT fk_service_interventions_executing_assignment
    FOREIGN KEY (executing_assignment_id) REFERENCES service_request_assignments(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Reprise déterministe des clôtures KAN-19 existantes. À ce stade, KAN-19
-- conserve obligatoirement l'affectation courante sur la demande clôturée.
UPDATE service_interventions si
INNER JOIN service_requests sr ON sr.id = si.service_request_id
INNER JOIN service_request_assignments sra
  ON sra.id = sr.current_assignment_id
  AND sra.service_request_id = sr.id
SET si.executing_assignment_id = sra.id
WHERE si.status = 'closed'
  AND si.executing_assignment_id IS NULL;

ALTER TABLE service_interventions
  DROP CHECK chk_service_interventions_closure,
  ADD CONSTRAINT chk_service_interventions_closure
    CHECK (
      (status <> 'closed'
        AND closed_at IS NULL
        AND closed_by_employee_id IS NULL
        AND executing_assignment_id IS NULL)
      OR (status = 'closed'
        AND closed_at IS NOT NULL
        AND closed_by_employee_id IS NOT NULL
        AND executing_assignment_id IS NOT NULL)
    );


-- ============================================================
-- Source: 2026-08-12-kan-9-maalem-notifications.sql
-- ============================================================

-- KAN-9 - Notifications transactionnelles du workflow de candidature Maalem.

ALTER TABLE maalem_profiles
  ADD COLUMN internal_reason VARCHAR(500) NULL AFTER status_reason,
  ADD COLUMN public_reason VARCHAR(500) NULL AFTER internal_reason;

-- L'ancien motif était saisi par le Back-office : il reste strictement interne.
UPDATE maalem_profiles
SET internal_reason = status_reason
WHERE status_reason IS NOT NULL AND internal_reason IS NULL;

ALTER TABLE maalem_profile_history
  MODIFY COLUMN event_type ENUM(
    'STATUS_CHANGED', 'CATEGORY_CHANGED', 'INTERNAL_NOTE',
    'ACCOUNT_CREATED_BY_TEAM', 'INVITATION_REISSUED'
  ) NOT NULL;

CREATE TABLE maalem_notification_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  profile_id INT UNSIGNED NOT NULL,
  contact_id INT NOT NULL,
  source_history_id BIGINT UNSIGNED NULL,
  notification_type VARCHAR(80) NOT NULL,
  source_event VARCHAR(80) NOT NULL,
  channel ENUM('IN_APP', 'WHATSAPP') NOT NULL,
  locale ENUM('fr', 'ar') NOT NULL DEFAULT 'fr',
  recipient_address VARCHAR(255) NULL,
  template_key VARCHAR(100) NOT NULL,
  payload JSON NULL,
  idempotency_key VARCHAR(191) NOT NULL,
  status ENUM('pending', 'processing', 'sent', 'failed') NOT NULL DEFAULT 'pending',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  last_attempt_at DATETIME NULL,
  sent_at DATETIME NULL,
  read_at DATETIME NULL,
  last_error VARCHAR(500) NULL,
  provider_message_id VARCHAR(255) NULL,
  created_by_employee_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_maalem_notification_idempotency (idempotency_key),
  KEY idx_maalem_notifications_profile (profile_id, created_at, id),
  KEY idx_maalem_notifications_contact (contact_id, channel, created_at),
  KEY idx_maalem_notifications_retry (channel, status, attempts, updated_at),
  CONSTRAINT fk_maalem_notifications_profile
    FOREIGN KEY (profile_id) REFERENCES maalem_profiles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_maalem_notifications_contact
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_maalem_notifications_history
    FOREIGN KEY (source_history_id) REFERENCES maalem_profile_history(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_maalem_notifications_employee
    FOREIGN KEY (created_by_employee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_maalem_notification_delivery_state CHECK (
    (status IN ('pending', 'processing') AND sent_at IS NULL)
    OR (status = 'sent' AND sent_at IS NOT NULL AND last_error IS NULL)
    OR (status = 'failed' AND sent_at IS NULL AND last_error IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ============================================================
-- Source: 2026-08-12-zz-kan-20-operational-notifications.sql
-- ============================================================

-- KAN-20 - Extension de l'outbox KAN-9 aux demandes et interventions SRV.

ALTER TABLE service_requests
  ADD COLUMN cancellation_public_reason VARCHAR(1000) NULL AFTER cancellation_reason;

ALTER TABLE maalem_notification_deliveries
  DROP FOREIGN KEY fk_maalem_notifications_profile,
  DROP FOREIGN KEY fk_maalem_notifications_contact,
  MODIFY COLUMN profile_id INT UNSIGNED NULL,
  MODIFY COLUMN contact_id INT NULL,
  ADD COLUMN service_request_id BIGINT UNSIGNED NULL AFTER profile_id,
  ADD COLUMN intervention_id BIGINT UNSIGNED NULL AFTER service_request_id,
  ADD COLUMN recipient_type ENUM('CONTACT', 'EMPLOYEE', 'BACKOFFICE_TEAM') NOT NULL DEFAULT 'CONTACT' AFTER source_event,
  ADD COLUMN recipient_employee_id INT NULL AFTER contact_id,
  ADD COLUMN version_key VARCHAR(191) NULL AFTER idempotency_key,
  ADD KEY idx_notifications_service_request (service_request_id, created_at, id),
  ADD KEY idx_notifications_intervention (intervention_id, created_at, id),
  ADD KEY idx_notifications_employee (recipient_employee_id, channel, created_at),
  ADD CONSTRAINT fk_maalem_notifications_profile
    FOREIGN KEY (profile_id) REFERENCES maalem_profiles(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_maalem_notifications_contact
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_notifications_service_request
    FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_notifications_intervention
    FOREIGN KEY (intervention_id) REFERENCES service_interventions(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_notifications_recipient_employee
    FOREIGN KEY (recipient_employee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT chk_notifications_recipient CHECK (
    (recipient_type = 'CONTACT' AND contact_id IS NOT NULL AND recipient_employee_id IS NULL)
    OR (recipient_type = 'EMPLOYEE' AND contact_id IS NULL AND recipient_employee_id IS NOT NULL)
    OR (recipient_type = 'BACKOFFICE_TEAM' AND contact_id IS NULL AND recipient_employee_id IS NULL)
  ),
  ADD CONSTRAINT chk_notifications_context CHECK (
    profile_id IS NOT NULL OR service_request_id IS NOT NULL OR intervention_id IS NOT NULL
  );


-- ============================================================
-- Source: 2026-08-12-zzz-kan-21-service-request-dashboard.sql
-- ============================================================

-- KAN-21 - Index complémentaires du dashboard opérationnel.

ALTER TABLE service_requests
  ADD KEY idx_service_requests_city_created (city, deleted_at, created_at),
  ADD KEY idx_service_requests_assignment_status (current_assignment_id, status, deleted_at, created_at),
  ADD KEY idx_service_requests_created (deleted_at, created_at);

ALTER TABLE service_interventions
  ADD KEY idx_service_interventions_dashboard (planned_date, status, service_request_id);



-- ============================================================
-- Source: 2026-08-12-zzzz-kan-24-public-services.sql
-- ============================================================

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS is_published TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active;

UPDATE services s
SET s.is_published = 1
WHERE s.is_published = 0
  AND s.is_active = 1
  AND s.deleted_at IS NULL
  AND TRIM(s.nom) <> ''
  AND TRIM(s.nom_ar) <> ''
  AND (NULLIF(TRIM(s.description), '') IS NOT NULL OR NULLIF(TRIM(s.description_ar), '') IS NOT NULL)
  AND EXISTS (
    SELECT 1
    FROM service_maalem_categories smc
    INNER JOIN maalem_categories mc ON mc.id = smc.category_id
    WHERE smc.service_id = s.id
      AND mc.is_active = 1
      AND mc.deleted_at IS NULL
  );

ALTER TABLE services
  ADD INDEX idx_services_public_catalogue
    (is_active, is_published, deleted_at, nom, id);


-- ============================================================
-- Source: 2026-08-13-kan-26-public-maalems.sql
-- ============================================================

USE boukir;

SET @is_public_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'maalem_profiles' AND COLUMN_NAME = 'is_public');
SET @is_public_sql := IF(@is_public_exists = 0, 'ALTER TABLE maalem_profiles ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 0 AFTER status', 'SELECT 1');
PREPARE is_public_stmt FROM @is_public_sql; EXECUTE is_public_stmt; DEALLOCATE PREPARE is_public_stmt;

SET @publication_index_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'maalem_profiles' AND INDEX_NAME = 'idx_maalem_profiles_publication');
SET @publication_index_sql := IF(@publication_index_exists = 0, 'ALTER TABLE maalem_profiles ADD KEY idx_maalem_profiles_publication (is_public, status, deleted_at, category_id)', 'SELECT 1');
PREPARE publication_index_stmt FROM @publication_index_sql; EXECUTE publication_index_stmt; DEALLOCATE PREPARE publication_index_stmt;

SET @assignment_index_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_request_assignments' AND INDEX_NAME = 'idx_sra_maalem_request_id');
SET @assignment_index_sql := IF(@assignment_index_exists = 0, 'ALTER TABLE service_request_assignments ADD KEY idx_sra_maalem_request_id (maalem_profile_id, service_request_id, id)', 'SELECT 1');
PREPARE assignment_index_stmt FROM @assignment_index_sql; EXECUTE assignment_index_stmt; DEALLOCATE PREPARE assignment_index_stmt;


