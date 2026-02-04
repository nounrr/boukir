-- Add new employee role: ChefChauffeur
-- employees.role is an ENUM in this DB; extend it idempotently.

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
