CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
  setting_value LONGTEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO app_settings (setting_key, setting_value)
SELECT 'slow_moving_stock', '{"lookbackMonths":4,"salesThreshold":3}'
WHERE NOT EXISTS (
  SELECT 1 FROM app_settings WHERE setting_key = 'slow_moving_stock'
);

ALTER TABLE products ADD COLUMN reference_2 VARCHAR(255) DEFAULT NULL;

ALTER TABLE bons_sortie
  ADD INDEX idx_slow_stock_status_date (statut, date_creation);

ALTER TABLE bons_comptant
  ADD INDEX idx_slow_stock_status_date (statut, date_creation);

ALTER TABLE ecommerce_orders
  ADD INDEX idx_slow_stock_status_delivered (status, delivered_at);
