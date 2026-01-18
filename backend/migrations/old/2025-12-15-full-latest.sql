-- Combined latest database modifications (December 2025)
-- Created on 2025-12-15

-- 2025-12-06-add-image-to-products.sql
ALTER TABLE products ADD COLUMN image_url VARCHAR(255) DEFAULT NULL;

-- 2025-12-12-create-product-variants-units.sql
CREATE TABLE IF NOT EXISTS product_variants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    variant_name VARCHAR(255) NOT NULL,
    reference VARCHAR(255),
    prix_achat DECIMAL(10, 2),
    prix_vente DECIMAL(10, 2),
    stock_quantity DECIMAL(10, 2) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_units (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    unit_name VARCHAR(50) NOT NULL,
    conversion_factor DECIMAL(10, 4) DEFAULT 1.0000,
    prix_vente DECIMAL(10, 2),
    is_default TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

ALTER TABLE products ADD COLUMN has_variants TINYINT(1) DEFAULT 0;
ALTER TABLE products ADD COLUMN base_unit VARCHAR(50) DEFAULT 'u';

-- 2025-12-12-add-variant-type.sql
ALTER TABLE product_variants ADD COLUMN variant_type VARCHAR(50) DEFAULT 'Autre';

-- 2025-12-12-add-prices-to-variants.sql
ALTER TABLE product_variants
ADD COLUMN cout_revient DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN cout_revient_pourcentage DECIMAL(5, 2) DEFAULT 0,
ADD COLUMN prix_gros DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN prix_gros_pourcentage DECIMAL(5, 2) DEFAULT 0,
ADD COLUMN prix_vente_pourcentage DECIMAL(5, 2) DEFAULT 0;

-- 2025-12-12-add-parent-category.sql
ALTER TABLE categories ADD COLUMN parent_id INT DEFAULT NULL;
ALTER TABLE categories ADD CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL;

-- 2025-12-12-add-variant-unit-to-items.sql
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

-- 2025-12-12-add-product-details.sql
ALTER TABLE products ADD COLUMN fiche_technique VARCHAR(255) DEFAULT NULL;
ALTER TABLE products ADD COLUMN description TEXT DEFAULT NULL;
ALTER TABLE products ADD COLUMN pourcentage_promo DECIMAL(5,2) DEFAULT 0;
