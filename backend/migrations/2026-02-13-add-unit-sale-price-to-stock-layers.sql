-- Enable keeping track of historical selling price in stock layers
-- This allows "Available Stock" to show not just the purchase cost but also the selling price
-- associated with that batch (snapshot).

SELECT COUNT(*) INTO @col_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'stock_layers'
  AND COLUMN_NAME = 'unit_sale_price';

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE stock_layers ADD COLUMN unit_sale_price DECIMAL(10,2) DEFAULT NULL AFTER unit_cost',
    'SELECT "Column unit_sale_price already exists in stock_layers"');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
