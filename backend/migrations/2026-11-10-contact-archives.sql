ALTER TABLE contacts ADD COLUMN archived_at DATETIME NULL;
ALTER TABLE contacts ADD COLUMN archive_reason VARCHAR(20) NULL;
ALTER TABLE contacts ADD COLUMN archive_reactivated_at DATETIME NULL;
