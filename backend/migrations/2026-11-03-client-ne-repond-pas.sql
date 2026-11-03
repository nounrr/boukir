SET @client_no_response_ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts' AND COLUMN_NAME = 'ne_repond_pas'),
  'SELECT 1',
  'ALTER TABLE contacts ADD COLUMN ne_repond_pas TINYINT(1) NOT NULL DEFAULT 0'
);
PREPARE client_no_response_stmt FROM @client_no_response_ddl;
EXECUTE client_no_response_stmt;
DEALLOCATE PREPARE client_no_response_stmt;
