
ALTER TABLE employees
  ADD COLUMN acces_avis_maalem TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN moderation_avis_maalem TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN restauration_avis_maalem TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN details_prives_avis_maalem TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE maalem_reviews
  ADD COLUMN moderation_reason_code VARCHAR(50) NULL AFTER moderation_reason,
  ADD COLUMN moderation_internal_note VARCHAR(1000) NULL AFTER moderation_reason_code,
  ADD COLUMN moderation_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER moderation_internal_note;

ALTER TABLE maalem_review_history
  ADD COLUMN reason_code VARCHAR(50) NULL AFTER reason,
  ADD COLUMN internal_note VARCHAR(1000) NULL AFTER reason_code,
  ADD COLUMN technical_metadata JSON NULL AFTER internal_note;

CREATE TABLE IF NOT EXISTS maalem_review_cases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  review_id BIGINT UNSIGNED NOT NULL,
  case_type ENUM('maalem_report', 'customer_appeal', 'internal_dispute') NOT NULL,
  status ENUM('open', 'under_review', 'resolved', 'dismissed') NOT NULL DEFAULT 'open',
  opened_by_type ENUM('CONTACT', 'EMPLOYEE', 'SYSTEM') NOT NULL,
  opened_by_contact_id INT NULL,
  opened_by_employee_id INT NULL,
  assigned_to_employee_id INT NULL,
  reason_code VARCHAR(50) NULL,
  description VARCHAR(1500) NULL,
  resolution_note VARCHAR(1500) NULL,
  opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  KEY idx_maalem_review_cases_review (review_id, status, deleted_at),
  KEY idx_maalem_review_cases_assignee (assigned_to_employee_id, status, deleted_at),
  CONSTRAINT fk_maalem_review_cases_review
    FOREIGN KEY (review_id) REFERENCES maalem_reviews(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_maalem_review_cases_contact
    FOREIGN KEY (opened_by_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_maalem_review_cases_employee
    FOREIGN KEY (opened_by_employee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_maalem_review_cases_assignee
    FOREIGN KEY (assigned_to_employee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_maalem_review_cases_actor CHECK (
    (opened_by_type = 'CONTACT' AND opened_by_contact_id IS NOT NULL AND opened_by_employee_id IS NULL)
    OR (opened_by_type = 'EMPLOYEE' AND opened_by_contact_id IS NULL AND opened_by_employee_id IS NOT NULL)
    OR (opened_by_type = 'SYSTEM' AND opened_by_contact_id IS NULL AND opened_by_employee_id IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
