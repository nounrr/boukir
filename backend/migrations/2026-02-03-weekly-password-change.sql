-- Weekly password-change enforcement (employees only) - enforced on Monday
-- Date: 2026-02-03

-- EMPLOYEES
-- Idempotent migration: safe to run multiple times.
SET @db := DATABASE();

SET @has_password_changed_at := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'password_changed_at'
);
SET @has_required_week_start := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'password_change_required_week_start'
);
SET @has_last_login_at := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'last_login_at'
);

SET @sql := IF(
  @has_password_changed_at = 0,
  'ALTER TABLE employees ADD COLUMN password_changed_at DATETIME NULL AFTER password',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @has_required_week_start = 0,
  'ALTER TABLE employees ADD COLUMN password_change_required_week_start DATE NULL AFTER password_changed_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @has_last_login_at = 0,
  'ALTER TABLE employees ADD COLUMN last_login_at DATETIME NULL AFTER password_change_required_week_start',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- NOTE:
-- We intentionally do NOT backfill password_changed_at.
-- Keeping it NULL ensures the first Monday policy check will require a change.
