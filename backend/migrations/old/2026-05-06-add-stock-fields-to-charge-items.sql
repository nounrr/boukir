ALTER TABLE charge_items ADD COLUMN variant_id INT NULL;
ALTER TABLE charge_items ADD COLUMN unit_id INT NULL;
ALTER TABLE charge_items ADD COLUMN product_snapshot_id INT NULL;

ALTER TABLE charge_items ADD KEY idx_charge_items_variant_id (variant_id);
ALTER TABLE charge_items ADD KEY idx_charge_items_unit_id (unit_id);
ALTER TABLE charge_items ADD KEY idx_charge_items_product_snapshot_id (product_snapshot_id);

ALTER TABLE charge_items
  ADD CONSTRAINT fk_charge_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL;

ALTER TABLE charge_items
  ADD CONSTRAINT fk_charge_items_unit FOREIGN KEY (unit_id) REFERENCES product_units(id) ON DELETE SET NULL;

ALTER TABLE charge_items
  ADD CONSTRAINT fk_charge_items_snapshot FOREIGN KEY (product_snapshot_id) REFERENCES product_snapshot(id) ON DELETE SET NULL;
