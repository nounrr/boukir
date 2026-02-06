-- Add image_url to categories so backoffice can manage category images

ALTER TABLE categories
  ADD COLUMN image_url VARCHAR(255) DEFAULT NULL;
