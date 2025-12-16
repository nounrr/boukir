-- Migration: Add source column to contacts table
-- Date: 2025-12-16
-- Description: Track user creation source (backoffice or ecommerce)

ALTER TABLE contacts
ADD COLUMN source ENUM('backoffice', 'ecommerce') NOT NULL DEFAULT 'backoffice'
    COMMENT 'User creation source: backoffice or ecommerce' AFTER is_blocked;

-- Add index for source column
ALTER TABLE contacts
ADD INDEX idx_source (source);

-- Update existing users: set ecommerce source for users with auth_provider
UPDATE contacts
SET source = 'ecommerce'
WHERE auth_provider IN ('local', 'google', 'facebook')
  AND auth_provider != 'none';
