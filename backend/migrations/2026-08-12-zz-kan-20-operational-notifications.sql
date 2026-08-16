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
