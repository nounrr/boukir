-- Manual display order of categories among their siblings (drag & drop in backoffice).
-- NULL = never ordered: falls back to alphabetical order after ordered siblings.
ALTER TABLE categories ADD COLUMN sort_order INT NULL;
CREATE INDEX idx_categories_parent_sort ON categories (parent_id, sort_order);
