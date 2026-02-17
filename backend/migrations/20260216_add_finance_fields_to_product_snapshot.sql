-- Migration: add finance fields to product_snapshot table
-- Created: 2026-02-16

-- Add columns if missing (MySQL/MariaDB compatible via information_schema + dynamic SQL)

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_snapshot'
    AND COLUMN_NAME = 'cout_revient'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE product_snapshot ADD COLUMN cout_revient DECIMAL(10,2) DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_snapshot'
    AND COLUMN_NAME = 'cout_revient_pourcentage'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE product_snapshot ADD COLUMN cout_revient_pourcentage DECIMAL(5,2) DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_snapshot'
    AND COLUMN_NAME = 'prix_gros'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE product_snapshot ADD COLUMN prix_gros DECIMAL(10,2) DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_snapshot'
    AND COLUMN_NAME = 'prix_gros_pourcentage'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE product_snapshot ADD COLUMN prix_gros_pourcentage DECIMAL(5,2) DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_snapshot'
    AND COLUMN_NAME = 'prix_vente_pourcentage'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE product_snapshot ADD COLUMN prix_vente_pourcentage DECIMAL(5,2) DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Backfill existing snapshot rows from current products/variants (best-effort)
-- Note: if you want "historical" values, they must be captured at insert time.
UPDATE product_snapshot ps
JOIN products p ON p.id = ps.product_id
LEFT JOIN product_variants pv ON pv.id = ps.variant_id
SET
  ps.cout_revient = COALESCE(pv.cout_revient, p.cout_revient, ps.cout_revient),
  ps.cout_revient_pourcentage = COALESCE(pv.cout_revient_pourcentage, p.cout_revient_pourcentage, ps.cout_revient_pourcentage),
  ps.prix_gros = COALESCE(pv.prix_gros, p.prix_gros, ps.prix_gros),
  ps.prix_gros_pourcentage = COALESCE(pv.prix_gros_pourcentage, p.prix_gros_pourcentage, ps.prix_gros_pourcentage),
  ps.prix_vente_pourcentage = COALESCE(pv.prix_vente_pourcentage, p.prix_vente_pourcentage, ps.prix_vente_pourcentage)
WHERE
  ps.cout_revient IS NULL
  OR ps.cout_revient_pourcentage IS NULL
  OR ps.prix_gros IS NULL
  OR ps.prix_gros_pourcentage IS NULL
  OR ps.prix_vente_pourcentage IS NULL;
