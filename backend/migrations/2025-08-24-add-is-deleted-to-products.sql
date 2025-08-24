-- Add soft-delete flag to products
-- Ensures deleted products are hidden from stock listing but remain in DB for document links

ALTER TABLE `products`
  ADD COLUMN `is_deleted` TINYINT(1) NOT NULL DEFAULT 0 AFTER `est_service`;

-- Optional index if you expect frequent filtering by is_deleted
-- Uncomment if desired (note: IF NOT EXISTS not supported for indexes in some MySQL versions)
-- ALTER TABLE `products` ADD INDEX `idx_products_is_deleted` (`is_deleted`);
