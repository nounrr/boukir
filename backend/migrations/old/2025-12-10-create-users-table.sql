-- Migration: Create users table for e-commerce authentication
-- Date: 2025-12-10
-- Description: Table for managing e-commerce users with traditional and SSO authentication

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    
    -- Basic Information
    prenom VARCHAR(100) NOT NULL,
    nom VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    telephone VARCHAR(50) NULL,
    
    -- Account Type
    type_compte ENUM('Client', 'Artisan/Promoteur') NOT NULL DEFAULT 'Client',
    
    -- Traditional Authentication
    password VARCHAR(255) NULL COMMENT 'Bcrypt hashed password - NULL for SSO-only accounts',
    
    -- SSO Authentication
    auth_provider ENUM('local', 'google', 'facebook') NOT NULL DEFAULT 'local' COMMENT 'Authentication method used',
    google_id VARCHAR(255) NULL UNIQUE COMMENT 'Google OAuth ID',
    facebook_id VARCHAR(255) NULL UNIQUE COMMENT 'Facebook OAuth ID',
    provider_access_token TEXT NULL COMMENT 'OAuth provider access token',
    provider_refresh_token TEXT NULL COMMENT 'OAuth provider refresh token',
    provider_token_expires_at DATETIME NULL COMMENT 'OAuth token expiration',
    
    -- Profile Information from SSO
    avatar_url VARCHAR(500) NULL COMMENT 'Profile picture URL',
    email_verified BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Email verification status',
    locale VARCHAR(10) NULL DEFAULT 'fr' COMMENT 'User preferred language',
    
    -- Account Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Account active status',
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Admin can block account',
    
    -- Security
    last_login_at DATETIME NULL COMMENT 'Last successful login timestamp',
    last_login_ip VARCHAR(45) NULL COMMENT 'Last login IP address',
    login_attempts INT NOT NULL DEFAULT 0 COMMENT 'Failed login attempts counter',
    locked_until DATETIME NULL COMMENT 'Account lock expiration time',
    
    -- Password Reset
    reset_token VARCHAR(255) NULL COMMENT 'Password reset token',
    reset_token_expires_at DATETIME NULL COMMENT 'Reset token expiration',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL COMMENT 'Soft delete timestamp',
    
    -- Indexes for performance
    INDEX idx_email (email),
    INDEX idx_google_id (google_id),
    INDEX idx_facebook_id (facebook_id),
    INDEX idx_auth_provider (auth_provider),
    INDEX idx_type_compte (type_compte),
    INDEX idx_is_active (is_active),
    INDEX idx_deleted_at (deleted_at),
    INDEX idx_last_login (last_login_at)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add some example users for testing (optional - can be removed)
-- Password for test users is 'password123' (will be hashed by backend)
INSERT INTO users (prenom, nom, email, telephone, type_compte, auth_provider, email_verified, is_active) VALUES
('Test', 'Client', 'client@test.com', '0612345678', 'Client', 'local', TRUE, TRUE),
('Test', 'Artisan', 'artisan@test.com', '0687654321', 'Artisan/Promoteur', 'local', TRUE, TRUE);

-- Add comment to table
ALTER TABLE users COMMENT = 'E-commerce users with support for traditional and SSO authentication';
