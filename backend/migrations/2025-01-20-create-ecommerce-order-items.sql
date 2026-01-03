-- E-commerce Order Items Table
-- Created: 2025-01-20
-- Purpose: Store individual items in each order with price snapshots
-- Dependencies: Requires ecommerce_orders table to exist first

CREATE TABLE IF NOT EXISTS ecommerce_order_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  variant_id INT DEFAULT NULL,
  unit_id INT DEFAULT NULL,
  
  -- Product snapshot (preserve info even if product changes/deleted)
  product_name VARCHAR(255) NOT NULL,
  product_name_ar VARCHAR(255) DEFAULT NULL,
  variant_name VARCHAR(100) DEFAULT NULL,
  variant_type VARCHAR(50) DEFAULT NULL,
  unit_name VARCHAR(50) DEFAULT NULL,
  
  -- Pricing snapshot
  unit_price DECIMAL(10, 2) NOT NULL, -- Price at time of order
  quantity INT NOT NULL,
  subtotal DECIMAL(10, 2) NOT NULL,
  
  -- Discounts applied
  discount_percentage DECIMAL(5, 2) DEFAULT 0.00,
  discount_amount DECIMAL(10, 2) DEFAULT 0.00,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (order_id) REFERENCES ecommerce_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL,
  FOREIGN KEY (unit_id) REFERENCES product_units(id) ON DELETE SET NULL,
  INDEX idx_order_id (order_id),
  INDEX idx_product_id (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
