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
