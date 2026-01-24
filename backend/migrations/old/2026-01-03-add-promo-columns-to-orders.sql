-- Add promo-related columns to ecommerce_orders
ALTER TABLE ecommerce_orders
  ADD COLUMN promo_code VARCHAR(64) NULL AFTER discount_amount,
  ADD COLUMN promo_discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER promo_code;

-- Optional index for promo_code lookups
-- MySQL does not support IF NOT EXISTS for CREATE INDEX; rely on runner to skip duplicates
CREATE INDEX idx_ecommerce_orders_promo_code ON ecommerce_orders(promo_code);
