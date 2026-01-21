-- Add soft delete support for vehicules
ALTER TABLE vehicules
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL DEFAULT NULL;

-- Optional: speed up active vehicules queries
CREATE INDEX IF NOT EXISTS idx_vehicules_deleted_at ON vehicules (deleted_at);
