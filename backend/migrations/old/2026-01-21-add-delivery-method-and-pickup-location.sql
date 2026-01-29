-- Add delivery_method + pickup_location_id to ecommerce_orders
-- Create a minimal pickup locations table and seed a single default pickup location.

-- 1) Create pickup locations table (minimal, future-proof)
CREATE TABLE IF NOT EXISTS ecommerce_pickup_locations (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  address_line1 VARCHAR(255) NULL,
  address_line2 VARCHAR(255) NULL,
  city VARCHAR(100) NOT NULL DEFAULT 'Casablanca',
  state VARCHAR(100) NULL,
  postal_code VARCHAR(20) NULL,
  country VARCHAR(100) NOT NULL DEFAULT 'Morocco',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Seed ONE default pickup location if table is empty
INSERT INTO ecommerce_pickup_locations (name, address_line1, city, country)
SELECT 'Boukir Boutique', 'Boukir Boutique', 'Casablanca', 'Morocco'
WHERE NOT EXISTS (SELECT 1 FROM ecommerce_pickup_locations LIMIT 1);

-- 3) Add delivery_method to ecommerce_orders if missing
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ecommerce_orders'
    AND COLUMN_NAME = 'delivery_method'
);

SET @ddl := IF(
  @col_exists = 0,
  "ALTER TABLE ecommerce_orders ADD COLUMN delivery_method ENUM('delivery','pickup') NOT NULL DEFAULT 'delivery' AFTER payment_method",
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4) Add pickup_location_id to ecommerce_orders if missing
SET @col_exists2 := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ecommerce_orders'
    AND COLUMN_NAME = 'pickup_location_id'
);

SET @ddl2 := IF(
  @col_exists2 = 0,
  'ALTER TABLE ecommerce_orders ADD COLUMN pickup_location_id INT NULL AFTER delivery_method',
  'SELECT 1'
);

PREPARE stmt2 FROM @ddl2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 5) Add index for queue filtering (pickup orders)
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ecommerce_orders'
    AND INDEX_NAME = 'idx_delivery_method'
);

SET @ddl3 := IF(
  @idx_exists = 0,
  'CREATE INDEX idx_delivery_method ON ecommerce_orders (delivery_method)',
  'SELECT 1'
);

PREPARE stmt3 FROM @ddl3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

