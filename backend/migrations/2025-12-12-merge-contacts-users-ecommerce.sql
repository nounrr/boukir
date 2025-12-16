-- Migration: Merge contacts and users tables for e-commerce
-- Date: 2025-12-12
-- Description: Add e-commerce authentication fields to contacts table to unify BO and e-commerce users
-- This maintains backward compatibility with the back-office system

-- Add authentication and profile fields to contacts table
ALTER TABLE contacts

-- Split name fields for better UX (keep nom_complet for BO compatibility)
ADD COLUMN prenom VARCHAR(100) NULL COMMENT 'Prénom (e-commerce)' AFTER nom_complet,
ADD COLUMN nom VARCHAR(100) NULL COMMENT 'Nom (e-commerce)' AFTER prenom,

-- Account type extension
ADD COLUMN type_compte ENUM('Client', 'Artisan/Promoteur', 'Fournisseur') NULL 
    COMMENT 'Type de compte e-commerce (NULL = BO contact only)' AFTER type,

-- Artisan/Promoteur approval workflow
ADD COLUMN demande_artisan BOOLEAN NOT NULL DEFAULT FALSE 
    COMMENT 'Demande en attente pour devenir Artisan/Promoteur' AFTER type_compte,
ADD COLUMN artisan_approuve BOOLEAN NOT NULL DEFAULT FALSE 
    COMMENT 'Demande Artisan/Promoteur approuvée par admin' AFTER demande_artisan,
ADD COLUMN artisan_approuve_par INT NULL 
    COMMENT 'ID employé qui a approuvé' AFTER artisan_approuve,
ADD COLUMN artisan_approuve_le DATETIME NULL 
    COMMENT 'Date approbation Artisan/Promoteur' AFTER artisan_approuve_par,
ADD COLUMN artisan_note_admin TEXT NULL 
    COMMENT 'Note admin concernant la demande Artisan' AFTER artisan_approuve_le,

-- Traditional Authentication
ADD COLUMN password VARCHAR(255) NULL 
    COMMENT 'Bcrypt hashed password - NULL for SSO-only or BO-only contacts' AFTER email,

-- SSO Authentication
ADD COLUMN auth_provider ENUM('local', 'google', 'facebook', 'none') NOT NULL DEFAULT 'none' 
    COMMENT 'Authentication method: none=BO only, local=email/password, google/facebook=SSO' AFTER password,
ADD COLUMN google_id VARCHAR(255) NULL UNIQUE 
    COMMENT 'Google OAuth ID' AFTER auth_provider,
ADD COLUMN facebook_id VARCHAR(255) NULL UNIQUE 
    COMMENT 'Facebook OAuth ID' AFTER google_id,
ADD COLUMN provider_access_token TEXT NULL 
    COMMENT 'OAuth provider access token' AFTER facebook_id,
ADD COLUMN provider_refresh_token TEXT NULL 
    COMMENT 'OAuth provider refresh token' AFTER provider_access_token,
ADD COLUMN provider_token_expires_at DATETIME NULL 
    COMMENT 'OAuth token expiration' AFTER provider_refresh_token,

-- Profile Information from SSO
ADD COLUMN avatar_url VARCHAR(500) NULL 
    COMMENT 'Profile picture URL' AFTER provider_token_expires_at,
ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE 
    COMMENT 'Email verification status' AFTER avatar_url,
ADD COLUMN locale VARCHAR(10) NULL DEFAULT 'fr' 
    COMMENT 'User preferred language' AFTER email_verified,

-- Account Status
ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE 
    COMMENT 'Account active status' AFTER locale,
ADD COLUMN is_blocked BOOLEAN NOT NULL DEFAULT FALSE 
    COMMENT 'Admin can block account' AFTER is_active,
ADD COLUMN source ENUM('backoffice', 'ecommerce') NOT NULL DEFAULT 'backoffice' COMMENT 'User creation source: backoffice or ecommerce' AFTER is_blocked,

-- Security
ADD COLUMN last_login_at DATETIME NULL 
    COMMENT 'Last successful login timestamp' AFTER is_blocked,
ADD COLUMN last_login_ip VARCHAR(45) NULL 
    COMMENT 'Last login IP address' AFTER last_login_at,
ADD COLUMN login_attempts INT NOT NULL DEFAULT 0 
    COMMENT 'Failed login attempts counter' AFTER last_login_ip,
ADD COLUMN locked_until DATETIME NULL 
    COMMENT 'Account lock expiration time' AFTER login_attempts,

-- Password Reset
ADD COLUMN reset_token VARCHAR(255) NULL 
    COMMENT 'Password reset token' AFTER locked_until,
ADD COLUMN reset_token_expires_at DATETIME NULL 
    COMMENT 'Reset token expiration' AFTER reset_token,

-- Soft Delete
ADD COLUMN deleted_at DATETIME NULL 
    COMMENT 'Soft delete timestamp' AFTER updated_at;

-- Add indexes for performance
ALTER TABLE contacts
ADD INDEX idx_prenom (prenom),
ADD INDEX idx_nom (nom),
ADD INDEX idx_email_auth (email, auth_provider),
ADD INDEX idx_google_id (google_id),
ADD INDEX idx_facebook_id (facebook_id),
ADD INDEX idx_auth_provider (auth_provider),
ADD INDEX idx_type_compte (type_compte),
ADD INDEX idx_demande_artisan (demande_artisan),
ADD INDEX idx_artisan_approuve (artisan_approuve),
ADD INDEX idx_is_active (is_active),
ADD INDEX idx_source (source),
ADD INDEX idx_deleted_at (deleted_at),
ADD INDEX idx_last_login (last_login_at);

-- Update table comment
ALTER TABLE contacts COMMENT = 'Unified contacts table: BO contacts + E-commerce users with SSO support';

-- Sync existing nom_complet to prenom/nom for existing contacts (best effort split)
UPDATE contacts 
SET 
    prenom = SUBSTRING_INDEX(nom_complet, ' ', 1),
    nom = CASE 
        WHEN LOCATE(' ', nom_complet) > 0 
        THEN SUBSTRING(nom_complet, LOCATE(' ', nom_complet) + 1) 
        ELSE nom_complet 
    ENDp
WHERE nom_complet IS NOT NULL 
    AND nom_complet != '' 
    AND prenom IS NULL;

-- Set type_compte based on existing type for BO contacts (optional, helps with reporting)
UPDATE contacts 
SET type_compte = CASE 
    WHEN type = 'Client' THEN 'Client'
    WHEN type = 'Fournisseur' THEN 'Fournisseur'
    ELSE NULL 
END
WHERE type_compte IS NULL AND type IN ('Client', 'Fournisseur');
