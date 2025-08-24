-- Migration: Add talon_id to caisse table
-- Date: 2025-08-23
-- Description: Add talon_id column to caisse table with foreign key relationship

ALTER TABLE payments 
ADD COLUMN talon_id INT NULL,
ADD CONSTRAINT fk_caisse_talon 
FOREIGN KEY (talon_id) REFERENCES talons(id) ON DELETE SET NULL;

-- Add index for better performance
CREATE INDEX idx_caisse_talon_id ON payments(talon_id);
