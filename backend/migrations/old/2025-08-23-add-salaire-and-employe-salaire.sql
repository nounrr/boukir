-- Add nullable salaire column to employees
ALTER TABLE employees
  ADD COLUMN salaire DECIMAL(10,2) NULL AFTER role;

-- Create employe_salaire table to track salary payments/additions
CREATE TABLE  employe_salaire (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employe_id INT NOT NULL,
  montant DECIMAL(10,2) NOT NULL,
  note VARCHAR(255) NULL,
  created_by INT NULL,
  updated_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_employe_salaire_employee FOREIGN KEY (employe_id) REFERENCES employees(id) ON DELETE CASCADE,
  INDEX idx_employe_salaire_emp_month (employe_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
