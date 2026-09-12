CREATE TABLE IF NOT EXISTS delivery_access (
  employee_id INT NOT NULL PRIMARY KEY,
  granted_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS delivery_runs (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  chauffeur_id INT NOT NULL,
  vehicule_id INT NOT NULL,
  chauffeur_nom VARCHAR(255) NOT NULL,
  vehicule_nom VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME NULL,
  notes TEXT NULL,
  created_by INT NOT NULL,
  completed_by INT NULL,
  INDEX idx_delivery_date (started_at),
  INDEX idx_delivery_driver (chauffeur_id, status),
  INDEX idx_delivery_vehicle (vehicule_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS delivery_queue (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  bon_type VARCHAR(50) NOT NULL,
  bon_id INT NOT NULL,
  numero VARCHAR(100) NOT NULL,
  contact_nom VARCHAR(255) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting',
  queued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  queued_by INT NOT NULL,
  run_id INT NULL,
  UNIQUE KEY uq_delivery_bon (bon_type, bon_id),
  INDEX idx_delivery_queue_status (status, queued_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS delivery_run_items (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  run_id INT NOT NULL,
  queue_id INT NOT NULL,
  outcome VARCHAR(20) NULL,
  failure_reason VARCHAR(500) NULL,
  UNIQUE KEY uq_delivery_run_item (run_id, queue_id),
  FOREIGN KEY (run_id) REFERENCES delivery_runs(id),
  FOREIGN KEY (queue_id) REFERENCES delivery_queue(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
