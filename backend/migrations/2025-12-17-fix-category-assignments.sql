-- ============================================================================
-- Fix Category Assignments - Move Products to First Category Tree
-- Date: 2025-12-17
-- ============================================================================

-- Move Ciment Gris products from category 46 → 6 (under tree 2)
-- Category 46 is "Ciment Gris" under parent 36
-- Category 6 is "Ciment Gris 35R" under parent 2
UPDATE products SET categorie_id = 6 WHERE categorie_id = 46;

-- Move Ciment Blanc products from category 47 → 7 (under tree 2)
UPDATE products SET categorie_id = 7 WHERE categorie_id = 47;

-- Move Peinture Intérieure products from category 48 → 8 (under tree 2)
UPDATE products SET categorie_id = 8 WHERE categorie_id = 48;

-- Move Peinture Extérieure products from category 49 → 9 (under tree 2)
UPDATE products SET categorie_id = 9 WHERE categorie_id = 49;

-- Note: Categories 50 (Panneaux) and 51 (Charpente) don't exist under tree 2
-- We need to create them first or use tree 12 instead

-- Alternative: Use tree 12 which has all categories
-- Move Ciment Gris products from category 46 → 22 (under tree 12)
UPDATE products SET categorie_id = 22 WHERE categorie_id = 46;

-- Move Ciment Blanc products from category 47 → 23 (under tree 12)
UPDATE products SET categorie_id = 23 WHERE categorie_id = 47;

-- Move Peinture Intérieure products from category 48 → 24 (under tree 12)
UPDATE products SET categorie_id = 24 WHERE categorie_id = 48;

-- Move Peinture Extérieure products from category 49 → 25 (under tree 12)
UPDATE products SET categorie_id = 25 WHERE categorie_id = 49;

-- Move Panneaux products from category 50 → 26 (under tree 12)
UPDATE products SET categorie_id = 26 WHERE categorie_id = 50;

-- Move Charpente products from category 51 → 27 (under tree 12)
UPDATE products SET categorie_id = 27 WHERE categorie_id = 51;

-- Verify the changes
SELECT 
  'Products reassigned!' as status,
  COUNT(*) as total_products,
  GROUP_CONCAT(DISTINCT categorie_id) as used_categories
FROM products 
WHERE ecom_published = 1;
