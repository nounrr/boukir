-- Create promo codes table for e-commerce
CREATE TABLE IF NOT EXISTS ecommerce_promo_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  type ENUM('percentage','fixed') NOT NULL DEFAULT 'percentage',
  value DECIMAL(10,2) NOT NULL,
  max_discount_amount DECIMAL(10,2) NULL,
  min_order_amount DECIMAL(10,2) NULL,
  max_redemptions INT NULL,
  redeemed_count INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  start_date DATETIME NULL,
  end_date DATETIME NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL
);

-- Indexes for lookups
-- MySQL does not support IF NOT EXISTS for CREATE INDEX; rely on runner to skip duplicates
CREATE INDEX idx_ecommerce_promo_active ON ecommerce_promo_codes(active);
CREATE INDEX idx_ecommerce_promo_dates ON ecommerce_promo_codes(start_date, end_date);
