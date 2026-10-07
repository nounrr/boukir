CREATE TABLE IF NOT EXISTS category_product_order (
  category_id INT NOT NULL,
  product_id INT NOT NULL,
  position INT UNSIGNED NOT NULL,
  PRIMARY KEY (category_id, product_id),
  INDEX idx_category_position (category_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
