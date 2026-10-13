-- NULL conserve les accès historiques de ManagerPlus ; 0 révoque explicitement le droit.
SET @employee_page_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'acces_page_employes') = 0,
  'ALTER TABLE employees ADD COLUMN acces_page_employes TINYINT(1) NULL DEFAULT NULL',
  'SELECT 1'
);
PREPARE employee_page_stmt FROM @employee_page_sql;
EXECUTE employee_page_stmt;
DEALLOCATE PREPARE employee_page_stmt;

SET @employee_page_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'acces_documents_employes') = 0,
  'ALTER TABLE employees ADD COLUMN acces_documents_employes TINYINT(1) NULL DEFAULT NULL',
  'SELECT 1'
);
PREPARE employee_page_stmt FROM @employee_page_sql;
EXECUTE employee_page_stmt;
DEALLOCATE PREPARE employee_page_stmt;

SET @employee_page_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'acces_salaires_employes') = 0,
  'ALTER TABLE employees ADD COLUMN acces_salaires_employes TINYINT(1) NULL DEFAULT NULL',
  'SELECT 1'
);
PREPARE employee_page_stmt FROM @employee_page_sql;
EXECUTE employee_page_stmt;
DEALLOCATE PREPARE employee_page_stmt;

SET @employee_page_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'acces_details_salaires_employes') = 0,
  'ALTER TABLE employees ADD COLUMN acces_details_salaires_employes TINYINT(1) NULL DEFAULT NULL',
  'SELECT 1'
);
PREPARE employee_page_stmt FROM @employee_page_sql;
EXECUTE employee_page_stmt;
DEALLOCATE PREPARE employee_page_stmt;

SET @employee_page_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'acces_archives_employes') = 0,
  'ALTER TABLE employees ADD COLUMN acces_archives_employes TINYINT(1) NULL DEFAULT NULL',
  'SELECT 1'
);
PREPARE employee_page_stmt FROM @employee_page_sql;
EXECUTE employee_page_stmt;
DEALLOCATE PREPARE employee_page_stmt;

