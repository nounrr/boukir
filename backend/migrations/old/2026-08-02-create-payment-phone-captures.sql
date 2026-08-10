CREATE TABLE IF NOT EXISTS payment_phone_captures (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  token_hash CHAR(64) NOT NULL,
  created_by INT NOT NULL,
  status ENUM('pending', 'uploaded', 'cancelled') NOT NULL DEFAULT 'pending',
  image_url VARCHAR(500) NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payment_phone_captures_token_hash (token_hash),
  KEY idx_payment_phone_captures_expiry (expires_at),
  KEY idx_payment_phone_captures_creator (created_by, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
