

CREATE TABLE IF NOT EXISTS maalem_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  service_request_id BIGINT UNSIGNED NOT NULL,
  intervention_id BIGINT UNSIGNED NOT NULL,
  customer_contact_id INT NOT NULL,
  maalem_profile_id INT UNSIGNED NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comment VARCHAR(1500) NULL,
  status ENUM('pending', 'published', 'hidden', 'rejected') NOT NULL DEFAULT 'published',
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  moderated_at DATETIME NULL,
  moderated_by INT NULL,
  moderation_reason VARCHAR(500) NULL,
  hidden_at DATETIME NULL,
  hidden_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_maalem_reviews_service_request (service_request_id),
  UNIQUE KEY uq_maalem_reviews_intervention (intervention_id),
  KEY idx_maalem_reviews_public_stats (maalem_profile_id, status, hidden_at, deleted_at, rating),
  KEY idx_maalem_reviews_customer (customer_contact_id, created_at),
  CONSTRAINT fk_maalem_reviews_request
    FOREIGN KEY (service_request_id) REFERENCES service_requests(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_maalem_reviews_intervention
    FOREIGN KEY (intervention_id) REFERENCES service_interventions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_maalem_reviews_customer
    FOREIGN KEY (customer_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_maalem_reviews_maalem
    FOREIGN KEY (maalem_profile_id) REFERENCES maalem_profiles(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_maalem_reviews_moderator
    FOREIGN KEY (moderated_by) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_maalem_reviews_hider
    FOREIGN KEY (hidden_by) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_maalem_reviews_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS maalem_review_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  review_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  old_rating TINYINT UNSIGNED NULL,
  new_rating TINYINT UNSIGNED NULL,
  old_comment VARCHAR(1500) NULL,
  new_comment VARCHAR(1500) NULL,
  old_status ENUM('pending', 'published', 'hidden', 'rejected') NULL,
  new_status ENUM('pending', 'published', 'hidden', 'rejected') NULL,
  reason VARCHAR(500) NULL,
  actor_type ENUM('CONTACT', 'EMPLOYEE', 'SYSTEM') NOT NULL,
  actor_contact_id INT NULL,
  actor_employee_id INT NULL,
  actor_name VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_maalem_review_history_review (review_id, created_at, id),
  CONSTRAINT fk_maalem_review_history_review
    FOREIGN KEY (review_id) REFERENCES maalem_reviews(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_maalem_review_history_contact
    FOREIGN KEY (actor_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_maalem_review_history_employee
    FOREIGN KEY (actor_employee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_maalem_review_history_old_rating CHECK (old_rating IS NULL OR old_rating BETWEEN 1 AND 5),
  CONSTRAINT chk_maalem_review_history_new_rating CHECK (new_rating IS NULL OR new_rating BETWEEN 1 AND 5),
  CONSTRAINT chk_maalem_review_history_actor CHECK (
    (actor_type = 'CONTACT' AND actor_contact_id IS NOT NULL AND actor_employee_id IS NULL)
    OR (actor_type = 'EMPLOYEE' AND actor_contact_id IS NULL AND actor_employee_id IS NOT NULL)
    OR (actor_type = 'SYSTEM' AND actor_contact_id IS NULL AND actor_employee_id IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
