-- Add company profile + ICE to contacts (e-commerce registration)
-- Created: 2026-01-20

-- Add columns with guards (compatible with older MySQL versions)
SET @col_is_company := (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'contacts'
    AND column_name = 'is_company'
);

SET @sql_is_company := IF(
  @col_is_company = 0,
  'ALTER TABLE contacts ADD COLUMN is_company TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);

PREPARE stmt FROM @sql_is_company;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_ice := (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'contacts'
    AND column_name = 'ice'
);

SET @sql_ice := IF(
  @col_ice = 0,
  'ALTER TABLE contacts ADD COLUMN ice VARCHAR(15) DEFAULT NULL',
  'SELECT 1'
);

PREPARE stmt FROM @sql_ice;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Company name column already exists in most DBs as `societe`, ensure it exists.
SET @col_societe := (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'contacts'
    AND column_name = 'societe'
);

SET @sql_societe := IF(
  @col_societe = 0,
  'ALTER TABLE contacts ADD COLUMN societe VARCHAR(255) DEFAULT NULL',
  'SELECT 1'
);

PREPARE stmt FROM @sql_societe;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Normalise existing ICE data before adding UNIQUE index
-- 1) Turn empty strings into NULL
UPDATE contacts SET ice = NULL WHERE ice IS NOT NULL AND TRIM(ice) = '';

-- 2) Drop any values that are not exactly 15 digits
UPDATE contacts SET ice = NULL WHERE ice IS NOT NULL AND ice NOT REGEXP '^[0-9]{15}$';

-- Unique ICE (allows multiple NULLs). Guarded for idempotency.
SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'contacts'
    AND index_name = 'uniq_contacts_ice'
);

SET @create_idx_sql := IF(
  @idx_exists = 0,
  'CREATE UNIQUE INDEX uniq_contacts_ice ON contacts (ice)',
  'SELECT 1'
);

PREPARE stmt FROM @create_idx_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
