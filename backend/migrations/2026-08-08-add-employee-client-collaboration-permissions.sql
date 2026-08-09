SET @comments_permission_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'employees'
    AND COLUMN_NAME = 'acces_commentaires_clients'
);
SET @comments_permission_sql := IF(
  @comments_permission_exists = 0,
  'ALTER TABLE employees ADD COLUMN acces_commentaires_clients TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE comments_permission_stmt FROM @comments_permission_sql;
EXECUTE comments_permission_stmt;
DEALLOCATE PREPARE comments_permission_stmt;

SET @reminders_permission_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'employees'
    AND COLUMN_NAME = 'acces_rappels_clients'
);
SET @reminders_permission_sql := IF(
  @reminders_permission_exists = 0,
  'ALTER TABLE employees ADD COLUMN acces_rappels_clients TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE reminders_permission_stmt FROM @reminders_permission_sql;
EXECUTE reminders_permission_stmt;
DEALLOCATE PREPARE reminders_permission_stmt;

