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
