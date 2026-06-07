ALTER TABLE products
ADD COLUMN IF NOT EXISTS non_stockable TINYINT(1) NOT NULL DEFAULT 0;

UPDATE products
SET non_stockable = 0;
