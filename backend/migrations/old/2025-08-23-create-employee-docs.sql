-- Create document types and employee documents tables
CREATE TABLE  document_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE  employe_doc (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employe_id INT NOT NULL,
  type_doc_id INT NULL,
  path VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_employe (employe_id),
  INDEX idx_type (type_doc_id),
  CONSTRAINT fk_employe_doc_employee FOREIGN KEY (employe_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_employe_doc_type FOREIGN KEY (type_doc_id) REFERENCES document_types(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
