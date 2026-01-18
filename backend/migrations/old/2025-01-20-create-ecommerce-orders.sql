-- E-commerce Orders Table
-- Created: 2025-01-20
-- Purpose: Main orders table supporting both authenticated users and guest checkout

CREATE TABLE IF NOT EXISTS ecommerce_orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  order_number VARCHAR(50) UNIQUE NOT NULL,
  user_id INT DEFAULT NULL, -- NULL for guest orders
  
  -- Customer info (always filled, from user table or guest input)
  customer_email VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50) DEFAULT NULL,
  customer_name VARCHAR(255) NOT NULL,
  
  -- Shipping address
  shipping_address_line1 VARCHAR(255) NOT NULL,
  shipping_address_line2 VARCHAR(255) DEFAULT NULL,
  shipping_city VARCHAR(100) NOT NULL,
  shipping_state VARCHAR(100) DEFAULT NULL,
  shipping_postal_code VARCHAR(20) DEFAULT NULL,
  shipping_country VARCHAR(100) NOT NULL DEFAULT 'Morocco',
  
  -- Order totals
  subtotal DECIMAL(10, 2) NOT NULL,
  tax_amount DECIMAL(10, 2) DEFAULT 0.00,
  shipping_cost DECIMAL(10, 2) DEFAULT 0.00,
  discount_amount DECIMAL(10, 2) DEFAULT 0.00,
  total_amount DECIMAL(10, 2) NOT NULL,
  
  -- Order status
  status ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded') DEFAULT 'pending',
  payment_status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
  payment_method VARCHAR(50) DEFAULT NULL, -- 'cash_on_delivery', 'card', 'bank_transfer', etc.
  
  -- Notes
  customer_notes TEXT DEFAULT NULL,
  admin_notes TEXT DEFAULT NULL,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP DEFAULT NULL,
  shipped_at TIMESTAMP DEFAULT NULL,
  delivered_at TIMESTAMP DEFAULT NULL,
  cancelled_at TIMESTAMP DEFAULT NULL,
  
FOREIGN KEY (user_id) REFERENCES contacts (id) ON DELETE SET NULL,
  INDEX idx_order_number (order_number),
  INDEX idx_user_id (user_id),
  INDEX idx_customer_email (customer_email),
  INDEX idx_status (status),
  INDEX idx_payment_status (payment_status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
