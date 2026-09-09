-- Targeted repair for installations missing the service publication flag.
-- The single-migration runner skips ER_DUP_FIELDNAME if the column exists.
-- Preserve existing flags; do not automatically publish legacy services.
ALTER TABLE services
  ADD COLUMN is_published TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active;
