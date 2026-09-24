-- One visibility right covers purchase price, cost price and derived margins.
SET @internal_price_column_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'employees'
    AND COLUMN_NAME = 'acces_prix_internes'
);
SET @internal_price_column_sql = IF(
  @internal_price_column_exists = 0,
  'ALTER TABLE employees ADD COLUMN acces_prix_internes TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE internal_price_column_stmt FROM @internal_price_column_sql;
EXECUTE internal_price_column_stmt;
DEALLOCATE PREPARE internal_price_column_stmt;

-- Match the former role-based access for existing employees only.
SET @internal_price_backfill_sql = IF(
  @internal_price_column_exists = 0,
  'UPDATE employees SET acces_prix_internes = 1 WHERE role NOT IN (''Employé'', ''PDG'') AND deleted_at IS NULL',
  'SELECT 1'
);
PREPARE internal_price_backfill_stmt FROM @internal_price_backfill_sql;
EXECUTE internal_price_backfill_stmt;
DEALLOCATE PREPARE internal_price_backfill_stmt;
