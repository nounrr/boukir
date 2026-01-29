-- Fake data for ecommerce_orders + related tables
-- الهدف: إنشاء أوامر e-commerce وهمية (orders + items + status history)
-- Safe-ish: tries to reuse existing contacts/products to satisfy FKs.
--
-- How to run (example):
--   mysql -h localhost -P 3307 -u root -p boukir < sql.sql/ecommerce_fake_orders.sql

START TRANSACTION;

-- 0) Ensure pickup locations exists (used by pickup orders)
CREATE TABLE IF NOT EXISTS ecommerce_pickup_locations (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  address_line1 VARCHAR(255) NULL,
  address_line2 VARCHAR(255) NULL,
  city VARCHAR(100) NOT NULL DEFAULT 'Casablanca'
  state VARCHAR(100) NULL,
  postal_code VARCHAR(20) NULL,
  country VARCHAR(100) NOT NULL DEFAULT 'Morocco',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO ecommerce_pickup_locations (name, address_line1, city, country)
SELECT 'Boukir Boutique', 'Boukir Boutique', 'Casablanca', 'Morocco'
WHERE NOT EXISTS (SELECT 1 FROM ecommerce_pickup_locations LIMIT 1);

-- 1) Pick an existing contact + product to satisfy foreign keys.
-- If you want specific ones, replace these SET lines with your IDs.
SET @client_id := (SELECT id FROM contacts ORDER BY id ASC LIMIT 1);
SET @product_id := (SELECT id FROM products ORDER BY id ASC LIMIT 1);
SET @pickup_id := (SELECT id FROM ecommerce_pickup_locations WHERE is_active = 1 ORDER BY id ASC LIMIT 1);

-- Guardrails: stop early if missing prerequisites
-- (MySQL doesn't have THROW; this will cause a division-by-zero if missing)
SELECT IF(@client_id IS NULL, 1/0, 1) AS must_have_contact;
SELECT IF(@product_id IS NULL, 1/0, 1) AS must_have_product;

-- 2) Insert Order #1 (Delivery + COD)
SET @order1_number := CONCAT('ORD-FAKE-', UPPER(SUBSTRING(REPLACE(UUID(), '-', ''), 1, 10)));

INSERT INTO ecommerce_orders (
  order_number,
  user_id,
  customer_email,
  customer_phone,
  customer_name,
  shipping_address_line1,
  shipping_address_line2,
  shipping_city,
  shipping_state,
  shipping_postal_code,
  shipping_country,
  subtotal,
  tax_amount,
  shipping_cost,
  discount_amount,
  promo_code,
  promo_discount_amount,
  total_amount,
  remise_used_amount,
  status,
  payment_status,
  payment_method,
  delivery_method,
  pickup_location_id,
  customer_notes,
  created_at,
  confirmed_at,
  shipped_at,
  delivered_at,
  cancelled_at,
  admin_notes
) VALUES (
  @order1_number,
  @client_id,
  'fake.customer+1@example.com',
  '+212600000001',
  'Fake Customer 1',
  'Rue Test 1',
  NULL,
  'Tanger',
  NULL,
  NULL,
  'Morocco',
  1000.00,
  0.00,
  0.00,
  0.00,
  NULL,
  0.00,
  1000.00,
  0.00,
  'pending',
  'pending',
  'cash_on_delivery',
  'delivery',
  NULL,
  'Commande test (COD)',
  NOW(),
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
);

SET @order1_id := LAST_INSERT_ID();

-- Items for Order #1 (2 lines)
INSERT INTO ecommerce_order_items (
  order_id,
  product_id,
  variant_id,
  unit_id,
  product_name,
  product_name_ar,
  variant_name,
  variant_type,
  unit_name,
  unit_price,
  quantity,
  subtotal,
  discount_percentage,
  discount_amount,
  remise_percent_applied,
  remise_amount
) VALUES
(
  @order1_id,
  @product_id,
  NULL,
  NULL,
  'Produit Test A',
  NULL,
  NULL,
  NULL,
  NULL,
  500.00,
  1,
  500.00,
  0.00,
  0.00,
  0.00,
  0.00
),
(
  @order1_id,
  @product_id,
  NULL,
  NULL,
  'Produit Test B',
  NULL,
  NULL,
  NULL,
  NULL,
  250.00,
  2,
  500.00,
  0.00,
  0.00,
  0.00,
  0.00
);

INSERT INTO ecommerce_order_status_history (order_id, old_status, new_status, changed_by_type, notes)
VALUES
(@order1_id, NULL, 'pending', 'customer', 'Fake order created');

-- 3) Insert Order #2 (Pickup + Solde + Remise used)
SET @order2_number := CONCAT('ORD-FAKE-', UPPER(SUBSTRING(REPLACE(UUID(), '-', ''), 1, 10)));

INSERT INTO ecommerce_orders (
  order_number,
  user_id,
  customer_email,
  customer_phone,
  customer_name,
  shipping_address_line1,
  shipping_address_line2,
  shipping_city,
  shipping_state,
  shipping_postal_code,
  shipping_country,
  subtotal,
  tax_amount,
  shipping_cost,
  discount_amount,
  promo_code,
  promo_discount_amount,
  total_amount,
  remise_used_amount,
  status,
  payment_status,
  payment_method,
  delivery_method,
  pickup_location_id,
  customer_notes,
  created_at,
  confirmed_at,
  shipped_at,
  delivered_at,
  cancelled_at,
  admin_notes
) VALUES (
  @order2_number,
  @client_id,
  'fake.customer+2@example.com',
  '+212600000002',
  'Fake Customer 2',
  'Boukir Boutique',
  NULL,
  'Casablanca',
  NULL,
  NULL,
  'Morocco',
  600.00,
  0.00,
  0.00,
  0.00,
  'WELCOME10',
  0.00,
  600.00,
  50.00,
  'confirmed',
  'paid',
  'solde',
  'pickup',
  @pickup_id,
  'Commande test (solde + pickup + remise)',
  NOW(),
  NOW(),
  NULL,
  NULL,
  NULL,
  'Confirmed by admin (fake)'
);

SET @order2_id := LAST_INSERT_ID();

INSERT INTO ecommerce_order_items (
  order_id,
  product_id,
  variant_id,
  unit_id,
  product_name,
  product_name_ar,
  variant_name,
  variant_type,
  unit_name,
  unit_price,
  quantity,
  subtotal,
  discount_percentage,
  discount_amount,
  remise_percent_applied,
  remise_amount
) VALUES
(
  @order2_id,
  @product_id,
  NULL,
  NULL,
  'Produit Test C',
  NULL,
  NULL,
  NULL,
  NULL,
  300.00,
  2,
  600.00,
  0.00,
  0.00,
  0.00,
  0.00
);

INSERT INTO ecommerce_order_status_history (order_id, old_status, new_status, changed_by_type, notes)
VALUES
(@order2_id, NULL, 'pending', 'customer', 'Fake order created'),
(@order2_id, 'pending', 'confirmed', 'admin', 'Fake confirm');

COMMIT;

-- Optional: quick check
-- SELECT id, order_number, status, payment_status, payment_method, total_amount, remise_used_amount, delivery_method
-- FROM ecommerce_orders
-- WHERE order_number IN (@order1_number, @order2_number);

-- Optional cleanup (uncomment to delete the fake orders)
-- START TRANSACTION;
-- DELETE FROM ecommerce_orders WHERE order_number IN (@order1_number, @order2_number);
-- COMMIT;
