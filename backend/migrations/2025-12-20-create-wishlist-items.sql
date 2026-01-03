-- Wishlist Items Table
-- Created: 2025-12-20
-- Purpose: Store wishlist items for authenticated users
-- Dependencies: Requires contacts, products, product_variants tables

CREATE TABLE IF NOT EXISTS wishlist_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  variant_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
FOREIGN KEY (user_id) REFERENCES contacts (id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
  UNIQUE KEY unique_wishlist_item (user_id, product_id, variant_id),
  INDEX idx_user_id (user_id),
  INDEX idx_product_id (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
