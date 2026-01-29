-- Created: 2026-01-27
-- Purpose: Add product flag to require selecting a variant in bons

ALTER TABLE products
  ADD COLUMN is_obligatoire_variant TINYINT(1) NOT NULL DEFAULT 0 AFTER has_variants;
