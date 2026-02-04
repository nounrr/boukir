-- Seed: E-commerce test orders (SOLDE + is_solde=1 + default item remises)
-- الهدف: إنشاء أوامر e-commerce للتجربة (pending وباقي statuses) مع remises افتراضية داخل items.
--
-- How to run (example):
--   mysql -h localhost -P 3306 -u root -p boukir < sql.sql/ecommerce_test_solde_remise.sql

START TRANSACTION;

-- 1) Pick an existing contact + product to satisfy foreign keys.
-- If you want specific ones, replace these SET lines with your IDs.
SET @client_id := (SELECT id FROM contacts WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 1);
SET @product_id := (SELECT id FROM products ORDER BY id ASC LIMIT 1);

-- Guardrails: stop early if missing prerequisites
-- (MySQL doesn't have THROW; this will cause a division-by-zero if missing)
SELECT IF(@client_id IS NULL, 1/0, 1) AS must_have_contact;
SELECT IF(@product_id IS NULL, 1/0, 1) AS must_have_product;

-- 2) Ensure required columns exist (safe, idempotent)
-- ecommerce_orders: is_solde, solde_amount, remise_earned_amount, remise_used_amount, promo columns (some schemas may already have them)
SET @db := DATABASE();

SET @has_is_solde := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'ecommerce_orders' AND COLUMN_NAME = 'is_solde'
);
SET @has_solde_amount := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'ecommerce_orders' AND COLUMN_NAME = 'solde_amount'
);
SET @has_remise_earned_amount := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'ecommerce_orders' AND COLUMN_NAME = 'remise_earned_amount'
);
SET @has_remise_used_amount := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'ecommerce_orders' AND COLUMN_NAME = 'remise_used_amount'
);
SET @has_promo_code := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'ecommerce_orders' AND COLUMN_NAME = 'promo_code'
);
SET @has_promo_discount_amount := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'ecommerce_orders' AND COLUMN_NAME = 'promo_discount_amount'
);
SET @has_delivery_method := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'ecommerce_orders' AND COLUMN_NAME = 'delivery_method'
);
SET @has_pickup_location_id := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'ecommerce_orders' AND COLUMN_NAME = 'pickup_location_id'
);

SET @sql := IF(@has_is_solde = 0, 'ALTER TABLE ecommerce_orders ADD COLUMN is_solde TINYINT(1) NOT NULL DEFAULT 0 AFTER payment_method', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(@has_solde_amount = 0, 'ALTER TABLE ecommerce_orders ADD COLUMN solde_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER is_solde', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(@has_remise_earned_amount = 0, 'ALTER TABLE ecommerce_orders ADD COLUMN remise_earned_amount DECIMAL(10,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(@has_remise_used_amount = 0, 'ALTER TABLE ecommerce_orders ADD COLUMN remise_used_amount DECIMAL(10,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(@has_promo_code = 0, 'ALTER TABLE ecommerce_orders ADD COLUMN promo_code VARCHAR(50) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(@has_promo_discount_amount = 0, 'ALTER TABLE ecommerce_orders ADD COLUMN promo_discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(@has_delivery_method = 0, "ALTER TABLE ecommerce_orders ADD COLUMN delivery_method ENUM('delivery','pickup') NOT NULL DEFAULT 'delivery'", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(@has_pickup_location_id = 0, 'ALTER TABLE ecommerce_orders ADD COLUMN pickup_location_id INT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ecommerce_order_items: remise_percent_applied, remise_amount
SET @has_item_remise_percent := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'ecommerce_order_items' AND COLUMN_NAME = 'remise_percent_applied'
);
SET @has_item_remise_amount := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'ecommerce_order_items' AND COLUMN_NAME = 'remise_amount'
);

SET @sql := IF(@has_item_remise_percent = 0, 'ALTER TABLE ecommerce_order_items ADD COLUMN remise_percent_applied DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER discount_amount', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(@has_item_remise_amount = 0, 'ALTER TABLE ecommerce_order_items ADD COLUMN remise_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER remise_percent_applied', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) Default remise settings for the test items
SET @remise_percent := 2.50;

-- Item A
SET @a_unit_price := 120.00;
SET @a_qty := 2;
SET @a_subtotal := ROUND(@a_unit_price * @a_qty, 2);
SET @a_remise_amount := ROUND(@a_subtotal * @remise_percent / 100, 2);

-- Item B
SET @b_unit_price := 75.00;
SET @b_qty := 1;
SET @b_subtotal := ROUND(@b_unit_price * @b_qty, 2);
SET @b_remise_amount := ROUND(@b_subtotal * @remise_percent / 100, 2);

-- Item C
SET @c_unit_price := 50.00;
SET @c_qty := 3;
SET @c_subtotal := ROUND(@c_unit_price * @c_qty, 2);
SET @c_remise_amount := ROUND(@c_subtotal * @remise_percent / 100, 2);

-- Order totals
SET @order_subtotal := ROUND(@a_subtotal + @b_subtotal + @c_subtotal, 2);
SET @order_remise_earned := ROUND(@a_remise_amount + @b_remise_amount + @c_remise_amount, 2);
SET @order_total := @order_subtotal;

-- 4) Create ONE order per status (covers: pending + all statuses)
-- If you only want pending, comment out the other blocks.

-- Helper: generates unique order number
SET @base := CONCAT('ORD-TEST-SOLDE-', UPPER(SUBSTRING(REPLACE(UUID(), '-', ''), 1, 10)));

-- pending
SET @order_number := CONCAT(@base, '-PENDING');
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
  remise_earned_amount,
  status,
  payment_status,
  payment_method,
  delivery_method,
  pickup_location_id,
  is_solde,
  solde_amount,
  customer_notes,
  created_at,
  admin_notes
) VALUES (
  @order_number,
  @client_id,
  CONCAT('test.solde.', @client_id, '@example.local'),
  '+212600000999',
  'Test Solde Pending',
  'Adresse test',
  NULL,
  'Casablanca',
  NULL,
  NULL,
  'Morocco',
  @order_subtotal,
  0.00,
  0.00,
  0.00,
  NULL,
  0.00,
  @order_total,
  0.00,
  @order_remise_earned,
  'pending',
  'pending',
  'solde',
  'delivery',
  NULL,
  1,
  @order_total,
  CONCAT('Commande test solde (pending) - remise ', @remise_percent, '%'),
  NOW(),
  'ecommerce_test_solde_remise.sql'
);
SET @order_id := LAST_INSERT_ID();

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
  @order_id,
  @product_id,
  NULL,
  NULL,
  'Produit Test Remise A',
  NULL,
  NULL,
  NULL,
  NULL,
  @a_unit_price,
  @a_qty,
  @a_subtotal,
  0.00,
  0.00,
  @remise_percent,
  @a_remise_amount
),
(
  @order_id,
  @product_id,
  NULL,
  NULL,
  'Produit Test Remise B',
  NULL,
  NULL,
  NULL,
  NULL,
  @b_unit_price,
  @b_qty,
  @b_subtotal,
  0.00,
  0.00,
  @remise_percent,
  @b_remise_amount
),
(
  @order_id,
  @product_id,
  NULL,
  NULL,
  'Produit Test Remise C',
  NULL,
  NULL,
  NULL,
  NULL,
  @c_unit_price,
  @c_qty,
  @c_subtotal,
  0.00,
  0.00,
  @remise_percent,
  @c_remise_amount
);

-- confirmed
SET @order_number := CONCAT(@base, '-CONFIRMED');
INSERT INTO ecommerce_orders (
  order_number, user_id, customer_email, customer_phone, customer_name,
  shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_postal_code, shipping_country,
  subtotal, tax_amount, shipping_cost, discount_amount, promo_code, promo_discount_amount, total_amount,
  remise_used_amount, remise_earned_amount,
  status, payment_status, payment_method, delivery_method, pickup_location_id,
  is_solde, solde_amount, customer_notes, created_at, admin_notes
) VALUES (
  @order_number, @client_id, CONCAT('test.solde.', @client_id, '@example.local'), '+212600000999', 'Test Solde Confirmed',
  'Adresse test', NULL, 'Casablanca', NULL, NULL, 'Morocco',
  @order_subtotal, 0.00, 0.00, 0.00, NULL, 0.00, @order_total,
  0.00, @order_remise_earned,
  'confirmed', 'pending', 'solde', 'delivery', NULL,
  1, @order_total, CONCAT('Commande test solde (confirmed) - remise ', @remise_percent, '%'), NOW(), 'ecommerce_test_solde_remise.sql'
);
SET @order_id := LAST_INSERT_ID();
INSERT INTO ecommerce_order_items (order_id, product_id, variant_id, unit_id, product_name, product_name_ar, variant_name, variant_type, unit_name, unit_price, quantity, subtotal, discount_percentage, discount_amount, remise_percent_applied, remise_amount)
VALUES
(@order_id, @product_id, NULL, NULL, 'Produit Test Remise A', NULL, NULL, NULL, NULL, @a_unit_price, @a_qty, @a_subtotal, 0.00, 0.00, @remise_percent, @a_remise_amount),
(@order_id, @product_id, NULL, NULL, 'Produit Test Remise B', NULL, NULL, NULL, NULL, @b_unit_price, @b_qty, @b_subtotal, 0.00, 0.00, @remise_percent, @b_remise_amount),
(@order_id, @product_id, NULL, NULL, 'Produit Test Remise C', NULL, NULL, NULL, NULL, @c_unit_price, @c_qty, @c_subtotal, 0.00, 0.00, @remise_percent, @c_remise_amount);

-- processing
SET @order_number := CONCAT(@base, '-PROCESSING');
INSERT INTO ecommerce_orders (
  order_number, user_id, customer_email, customer_phone, customer_name,
  shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_postal_code, shipping_country,
  subtotal, tax_amount, shipping_cost, discount_amount, promo_code, promo_discount_amount, total_amount,
  remise_used_amount, remise_earned_amount,
  status, payment_status, payment_method, delivery_method, pickup_location_id,
  is_solde, solde_amount, customer_notes, created_at, admin_notes
) VALUES (
  @order_number, @client_id, CONCAT('test.solde.', @client_id, '@example.local'), '+212600000999', 'Test Solde Processing',
  'Adresse test', NULL, 'Casablanca', NULL, NULL, 'Morocco',
  @order_subtotal, 0.00, 0.00, 0.00, NULL, 0.00, @order_total,
  0.00, @order_remise_earned,
  'processing', 'pending', 'solde', 'delivery', NULL,
  1, @order_total, CONCAT('Commande test solde (processing) - remise ', @remise_percent, '%'), NOW(), 'ecommerce_test_solde_remise.sql'
);
SET @order_id := LAST_INSERT_ID();
INSERT INTO ecommerce_order_items (order_id, product_id, variant_id, unit_id, product_name, product_name_ar, variant_name, variant_type, unit_name, unit_price, quantity, subtotal, discount_percentage, discount_amount, remise_percent_applied, remise_amount)
VALUES
(@order_id, @product_id, NULL, NULL, 'Produit Test Remise A', NULL, NULL, NULL, NULL, @a_unit_price, @a_qty, @a_subtotal, 0.00, 0.00, @remise_percent, @a_remise_amount),
(@order_id, @product_id, NULL, NULL, 'Produit Test Remise B', NULL, NULL, NULL, NULL, @b_unit_price, @b_qty, @b_subtotal, 0.00, 0.00, @remise_percent, @b_remise_amount),
(@order_id, @product_id, NULL, NULL, 'Produit Test Remise C', NULL, NULL, NULL, NULL, @c_unit_price, @c_qty, @c_subtotal, 0.00, 0.00, @remise_percent, @c_remise_amount);

-- shipped
SET @order_number := CONCAT(@base, '-SHIPPED');
INSERT INTO ecommerce_orders (
  order_number, user_id, customer_email, customer_phone, customer_name,
  shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_postal_code, shipping_country,
  subtotal, tax_amount, shipping_cost, discount_amount, promo_code, promo_discount_amount, total_amount,
  remise_used_amount, remise_earned_amount,
  status, payment_status, payment_method, delivery_method, pickup_location_id,
  is_solde, solde_amount, customer_notes, created_at, admin_notes
) VALUES (
  @order_number, @client_id, CONCAT('test.solde.', @client_id, '@example.local'), '+212600000999', 'Test Solde Shipped',
  'Adresse test', NULL, 'Casablanca', NULL, NULL, 'Morocco',
  @order_subtotal, 0.00, 0.00, 0.00, NULL, 0.00, @order_total,
  0.00, @order_remise_earned,
  'shipped', 'pending', 'solde', 'delivery', NULL,
  1, @order_total, CONCAT('Commande test solde (shipped) - remise ', @remise_percent, '%'), NOW(), 'ecommerce_test_solde_remise.sql'
);
SET @order_id := LAST_INSERT_ID();
INSERT INTO ecommerce_order_items (order_id, product_id, variant_id, unit_id, product_name, product_name_ar, variant_name, variant_type, unit_name, unit_price, quantity, subtotal, discount_percentage, discount_amount, remise_percent_applied, remise_amount)
VALUES
(@order_id, @product_id, NULL, NULL, 'Produit Test Remise A', NULL, NULL, NULL, NULL, @a_unit_price, @a_qty, @a_subtotal, 0.00, 0.00, @remise_percent, @a_remise_amount),
(@order_id, @product_id, NULL, NULL, 'Produit Test Remise B', NULL, NULL, NULL, NULL, @b_unit_price, @b_qty, @b_subtotal, 0.00, 0.00, @remise_percent, @b_remise_amount),
(@order_id, @product_id, NULL, NULL, 'Produit Test Remise C', NULL, NULL, NULL, NULL, @c_unit_price, @c_qty, @c_subtotal, 0.00, 0.00, @remise_percent, @c_remise_amount);

-- delivered
SET @order_number := CONCAT(@base, '-DELIVERED');
INSERT INTO ecommerce_orders (
  order_number, user_id, customer_email, customer_phone, customer_name,
  shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_postal_code, shipping_country,
  subtotal, tax_amount, shipping_cost, discount_amount, promo_code, promo_discount_amount, total_amount,
  remise_used_amount, remise_earned_amount,
  status, payment_status, payment_method, delivery_method, pickup_location_id,
  is_solde, solde_amount, customer_notes, created_at, admin_notes
) VALUES (
  @order_number, @client_id, CONCAT('test.solde.', @client_id, '@example.local'), '+212600000999', 'Test Solde Delivered',
  'Adresse test', NULL, 'Casablanca', NULL, NULL, 'Morocco',
  @order_subtotal, 0.00, 0.00, 0.00, NULL, 0.00, @order_total,
  0.00, @order_remise_earned,
  'delivered', 'pending', 'solde', 'delivery', NULL,
  1, @order_total, CONCAT('Commande test solde (delivered) - remise ', @remise_percent, '%'), NOW(), 'ecommerce_test_solde_remise.sql'
);
SET @order_id := LAST_INSERT_ID();
INSERT INTO ecommerce_order_items (order_id, product_id, variant_id, unit_id, product_name, product_name_ar, variant_name, variant_type, unit_name, unit_price, quantity, subtotal, discount_percentage, discount_amount, remise_percent_applied, remise_amount)
VALUES
(@order_id, @product_id, NULL, NULL, 'Produit Test Remise A', NULL, NULL, NULL, NULL, @a_unit_price, @a_qty, @a_subtotal, 0.00, 0.00, @remise_percent, @a_remise_amount),
(@order_id, @product_id, NULL, NULL, 'Produit Test Remise B', NULL, NULL, NULL, NULL, @b_unit_price, @b_qty, @b_subtotal, 0.00, 0.00, @remise_percent, @b_remise_amount),
(@order_id, @product_id, NULL, NULL, 'Produit Test Remise C', NULL, NULL, NULL, NULL, @c_unit_price, @c_qty, @c_subtotal, 0.00, 0.00, @remise_percent, @c_remise_amount);

-- cancelled
SET @order_number := CONCAT(@base, '-CANCELLED');
INSERT INTO ecommerce_orders (
  order_number, user_id, customer_email, customer_phone, customer_name,
  shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_postal_code, shipping_country,
  subtotal, tax_amount, shipping_cost, discount_amount, promo_code, promo_discount_amount, total_amount,
  remise_used_amount, remise_earned_amount,
  status, payment_status, payment_method, delivery_method, pickup_location_id,
  is_solde, solde_amount, customer_notes, created_at, admin_notes
) VALUES (
  @order_number, @client_id, CONCAT('test.solde.', @client_id, '@example.local'), '+212600000999', 'Test Solde Cancelled',
  'Adresse test', NULL, 'Casablanca', NULL, NULL, 'Morocco',
  @order_subtotal, 0.00, 0.00, 0.00, NULL, 0.00, @order_total,
  0.00, @order_remise_earned,
  'cancelled', 'pending', 'solde', 'delivery', NULL,
  1, @order_total, CONCAT('Commande test solde (cancelled) - remise ', @remise_percent, '%'), NOW(), 'ecommerce_test_solde_remise.sql'
);
SET @order_id := LAST_INSERT_ID();
INSERT INTO ecommerce_order_items (order_id, product_id, variant_id, unit_id, product_name, product_name_ar, variant_name, variant_type, unit_name, unit_price, quantity, subtotal, discount_percentage, discount_amount, remise_percent_applied, remise_amount)
VALUES
(@order_id, @product_id, NULL, NULL, 'Produit Test Remise A', NULL, NULL, NULL, NULL, @a_unit_price, @a_qty, @a_subtotal, 0.00, 0.00, @remise_percent, @a_remise_amount),
(@order_id, @product_id, NULL, NULL, 'Produit Test Remise B', NULL, NULL, NULL, NULL, @b_unit_price, @b_qty, @b_subtotal, 0.00, 0.00, @remise_percent, @b_remise_amount),
(@order_id, @product_id, NULL, NULL, 'Produit Test Remise C', NULL, NULL, NULL, NULL, @c_unit_price, @c_qty, @c_subtotal, 0.00, 0.00, @remise_percent, @c_remise_amount);

-- refunded
SET @order_number := CONCAT(@base, '-REFUNDED');
INSERT INTO ecommerce_orders (
  order_number, user_id, customer_email, customer_phone, customer_name,
  shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_postal_code, shipping_country,
  subtotal, tax_amount, shipping_cost, discount_amount, promo_code, promo_discount_amount, total_amount,
  remise_used_amount, remise_earned_amount,
  status, payment_status, payment_method, delivery_method, pickup_location_id,
  is_solde, solde_amount, customer_notes, created_at, admin_notes
) VALUES (
  @order_number, @client_id, CONCAT('test.solde.', @client_id, '@example.local'), '+212600000999', 'Test Solde Refunded',
  'Adresse test', NULL, 'Casablanca', NULL, NULL, 'Morocco',
  @order_subtotal, 0.00, 0.00, 0.00, NULL, 0.00, @order_total,
  0.00, @order_remise_earned,
  'refunded', 'pending', 'solde', 'delivery', NULL,
  1, @order_total, CONCAT('Commande test solde (refunded) - remise ', @remise_percent, '%'), NOW(), 'ecommerce_test_solde_remise.sql'
);
SET @order_id := LAST_INSERT_ID();
INSERT INTO ecommerce_order_items (order_id, product_id, variant_id, unit_id, product_name, product_name_ar, variant_name, variant_type, unit_name, unit_price, quantity, subtotal, discount_percentage, discount_amount, remise_percent_applied, remise_amount)
VALUES
(@order_id, @product_id, NULL, NULL, 'Produit Test Remise A', NULL, NULL, NULL, NULL, @a_unit_price, @a_qty, @a_subtotal, 0.00, 0.00, @remise_percent, @a_remise_amount),
(@order_id, @product_id, NULL, NULL, 'Produit Test Remise B', NULL, NULL, NULL, NULL, @b_unit_price, @b_qty, @b_subtotal, 0.00, 0.00, @remise_percent, @b_remise_amount),
(@order_id, @product_id, NULL, NULL, 'Produit Test Remise C', NULL, NULL, NULL, NULL, @c_unit_price, @c_qty, @c_subtotal, 0.00, 0.00, @remise_percent, @c_remise_amount);

COMMIT;

-- After running, you can verify with:
--   SELECT id, order_number, user_id, status, payment_status, payment_method, is_solde, solde_amount, remise_earned_amount, total_amount
--   FROM ecommerce_orders
--   WHERE order_number LIKE 'ORD-TEST-SOLDE-%'
--   ORDER BY id DESC;
--
--   SELECT order_id, id, product_name, quantity, unit_price, subtotal, remise_percent_applied, remise_amount
--   FROM ecommerce_order_items
--   WHERE order_id IN (SELECT id FROM ecommerce_orders WHERE order_number LIKE 'ORD-TEST-SOLDE-%')
--   ORDER BY order_id DESC, id ASC;
