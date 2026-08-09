ALTER TABLE maalem_profiles
  ADD COLUMN origin ENUM('SELF_SERVICE', 'TEAM_CREATED') NOT NULL DEFAULT 'SELF_SERVICE' AFTER status,
  ADD COLUMN created_by_employee_id INT NULL AFTER reviewed_by,
  ADD KEY idx_maalem_profiles_origin (origin, created_at),
  ADD KEY idx_maalem_profiles_created_by_employee (created_by_employee_id),
  ADD CONSTRAINT fk_maalem_profiles_created_by_employee
    FOREIGN KEY (created_by_employee_id) REFERENCES employees(id)
    ON DELETE RESTRICT ON UPDATE CASCADE;
