ALTER TABLE employees ADD COLUMN bon_plafond_autorisations INT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE employees ADD COLUMN bon_client_bloque_autorisations INT UNSIGNED NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS employee_bon_authorization_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id INT NOT NULL,
  authorization_type VARCHAR(30) NOT NULL,
  action VARCHAR(20) NOT NULL,
  quantity INT NOT NULL,
  balance_after INT UNSIGNED NOT NULL,
  bon_type VARCHAR(30) NULL,
  bon_id INT NULL,
  client_id INT NULL,
  performed_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_bon_authorization_use (bon_type, bon_id, client_id, authorization_type, action),
  KEY idx_employee_bon_authorization_events_employee (employee_id, created_at),
  KEY idx_employee_bon_authorization_events_bon (bon_type, bon_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE employee_bon_authorization_events ADD COLUMN quota_client_id INT NULL;

CREATE TABLE IF NOT EXISTS employee_client_plafond_authorizations (
  employee_id INT NOT NULL,
  client_id INT NOT NULL,
  remaining INT UNSIGNED NOT NULL,
  PRIMARY KEY (employee_id, client_id),
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (client_id) REFERENCES contacts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
