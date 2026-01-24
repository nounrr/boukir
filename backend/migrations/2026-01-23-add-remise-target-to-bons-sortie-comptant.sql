-- Add remise target columns on bons_sortie & bons_comptant
-- Created: 2026-01-23
-- Goal: store the "remise beneficiary" on the bon header for Sortie/Comptant
-- Columns:
--   - remise_is_client: 1 => remise_id is the bon's client_id
--                      0 => remise_id references client_remises.id
--   - remise_id: INT NULL
--
-- Idempotent (guards for older MySQL versions).

/* ----------------------------- bons_sortie ----------------------------- */
SET @tbl_bons_sortie := (
  SELECT COUNT(1)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'bons_sortie'
);

SET @col_sortie_is_client := (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'bons_sortie'
    AND column_name = 'remise_is_client'
);

SET @sql_sortie_is_client := IF(
  @tbl_bons_sortie = 1 AND @col_sortie_is_client = 0,
  'ALTER TABLE bons_sortie ADD COLUMN remise_is_client TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT 1'
);

PREPARE stmt FROM @sql_sortie_is_client;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_sortie_remise_id := (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'bons_sortie'
    AND column_name = 'remise_id'
);

SET @sql_sortie_remise_id := IF(
  @tbl_bons_sortie = 1 AND @col_sortie_remise_id = 0,
  'ALTER TABLE bons_sortie ADD COLUMN remise_id INT NULL',
  'SELECT 1'
);

PREPARE stmt FROM @sql_sortie_remise_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

/* ---------------------------- bons_comptant ---------------------------- */
SET @tbl_bons_comptant := (
  SELECT COUNT(1)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'bons_comptant'
);

SET @col_comptant_is_client := (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'bons_comptant'
    AND column_name = 'remise_is_client'
);

SET @sql_comptant_is_client := IF(
  @tbl_bons_comptant = 1 AND @col_comptant_is_client = 0,
  'ALTER TABLE bons_comptant ADD COLUMN remise_is_client TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT 1'
);

PREPARE stmt FROM @sql_comptant_is_client;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_comptant_remise_id := (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'bons_comptant'
    AND column_name = 'remise_id'
);

SET @sql_comptant_remise_id := IF(
  @tbl_bons_comptant = 1 AND @col_comptant_remise_id = 0,
  'ALTER TABLE bons_comptant ADD COLUMN remise_id INT NULL',
  'SELECT 1'
);

PREPARE stmt FROM @sql_comptant_remise_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
