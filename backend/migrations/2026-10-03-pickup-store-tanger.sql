-- Correct the legacy seed while preserving the location ID used by orders.
UPDATE ecommerce_pickup_locations
SET name = 'Boukir Diamond Tanger',
    address_line1 = CASE
      WHEN address_line1 IN ('Boukir Boutique', 'Boukir Diamond', 'Boukir Diamond Casablanca')
      THEN 'Boukir Diamond Tanger'
      ELSE address_line1
    END,
    city = 'Tanger',
    state = NULL,
    postal_code = NULL
WHERE is_active = 1
  AND city = 'Casablanca'
  AND (name LIKE 'Boukir%' OR name LIKE 'BOUKIR%');
