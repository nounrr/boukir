SET @delivery_run_driver_is_strict := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'delivery_runs'
    AND COLUMN_NAME IN ('chauffeur_id', 'chauffeur_nom')
    AND IS_NULLABLE = 'NO'
);
SET @delivery_run_optional_driver_sql := IF(
  @delivery_run_driver_is_strict > 0,
  'ALTER TABLE delivery_runs MODIFY COLUMN chauffeur_id INT NULL, MODIFY COLUMN chauffeur_nom VARCHAR(255) NULL',
  'SELECT 1'
);
PREPARE delivery_run_optional_driver_stmt FROM @delivery_run_optional_driver_sql;
EXECUTE delivery_run_optional_driver_stmt;
DEALLOCATE PREPARE delivery_run_optional_driver_stmt;
