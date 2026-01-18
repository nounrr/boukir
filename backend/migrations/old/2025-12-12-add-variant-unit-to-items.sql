ALTER TABLE sortie_items ADD COLUMN variant_id INT DEFAULT NULL;
ALTER TABLE sortie_items ADD COLUMN unit_id INT DEFAULT NULL;
ALTER TABLE sortie_items ADD CONSTRAINT fk_si_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE sortie_items ADD CONSTRAINT fk_si_unit FOREIGN KEY (unit_id) REFERENCES product_units(id) ON DELETE SET NULL;

ALTER TABLE commande_items ADD COLUMN variant_id INT DEFAULT NULL;
ALTER TABLE commande_items ADD COLUMN unit_id INT DEFAULT NULL;
ALTER TABLE commande_items ADD CONSTRAINT fk_ci_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE commande_items ADD CONSTRAINT fk_ci_unit FOREIGN KEY (unit_id) REFERENCES product_units(id) ON DELETE SET NULL;

ALTER TABLE comptant_items ADD COLUMN variant_id INT DEFAULT NULL;
ALTER TABLE comptant_items ADD COLUMN unit_id INT DEFAULT NULL;
ALTER TABLE comptant_items ADD CONSTRAINT fk_coi_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE comptant_items ADD CONSTRAINT fk_coi_unit FOREIGN KEY (unit_id) REFERENCES product_units(id) ON DELETE SET NULL;

ALTER TABLE devis_items ADD COLUMN variant_id INT DEFAULT NULL;
ALTER TABLE devis_items ADD COLUMN unit_id INT DEFAULT NULL;
ALTER TABLE devis_items ADD CONSTRAINT fk_di_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE devis_items ADD CONSTRAINT fk_di_unit FOREIGN KEY (unit_id) REFERENCES product_units(id) ON DELETE SET NULL;

ALTER TABLE avoir_client_items ADD COLUMN variant_id INT DEFAULT NULL;
ALTER TABLE avoir_client_items ADD COLUMN unit_id INT DEFAULT NULL;
ALTER TABLE avoir_client_items ADD CONSTRAINT fk_aci_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE avoir_client_items ADD CONSTRAINT fk_aci_unit FOREIGN KEY (unit_id) REFERENCES product_units(id) ON DELETE SET NULL;

ALTER TABLE avoir_fournisseur_items ADD COLUMN variant_id INT DEFAULT NULL;
ALTER TABLE avoir_fournisseur_items ADD COLUMN unit_id INT DEFAULT NULL;
ALTER TABLE avoir_fournisseur_items ADD CONSTRAINT fk_afi_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE avoir_fournisseur_items ADD CONSTRAINT fk_afi_unit FOREIGN KEY (unit_id) REFERENCES product_units(id) ON DELETE SET NULL;

ALTER TABLE avoir_comptant_items ADD COLUMN variant_id INT DEFAULT NULL;
ALTER TABLE avoir_comptant_items ADD COLUMN unit_id INT DEFAULT NULL;
ALTER TABLE avoir_comptant_items ADD CONSTRAINT fk_avci_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE avoir_comptant_items ADD CONSTRAINT fk_avci_unit FOREIGN KEY (unit_id) REFERENCES product_units(id) ON DELETE SET NULL;
