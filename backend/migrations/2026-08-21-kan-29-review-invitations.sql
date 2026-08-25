
CREATE TABLE IF NOT EXISTS maalem_review_invitations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  public_key CHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  service_request_id BIGINT UNSIGNED NOT NULL,
  intervention_id BIGINT UNSIGNED NOT NULL,
  customer_contact_id INT NOT NULL,
  maalem_profile_id INT UNSIGNED NOT NULL,
  review_id BIGINT UNSIGNED NULL,
  status ENUM('scheduled', 'sent', 'failed', 'suspended', 'expired', 'review_received') NOT NULL DEFAULT 'scheduled',
  scheduled_at DATETIME NOT NULL,
  next_attempt_at DATETIME NULL,
  expires_at DATETIME NOT NULL,
  first_sent_at DATETIME NULL,
  last_sent_at DATETIME NULL,
  next_reminder_at DATETIME NULL,
  reminder_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  max_reminders TINYINT UNSIGNED NOT NULL DEFAULT 1,
  processing_attempts INT UNSIGNED NOT NULL DEFAULT 0,
  opened_at DATETIME NULL,
  submitted_at DATETIME NULL,
  last_error VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_review_invitations_public_key (public_key),
  UNIQUE KEY uq_review_invitations_request (service_request_id),
  UNIQUE KEY uq_review_invitations_intervention (intervention_id),
  KEY idx_review_invitations_due (status, next_attempt_at, expires_at),
  KEY idx_review_invitations_customer (customer_contact_id, created_at),
  KEY idx_review_invitations_maalem (maalem_profile_id, created_at),
  CONSTRAINT fk_review_invitations_request
    FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_review_invitations_intervention
    FOREIGN KEY (intervention_id) REFERENCES service_interventions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_review_invitations_customer
    FOREIGN KEY (customer_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_review_invitations_maalem
    FOREIGN KEY (maalem_profile_id) REFERENCES maalem_profiles(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_review_invitations_review
    FOREIGN KEY (review_id) REFERENCES maalem_reviews(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_review_invitations_dates CHECK (expires_at > scheduled_at),
  CONSTRAINT chk_review_invitations_reminders CHECK (reminder_count <= max_reminders)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
