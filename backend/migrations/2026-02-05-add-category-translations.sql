-- Add translated name columns to categories
-- Default language remains French in `nom`

ALTER TABLE categories
  ADD COLUMN nom_ar VARCHAR(255) NULL AFTER nom,
  ADD COLUMN nom_en VARCHAR(255) NULL AFTER nom_ar,
  ADD COLUMN nom_zh VARCHAR(255) NULL AFTER nom_en;
