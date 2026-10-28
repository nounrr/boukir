-- The server startup initializes references for existing zero ceilings before accepting requests.
SET @sql = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts' AND COLUMN_NAME = 'plafond_echeance_reference'),
  'SELECT 1',
  'ALTER TABLE contacts ADD COLUMN plafond_echeance_reference DECIMAL(15,2) NULL DEFAULT NULL'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
