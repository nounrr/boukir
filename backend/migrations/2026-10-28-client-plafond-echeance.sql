SET @client_echeance_ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts' AND COLUMN_NAME = 'plafond_echeance'),
  'SELECT 1',
  'ALTER TABLE contacts ADD COLUMN plafond_echeance DECIMAL(15,2) NULL DEFAULT NULL'
);
PREPARE client_echeance_stmt FROM @client_echeance_ddl;
EXECUTE client_echeance_stmt;
DEALLOCATE PREPARE client_echeance_stmt;
