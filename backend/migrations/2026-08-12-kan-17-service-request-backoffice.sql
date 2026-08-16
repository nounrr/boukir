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
