-- One-time codes sent by e-mail or SMS: confirming a new account, confirming an address, resetting a password.
-- The server also creates these on first use (utils/otpStore.js).

CREATE TABLE IF NOT EXISTS contact_verification_codes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_id VARCHAR(40) NOT NULL,
  purpose ENUM('register','verify','reset') NOT NULL,
  channel ENUM('email','phone') NOT NULL,
  target VARCHAR(255) NOT NULL,
  contact_id INT NULL,
  code_hash CHAR(64) NOT NULL,
  payload JSON NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  ip VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cvc_request (request_id),
  KEY idx_cvc_target (target, created_at),
  KEY idx_cvc_ip (ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @has_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts' AND COLUMN_NAME = 'phone_verified');
SET @ddl := IF(@has_col = 0, 'ALTER TABLE contacts ADD COLUMN phone_verified TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
