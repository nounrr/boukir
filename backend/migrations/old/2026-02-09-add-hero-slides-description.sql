-- Add multilingual fields for ecommerce_hero_slides
-- Existing columns are treated as FR defaults:
--   title -> title (fr)
--   subtitle -> subtitle (fr)
--   description -> description (fr)
-- New columns add other locales: _ar/_en/_zh

ALTER TABLE ecommerce_hero_slides
  ADD COLUMN description VARCHAR(512) NULL AFTER subtitle;

ALTER TABLE ecommerce_hero_slides
  ADD COLUMN title_ar VARCHAR(255) NULL AFTER title,
  ADD COLUMN title_en VARCHAR(255) NULL AFTER title_ar,
  ADD COLUMN title_zh VARCHAR(255) NULL AFTER title_en;

ALTER TABLE ecommerce_hero_slides
  ADD COLUMN subtitle_ar VARCHAR(255) NULL AFTER subtitle,
  ADD COLUMN subtitle_en VARCHAR(255) NULL AFTER subtitle_ar,
  ADD COLUMN subtitle_zh VARCHAR(255) NULL AFTER subtitle_en;

ALTER TABLE ecommerce_hero_slides
  ADD COLUMN description_ar VARCHAR(512) NULL AFTER description,
  ADD COLUMN description_en VARCHAR(512) NULL AFTER description_ar,
  ADD COLUMN description_zh VARCHAR(512) NULL AFTER description_en;
