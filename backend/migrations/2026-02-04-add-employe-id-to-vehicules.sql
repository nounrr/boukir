-- Add chauffeur/employee link to vehicules
-- Requested: only add the column (existing tables already created)

-- Some MySQL/MariaDB versions do not support ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
-- Use information_schema + dynamic SQL to keep this migration idempotent.

SET @vehicules_col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'vehicules'
    AND COLUMN_NAME = 'employe_id'
);

SET @vehicules_add_col_sql := IF(
  @vehicules_col_exists = 0,
  'ALTER TABLE vehicules ADD COLUMN employe_id INT NULL',
  'SELECT 1'
);

PREPARE stmt FROM @vehicules_add_col_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @vehicules_idx_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'vehicules'
    AND INDEX_NAME = 'idx_vehicules_employe_id'
);

SET @vehicules_add_idx_sql := IF(
  @vehicules_idx_exists = 0,
  'CREATE INDEX idx_vehicules_employe_id ON vehicules (employe_id)',
  'SELECT 1'
);

PREPARE stmt2 FROM @vehicules_add_idx_sql;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;


SET @role_has_chef := (
  SELECT IFNULL(
    MAX(CASE WHEN LOCATE('\'ChefChauffeur\'', COLUMN_TYPE) > 0 THEN 1 ELSE 0 END),
    0
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'employees'
    AND COLUMN_NAME = 'role'
);

SET @add_role_sql := IF(
  @role_has_chef = 0,
  "ALTER TABLE employees MODIFY COLUMN role ENUM('PDG','Employé','Manager','ManagerPlus','Chauffeur','ChefChauffeur') DEFAULT 'Employé'",
  'SELECT 1'
);

PREPARE stmt FROM @add_role_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;