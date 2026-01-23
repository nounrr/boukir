-- E-commerce Order Status History Table
-- Created: 2025-01-20
-- Purpose: Audit trail for all order status changes
-- Dependencies: Requires ecommerce_orders table to exist first

CREATE TABLE IF NOT EXISTS ecommerce_order_status_history (
  id INT PRIMARY KEY AUTO_INCREMENT,
  order_id INT NOT NULL,
  old_status VARCHAR(50) DEFAULT NULL,
  new_status VARCHAR(50) NOT NULL,
  changed_by INT DEFAULT NULL, -- employee_id or user_id
  changed_by_type ENUM('admin', 'customer', 'system') DEFAULT 'system',
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (order_id) REFERENCES ecommerce_orders(id) ON DELETE CASCADE,
  INDEX idx_order_id (order_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
