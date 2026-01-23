-- Seed a sample promo code: NEWYEAR25 (25% off, capped at 300 MAD)
INSERT INTO ecommerce_promo_codes (
  code,
  description,
  type,
  value,
  max_discount_amount,
  min_order_amount,
  max_redemptions,
  redeemed_count,
  active,
  start_date,
  end_date,
  created_by
) VALUES (
  'NEWYEAR25',
  'New Year 25% off (cap 300 MAD, min 500 MAD)',
  'percentage',
  25.00,
  300.00,
  500.00,
  100,
  0,
  1,
  NOW(),
  DATE_ADD(NOW(), INTERVAL 30 DAY),
  NULL
);
