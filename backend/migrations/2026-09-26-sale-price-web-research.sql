CREATE TABLE IF NOT EXISTS sale_price_web_research (
  entity_key VARCHAR(64) NOT NULL PRIMARY KEY,
  product_id INT NOT NULL,
  variant_id INT NULL,
  model VARCHAR(64) NOT NULL,
  market_json JSON NOT NULL,
  ingco_json JSON NOT NULL,
  offers_count INT NOT NULL DEFAULT 0,
  error_text VARCHAR(500) NULL,
  searched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sale_price_web_research_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
