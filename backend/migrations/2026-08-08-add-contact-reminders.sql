SET @rappel_date_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts' AND COLUMN_NAME = 'rappel_date'
);
SET @rappel_date_sql := IF(@rappel_date_exists = 0, 'ALTER TABLE contacts ADD COLUMN rappel_date DATE NULL', 'SELECT 1');
PREPARE rappel_date_stmt FROM @rappel_date_sql;
EXECUTE rappel_date_stmt;
DEALLOCATE PREPARE rappel_date_stmt;

SET @rappel_jours_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts' AND COLUMN_NAME = 'rappel_jours_initial'
);
SET @rappel_jours_sql := IF(@rappel_jours_exists = 0, 'ALTER TABLE contacts ADD COLUMN rappel_jours_initial INT NULL', 'SELECT 1');
PREPARE rappel_jours_stmt FROM @rappel_jours_sql;
EXECUTE rappel_jours_stmt;
DEALLOCATE PREPARE rappel_jours_stmt;

SET @rappel_defini_le_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts' AND COLUMN_NAME = 'rappel_defini_le'
);
SET @rappel_defini_le_sql := IF(@rappel_defini_le_exists = 0, 'ALTER TABLE contacts ADD COLUMN rappel_defini_le DATETIME NULL', 'SELECT 1');
PREPARE rappel_defini_le_stmt FROM @rappel_defini_le_sql;
EXECUTE rappel_defini_le_stmt;
DEALLOCATE PREPARE rappel_defini_le_stmt;

SET @rappel_defini_par_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts' AND COLUMN_NAME = 'rappel_defini_par'
);
SET @rappel_defini_par_sql := IF(@rappel_defini_par_exists = 0, 'ALTER TABLE contacts ADD COLUMN rappel_defini_par INT NULL', 'SELECT 1');
PREPARE rappel_defini_par_stmt FROM @rappel_defini_par_sql;
EXECUTE rappel_defini_par_stmt;
DEALLOCATE PREPARE rappel_defini_par_stmt;

SET @rappel_date_index_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts' AND INDEX_NAME = 'idx_contacts_rappel_date'
);
SET @rappel_date_index_sql := IF(@rappel_date_index_exists = 0, 'ALTER TABLE contacts ADD KEY idx_contacts_rappel_date (rappel_date)', 'SELECT 1');
PREPARE rappel_date_index_stmt FROM @rappel_date_index_sql;
EXECUTE rappel_date_index_stmt;
DEALLOCATE PREPARE rappel_date_index_stmt;
