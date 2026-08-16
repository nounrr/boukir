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
