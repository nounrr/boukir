USE boukir3;

SET @is_public_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'maalem_profiles' AND COLUMN_NAME = 'is_public');
SET @is_public_sql := IF(@is_public_exists = 0, 'ALTER TABLE maalem_profiles ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 0 AFTER status', 'SELECT 1');
PREPARE is_public_stmt FROM @is_public_sql; EXECUTE is_public_stmt; DEALLOCATE PREPARE is_public_stmt;

SET @publication_index_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'maalem_profiles' AND INDEX_NAME = 'idx_maalem_profiles_publication');
SET @publication_index_sql := IF(@publication_index_exists = 0, 'ALTER TABLE maalem_profiles ADD KEY idx_maalem_profiles_publication (is_public, status, deleted_at, category_id)', 'SELECT 1');
PREPARE publication_index_stmt FROM @publication_index_sql; EXECUTE publication_index_stmt; DEALLOCATE PREPARE publication_index_stmt;

SET @assignment_index_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_request_assignments' AND INDEX_NAME = 'idx_sra_maalem_request_id');
SET @assignment_index_sql := IF(@assignment_index_exists = 0, 'ALTER TABLE service_request_assignments ADD KEY idx_sra_maalem_request_id (maalem_profile_id, service_request_id, id)', 'SELECT 1');
PREPARE assignment_index_stmt FROM @assignment_index_sql; EXECUTE assignment_index_stmt; DEALLOCATE PREPARE assignment_index_stmt;
