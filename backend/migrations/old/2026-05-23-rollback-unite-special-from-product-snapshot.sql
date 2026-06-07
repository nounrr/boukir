SET @sql := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'product_snapshot'
      AND COLUMN_NAME = 'facteur_barre'
  ),
  'ALTER TABLE product_snapshot DROP COLUMN facteur_barre',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'product_snapshot'
      AND COLUMN_NAME = 'nbr_barre'
  ),
  'ALTER TABLE product_snapshot DROP COLUMN nbr_barre',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'product_snapshot'
      AND COLUMN_NAME = 'unite_special'
  ),
  'ALTER TABLE product_snapshot DROP COLUMN unite_special',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

DELETE FROM schema_migrations
WHERE filename = '2026-05-22-add-unite-special-to-product-snapshot.sql';
