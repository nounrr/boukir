-- E-commerce seeds only
-- Created: 2026-01-25
-- Purpose: Seed minimal demo data for existing ecommerce tables
-- Requirements: tables must already exist (ecommerce_* + cart_items + wishlist_items)

-- 1) Seed ONE default pickup location if table is empty
INSERT INTO ecommerce_pickup_locations (name, address_line1, city, country)
SELECT 'Boukir Boutique', 'Boukir Boutique', 'Casablanca', 'Morocco'
WHERE NOT EXISTS (SELECT 1 FROM ecommerce_pickup_locations LIMIT 1);

-- 2) Seed a default promo code (safe)
INSERT INTO ecommerce_promo_codes (code, description, type, value, active)
SELECT 'WELCOME10', '10% sur la première commande', 'percentage', 10, 1
WHERE NOT EXISTS (SELECT 1 FROM ecommerce_promo_codes WHERE code = 'WELCOME10' LIMIT 1);

-- 3) Optional demo order (only if there is at least one product and the seed order does not exist)
SET @seed_prod_id := (SELECT id FROM products LIMIT 1);
SET @seed_order_exists := (SELECT COUNT(*) FROM ecommerce_orders WHERE order_number = 'ORD-SEED-0001');

SET @seed_sql := IF(
  @seed_prod_id IS NOT NULL AND @seed_order_exists = 0,
  "INSERT INTO ecommerce_orders (order_number, user_id, customer_email, customer_phone, customer_name, shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_postal_code, shipping_country, subtotal, tax_amount, shipping_cost, discount_amount, promo_code, promo_discount_amount, total_amount, status, payment_status, payment_method, delivery_method, pickup_location_id, is_solde, solde_amount, remise_earned_amount, remise_used_amount, customer_notes) VALUES ('ORD-SEED-0001', NULL, 'seed@example.com', '0600000000', 'Client Seed', 'Seed Address', NULL, 'Casablanca', NULL, NULL, 'Morocco', 100.00, 0.00, 0.00, 0.00, NULL, 0.00, 100.00, 'confirmed', 'pending', 'cash_on_delivery', 'delivery', NULL, 0, 0.00, 0.00, 0.00, 'Commande de test')",
  'SELECT 1'
);
PREPARE stmt FROM @seed_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @seed_order_id := (SELECT id FROM ecommerce_orders WHERE order_number = 'ORD-SEED-0001' LIMIT 1);
SET @seed_product_name := (SELECT COALESCE(designation, CONCAT('Produit#', id)) FROM products WHERE id = @seed_prod_id);

SET @seed_item_sql := IF(
  @seed_order_id IS NOT NULL AND @seed_prod_id IS NOT NULL AND (SELECT COUNT(*) FROM ecommerce_order_items WHERE order_id = @seed_order_id) = 0,
  CONCAT(
    "INSERT INTO ecommerce_order_items (order_id, product_id, variant_id, unit_id, product_name, product_name_ar, variant_name, variant_type, unit_name, unit_price, quantity, subtotal, discount_percentage, discount_amount) VALUES (",
    @seed_order_id,
    ", ",
    @seed_prod_id,
    ", NULL, NULL, ",
    QUOTE(@seed_product_name),
    ", NULL, NULL, NULL, NULL, 100.00, 1, 100.00, 0.00, 0.00)"
  ),
  'SELECT 1'
);
PREPARE stmt FROM @seed_item_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @seed_hist_sql := IF(
  @seed_order_id IS NOT NULL AND (SELECT COUNT(*) FROM ecommerce_order_status_history WHERE order_id = @seed_order_id) = 0,
  CONCAT(
    "INSERT INTO ecommerce_order_status_history (order_id, old_status, new_status, changed_by, changed_by_type, notes) VALUES (",
    @seed_order_id,
    ", NULL, 'confirmed', NULL, 'system', 'Seed initial status')"
  ),
  'SELECT 1'
);
PREPARE stmt FROM @seed_hist_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
