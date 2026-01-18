-- ============================================================================
-- E-commerce Demo Product Seed Script
-- Date: 2025-12-17
-- Description: Creates demo categories and 25+ products with images, variants, and units
-- ============================================================================

SET @now := NOW();

-- ============================================================================
-- 1. CATEGORIES HIERARCHY
-- ============================================================================

-- Root Categories
INSERT INTO categories (nom, parent_id, created_at, updated_at) VALUES
('Matériaux de Construction', NULL, @now, @now),
('Outillage', NULL, @now, @now),
('Plomberie', NULL, @now, @now);

SET @cat_materiaux := (SELECT id FROM categories WHERE nom='Matériaux de Construction' AND parent_id IS NULL ORDER BY id DESC LIMIT 1);
SET @cat_outillage := (SELECT id FROM categories WHERE nom='Outillage' AND parent_id IS NULL ORDER BY id DESC LIMIT 1);
SET @cat_plomberie := (SELECT id FROM categories WHERE nom='Plomberie' AND parent_id IS NULL ORDER BY id DESC LIMIT 1);

-- Sub-categories (Level 1)
INSERT INTO categories (nom, parent_id, created_at, updated_at) VALUES
('Ciment', @cat_materiaux, @now, @now),
('Peinture', @cat_materiaux, @now, @now),
('Bois', @cat_materiaux, @now, @now),
('Outils Électriques', @cat_outillage, @now, @now),
('Outils Manuels', @cat_outillage, @now, @now),
('Tuyauterie', @cat_plomberie, @now, @now),
('Robinetterie', @cat_plomberie, @now, @now);

SET @cat_ciment := (SELECT id FROM categories WHERE nom='Ciment' AND parent_id=@cat_materiaux ORDER BY id DESC LIMIT 1);
SET @cat_peinture := (SELECT id FROM categories WHERE nom='Peinture' AND parent_id=@cat_materiaux ORDER BY id DESC LIMIT 1);
SET @cat_bois := (SELECT id FROM categories WHERE nom='Bois' AND parent_id=@cat_materiaux ORDER BY id DESC LIMIT 1);
SET @cat_outils_elec := (SELECT id FROM categories WHERE nom='Outils Électriques' AND parent_id=@cat_outillage ORDER BY id DESC LIMIT 1);
SET @cat_outils_man := (SELECT id FROM categories WHERE nom='Outils Manuels' AND parent_id=@cat_outillage ORDER BY id DESC LIMIT 1);
SET @cat_tuyau := (SELECT id FROM categories WHERE nom='Tuyauterie' AND parent_id=@cat_plomberie ORDER BY id DESC LIMIT 1);
SET @cat_robinet := (SELECT id FROM categories WHERE nom='Robinetterie' AND parent_id=@cat_plomberie ORDER BY id DESC LIMIT 1);

-- Leaf categories (Level 2) - These can have products
INSERT INTO categories (nom, parent_id, created_at, updated_at) VALUES
('Ciment Gris', @cat_ciment, @now, @now),
('Ciment Blanc', @cat_ciment, @now, @now),
('Peinture Intérieure', @cat_peinture, @now, @now),
('Peinture Extérieure', @cat_peinture, @now, @now),
('Panneaux', @cat_bois, @now, @now),
('Charpente', @cat_bois, @now, @now),
('Perceuses', @cat_outils_elec, @now, @now),
('Scies', @cat_outils_elec, @now, @now),
('Marteaux', @cat_outils_man, @now, @now),
('Tournevis', @cat_outils_man, @now, @now),
('Tuyaux PVC', @cat_tuyau, @now, @now),
('Tuyaux Cuivre', @cat_tuyau, @now, @now),
('Robinets Cuisine', @cat_robinet, @now, @now),
('Robinets Salle de Bain', @cat_robinet, @now, @now);

-- Get leaf category IDs
SET @cim_gris := (SELECT id FROM categories WHERE nom='Ciment Gris' ORDER BY id DESC LIMIT 1);
SET @cim_blanc := (SELECT id FROM categories WHERE nom='Ciment Blanc' ORDER BY id DESC LIMIT 1);
SET @peint_int := (SELECT id FROM categories WHERE nom='Peinture Intérieure' ORDER BY id DESC LIMIT 1);
SET @peint_ext := (SELECT id FROM categories WHERE nom='Peinture Extérieure' ORDER BY id DESC LIMIT 1);
SET @bois_pan := (SELECT id FROM categories WHERE nom='Panneaux' ORDER BY id DESC LIMIT 1);
SET @bois_char := (SELECT id FROM categories WHERE nom='Charpente' ORDER BY id DESC LIMIT 1);
SET @out_perceuse := (SELECT id FROM categories WHERE nom='Perceuses' ORDER BY id DESC LIMIT 1);
SET @out_scie := (SELECT id FROM categories WHERE nom='Scies' ORDER BY id DESC LIMIT 1);
SET @out_marteau := (SELECT id FROM categories WHERE nom='Marteaux' ORDER BY id DESC LIMIT 1);
SET @out_tournevis := (SELECT id FROM categories WHERE nom='Tournevis' ORDER BY id DESC LIMIT 1);
SET @tuy_pvc := (SELECT id FROM categories WHERE nom='Tuyaux PVC' ORDER BY id DESC LIMIT 1);
SET @tuy_cuivre := (SELECT id FROM categories WHERE nom='Tuyaux Cuivre' ORDER BY id DESC LIMIT 1);
SET @rob_cuisine := (SELECT id FROM categories WHERE nom='Robinets Cuisine' ORDER BY id DESC LIMIT 1);
SET @rob_sdb := (SELECT id FROM categories WHERE nom='Robinets Salle de Bain' ORDER BY id DESC LIMIT 1);

-- ============================================================================
-- 2. PRODUCTS WITH MULTI-UNITS (10 products - Ciment category)
-- ============================================================================

-- Product 1: Ciment Portland Gris
SET @pa := 50.00; SET @crp := 10.00; SET @pgp := 20.00; SET @pvp := 35.00;
INSERT INTO products (designation, designation_ar, designation_en, categorie_id, quantite, kg, prix_achat, cout_revient_pourcentage, cout_revient, prix_gros_pourcentage, prix_gros, prix_vente_pourcentage, prix_vente, remise_client, remise_artisan, est_service, image_url, description, description_ar, description_en, pourcentage_promo, ecom_published, stock_partage_ecom, stock_partage_ecom_qty, has_variants, base_unit, categorie_base, created_at, updated_at)
VALUES ('Ciment Portland Gris 35R - Sac 25kg', 'إسمنت بورتلاند رمادي 35R', 'Portland Grey Cement 35R', @cim_gris, 500, 25.000, @pa, @crp, @pa*(1+@crp/100), @pgp, @pa*(1+@pgp/100), @pvp, @pa*(1+@pvp/100), 0, 0, 0, 'https://images.unsplash.com/photo-1560179707-f14e90ef1d2d?auto=format&fit=crop&w=800&q=80', 'Ciment Portland haute résistance 35R pour construction générale', 'إسمنت بورتلاند عالي المقاومة للبناء العام', 'High strength Portland cement for general construction', 0, 1, 1, 500, 0, 'sac', 'Professionel', @now, @now);
SET @p1 := LAST_INSERT_ID();
INSERT INTO product_images (product_id, image_url, position, created_at, updated_at) VALUES
(@p1, 'https://images.unsplash.com/photo-1560179707-f14e90ef1d2d?auto=format&fit=crop&w=800&q=80', 0, @now, @now),
(@p1, 'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=800&q=80', 1, @now, @now);
INSERT INTO product_units (product_id, unit_name, conversion_factor, prix_vente, is_default, created_at, updated_at) VALUES
(@p1, 'sac', 1, @pa*(1+@pvp/100), 1, @now, @now),
(@p1, 'palette', 50, @pa*(1+@pvp/100)*50*0.95, 0, @now, @now);

-- Product 2: Ciment Portland Gris Premium
SET @pa := 52.00; SET @crp := 10.00; SET @pgp := 20.00; SET @pvp := 35.00;
INSERT INTO products (designation, designation_ar, designation_en, categorie_id, quantite, kg, prix_achat, cout_revient_pourcentage, cout_revient, prix_gros_pourcentage, prix_gros, prix_vente_pourcentage, prix_vente, remise_client, remise_artisan, est_service, image_url, description, pourcentage_promo, ecom_published, stock_partage_ecom, stock_partage_ecom_qty, has_variants, base_unit, categorie_base, created_at, updated_at)
VALUES ('Ciment Portland Gris Premium 42.5R', NULL, NULL, @cim_gris, 400, 25.000, @pa, @crp, @pa*(1+@crp/100), @pgp, @pa*(1+@pgp/100), @pvp, @pa*(1+@pvp/100), 0, 0, 0, 'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=800&q=80', 'Ciment Portland premium résistance rapide', 5, 1, 1, 400, 0, 'sac', 'Professionel', @now, @now);
SET @p2 := LAST_INSERT_ID();
INSERT INTO product_images (product_id, image_url, position, created_at, updated_at) VALUES (@p2, 'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=800&q=80', 0, @now, @now);
INSERT INTO product_units (product_id, unit_name, conversion_factor, prix_vente, is_default, created_at, updated_at) VALUES
(@p2, 'sac', 1, @pa*(1+@pvp/100), 1, @now, @now),
(@p2, 'palette', 50, @pa*(1+@pvp/100)*50*0.95, 0, @now, @now);

-- Product 3: Ciment Blanc
SET @pa := 65.00; SET @crp := 12.00; SET @pgp := 22.00; SET @pvp := 40.00;
INSERT INTO products (designation, designation_ar, designation_en, categorie_id, quantite, kg, prix_achat, cout_revient_pourcentage, cout_revient, prix_gros_pourcentage, prix_gros, prix_vente_pourcentage, prix_vente, remise_client, remise_artisan, est_service, image_url, description, pourcentage_promo, ecom_published, stock_partage_ecom, stock_partage_ecom_qty, has_variants, base_unit, categorie_base, created_at, updated_at)
VALUES ('Ciment Blanc Décoratif - Sac 25kg', 'إسمنت أبيض للديكور', 'White Decorative Cement', @cim_blanc, 300, 25.000, @pa, @crp, @pa*(1+@crp/100), @pgp, @pa*(1+@pgp/100), @pvp, @pa*(1+@pvp/100), 0, 0, 0, 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=800&q=80', 'Ciment blanc pour finitions décoratives', 10, 1, 1, 300, 0, 'sac', 'Maison', @now, @now);
SET @p3 := LAST_INSERT_ID();
INSERT INTO product_images (product_id, image_url, position, created_at, updated_at) VALUES (@p3, 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=800&q=80', 0, @now, @now);
INSERT INTO product_units (product_id, unit_name, conversion_factor, prix_vente, is_default, created_at, updated_at) VALUES
(@p3, 'sac', 1, @pa*(1+@pvp/100), 1, @now, @now),
(@p3, 'palette', 50, @pa*(1+@pvp/100)*50*0.93, 0, @now, @now);

-- Products 4-10: More cement variations
SET @pa := 48.50; SET @crp := 10.00; SET @pgp := 20.00; SET @pvp := 35.00;
INSERT INTO products (designation, categorie_id, quantite, kg, prix_achat, cout_revient_pourcentage, cout_revient, prix_gros_pourcentage, prix_gros, prix_vente_pourcentage, prix_vente, est_service, image_url, description, ecom_published, stock_partage_ecom, stock_partage_ecom_qty, has_variants, base_unit, categorie_base, created_at, updated_at) VALUES
('Ciment Portland Gris Économique', @cim_gris, 450, 25.000, 48.5, 10, 48.5*1.1, 20, 48.5*1.2, 35, 48.5*1.35, 0, 'https://images.unsplash.com/photo-1560179707-f14e90ef1d2d?auto=format&fit=crop&w=800&q=80', 'Ciment économique pour usage courant', 1, 1, 450, 0, 'sac', 'Professionel', @now, @now),
('Ciment Portland Gris Chantier', @cim_gris, 380, 25.000, 49, 10, 49*1.1, 20, 49*1.2, 35, 49*1.35, 0, 'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=800&q=80', 'Ciment pour gros chantiers', 1, 1, 380, 0, 'sac', 'Professionel', @now, @now),
('Ciment Blanc Finition Premium', @cim_blanc, 250, 25.000, 68, 12, 68*1.12, 22, 68*1.22, 40, 68*1.4, 0, 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=800&q=80', 'Ciment blanc pour finitions haut de gamme', 1, 1, 250, 0, 'sac', 'Maison', @now, @now),
('Ciment Portland Gris Résistant', @cim_gris, 420, 25.000, 51, 10, 51*1.1, 20, 51*1.2, 35, 51*1.35, 0, 'https://images.unsplash.com/photo-1560179707-f14e90ef1d2d?auto=format&fit=crop&w=800&q=80', 'Haute résistance pour ouvrages critiques', 1, 1, 420, 0, 'sac', 'Professionel', @now, @now),
('Ciment Blanc Standard', @cim_blanc, 280, 25.000, 62, 12, 62*1.12, 22, 62*1.22, 40, 62*1.4, 0, 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=800&q=80', 'Ciment blanc usage standard', 1, 1, 280, 0, 'sac', 'Maison', @now, @now),
('Ciment Portland Gris Prise Rapide', @cim_gris, 350, 25.000, 53, 10, 53*1.1, 20, 53*1.2, 35, 53*1.35, 0, 'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=800&q=80', 'Prise rapide pour travaux urgents', 1, 1, 350, 0, 'sac', 'Professionel', @now, @now),
('Ciment Blanc Extra Blanc', @cim_blanc, 200, 25.000, 72, 12, 72*1.12, 22, 72*1.22, 40, 72*1.4, 0, 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=800&q=80', 'Ciment blanc extra blanc pour déco', 1, 1, 200, 0, 'sac', 'Maison', @now, @now);

-- Add units for products 4-10
INSERT INTO product_units (product_id, unit_name, conversion_factor, prix_vente, is_default, created_at, updated_at)
SELECT p.id, 'sac', 1, p.prix_vente, 1, @now, @now 
FROM products p 
WHERE p.designation IN ('Ciment Portland Gris Économique', 'Ciment Portland Gris Chantier', 'Ciment Blanc Finition Premium', 'Ciment Portland Gris Résistant', 'Ciment Blanc Standard', 'Ciment Portland Gris Prise Rapide', 'Ciment Blanc Extra Blanc');

INSERT INTO product_units (product_id, unit_name, conversion_factor, prix_vente, is_default, created_at, updated_at)
SELECT p.id, 'palette', 50, p.prix_vente*50*0.95, 0, @now, @now 
FROM products p 
WHERE p.designation IN ('Ciment Portland Gris Économique', 'Ciment Portland Gris Chantier', 'Ciment Blanc Finition Premium', 'Ciment Portland Gris Résistant', 'Ciment Blanc Standard', 'Ciment Portland Gris Prise Rapide', 'Ciment Blanc Extra Blanc');

-- ============================================================================
-- 3. PRODUCTS WITH MULTI-VARIANTS (8 products - Peinture category)
-- ============================================================================

-- Product 11: Peinture Acrylique Intérieure with color variants
SET @pa := 35.00; SET @crp := 12.00; SET @pgp := 18.00; SET @pvp := 30.00;
INSERT INTO products (designation, designation_ar, designation_en, categorie_id, quantite, kg, prix_achat, cout_revient_pourcentage, cout_revient, prix_gros_pourcentage, prix_gros, prix_vente_pourcentage, prix_vente, est_service, image_url, description, pourcentage_promo, ecom_published, stock_partage_ecom, stock_partage_ecom_qty, has_variants, base_unit, categorie_base, created_at, updated_at)
VALUES ('Peinture Acrylique Mat Intérieure Premium', 'دهان أكريليك داخلي ممتاز', 'Premium Interior Acrylic Paint', @peint_int, 0, NULL, @pa, @crp, @pa*(1+@crp/100), @pgp, @pa*(1+@pgp/100), @pvp, @pa*(1+@pvp/100), 0, 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=800&q=80', 'Peinture acrylique mat lessivable haut de gamme', 15, 1, 0, 0, 1, 'pot', 'Maison', @now, @now);
SET @pp1 := LAST_INSERT_ID();
INSERT INTO product_images (product_id, image_url, position, created_at, updated_at) VALUES 
(@pp1, 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=800&q=80', 0, @now, @now),
(@pp1, 'https://images.unsplash.com/photo-1513467535987-fd81bc7d62f8?auto=format&fit=crop&w=800&q=80', 1, @now, @now);

INSERT INTO product_variants (product_id, variant_name, variant_type, reference, prix_achat, cout_revient, cout_revient_pourcentage, prix_gros, prix_gros_pourcentage, prix_vente_pourcentage, prix_vente, remise_client, remise_artisan, stock_quantity, created_at, updated_at) VALUES
(@pp1, 'Blanc Pur', 'Couleur', 'PAINT-INT-001-BL', 35, 35*1.12, 12, 35*1.18, 18, 30, 35*1.30, 0, 0, 150, @now, @now),
(@pp1, 'Gris Perle', 'Couleur', 'PAINT-INT-001-GR', 35, 35*1.12, 12, 35*1.18, 18, 30, 35*1.30, 0, 0, 100, @now, @now),
(@pp1, 'Beige Sable', 'Couleur', 'PAINT-INT-001-BE', 35, 35*1.12, 12, 35*1.18, 18, 30, 35*1.30, 0, 0, 80, @now, @now),
(@pp1, 'Bleu Ciel', 'Couleur', 'PAINT-INT-001-BC', 35, 35*1.12, 12, 35*1.18, 18, 30, 35*1.30, 0, 0, 60, @now, @now);

-- Product 12-15: More paint products with variants
SET @pa := 38.00; SET @crp := 12.00; SET @pgp := 18.00; SET @pvp := 30.00;
INSERT INTO products (designation, categorie_id, quantite, prix_achat, cout_revient_pourcentage, cout_revient, prix_gros_pourcentage, prix_gros, prix_vente_pourcentage, prix_vente, est_service, image_url, description, ecom_published, stock_partage_ecom, has_variants, base_unit, categorie_base, created_at, updated_at) VALUES
('Peinture Acrylique Satinée Intérieure', @peint_int, 0, 38, 12, 38*1.12, 18, 38*1.18, 30, 38*1.30, 0, 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=800&q=80', 'Peinture satinée aspect velouté', 1, 1, 1, 'pot', 'Maison', @now, @now),
('Peinture Façade Extérieure Climat', @peint_ext, 0, 42, 12, 42*1.12, 18, 42*1.18, 30, 42*1.30, 0, 'https://images.unsplash.com/photo-1604709177225-055f99402ea3?auto=format&fit=crop&w=800&q=80', 'Peinture façade résistante aux intempéries', 1, 1, 1, 'pot', 'Professionel', @now, @now),
('Peinture Façade Extérieure Premium', @peint_ext, 0, 45, 12, 45*1.12, 18, 45*1.18, 30, 45*1.30, 0, 'https://images.unsplash.com/photo-1604709177225-055f99402ea3?auto=format&fit=crop&w=800&q=80', 'Peinture façade longue durée', 1, 1, 1, 'pot', 'Professionel', @now, @now),
('Peinture Acrylique Brillante Intérieure', @peint_int, 0, 40, 12, 40*1.12, 18, 40*1.18, 30, 40*1.30, 0, 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=800&q=80', 'Peinture brillante effet miroir', 1, 1, 1, 'pot', 'Maison', @now, @now);

-- Add color variants for products 12-15
INSERT INTO product_variants (product_id, variant_name, variant_type, reference, prix_achat, cout_revient, cout_revient_pourcentage, prix_gros, prix_gros_pourcentage, prix_vente_pourcentage, prix_vente, remise_client, remise_artisan, stock_quantity, created_at, updated_at)
SELECT p.id, 'Blanc Pur', 'Couleur', CONCAT('PAINT-', p.id, '-BL'), p.prix_achat, p.cout_revient, p.cout_revient_pourcentage, p.prix_gros, p.prix_gros_pourcentage, p.prix_vente_pourcentage, p.prix_vente, 0, 0, 120, @now, @now
FROM products p WHERE p.designation IN ('Peinture Acrylique Satinée Intérieure', 'Peinture Façade Extérieure Climat', 'Peinture Façade Extérieure Premium', 'Peinture Acrylique Brillante Intérieure');

INSERT INTO product_variants (product_id, variant_name, variant_type, reference, prix_achat, cout_revient, cout_revient_pourcentage, prix_gros, prix_gros_pourcentage, prix_vente_pourcentage, prix_vente, remise_client, remise_artisan, stock_quantity, created_at, updated_at)
SELECT p.id, 'Gris Perle', 'Couleur', CONCAT('PAINT-', p.id, '-GR'), p.prix_achat, p.cout_revient, p.cout_revient_pourcentage, p.prix_gros, p.prix_gros_pourcentage, p.prix_vente_pourcentage, p.prix_vente, 0, 0, 90, @now, @now
FROM products p WHERE p.designation IN ('Peinture Acrylique Satinée Intérieure', 'Peinture Façade Extérieure Climat', 'Peinture Façade Extérieure Premium', 'Peinture Acrylique Brillante Intérieure');

INSERT INTO product_variants (product_id, variant_name, variant_type, reference, prix_achat, cout_revient, cout_revient_pourcentage, prix_gros, prix_gros_pourcentage, prix_vente_pourcentage, prix_vente, remise_client, remise_artisan, stock_quantity, created_at, updated_at)
SELECT p.id, 'Beige Sable', 'Couleur', CONCAT('PAINT-', p.id, '-BE'), p.prix_achat, p.cout_revient, p.cout_revient_pourcentage, p.prix_gros, p.prix_gros_pourcentage, p.prix_vente_pourcentage, p.prix_vente, 0, 0, 70, @now, @now
FROM products p WHERE p.designation IN ('Peinture Acrylique Satinée Intérieure', 'Peinture Façade Extérieure Climat', 'Peinture Façade Extérieure Premium', 'Peinture Acrylique Brillante Intérieure');

-- ============================================================================
-- 4. PRODUCTS WITH BOTH VARIANTS AND UNITS (7 products - Bois category)
-- ============================================================================

-- Product 16: Panneau Contreplaqué with thickness variants and units
SET @pa := 120.00; SET @crp := 8.00; SET @pgp := 15.00; SET @pvp := 25.00;
INSERT INTO products (designation, categorie_id, quantite, prix_achat, cout_revient_pourcentage, cout_revient, prix_gros_pourcentage, prix_gros, prix_vente_pourcentage, prix_vente, est_service, image_url, description, ecom_published, stock_partage_ecom, has_variants, base_unit, categorie_base, created_at, updated_at)
VALUES ('Panneau Contreplaqué Marine 250x125cm', @bois_pan, 0, @pa, @crp, @pa*(1+@crp/100), @pgp, @pa*(1+@pgp/100), @pvp, @pa*(1+@pvp/100), 0, 'https://images.unsplash.com/photo-1619725002198-6a689b72f41d?auto=format&fit=crop&w=800&q=80', 'Contreplaqué marine résistant à l\'humidité', 1, 1, 1, 'feuille', 'Professionel', @now, @now);
SET @bp1 := LAST_INSERT_ID();
INSERT INTO product_images (product_id, image_url, position, created_at, updated_at) VALUES 
(@bp1, 'https://images.unsplash.com/photo-1619725002198-6a689b72f41d?auto=format&fit=crop&w=800&q=80', 0, @now, @now),
(@bp1, 'https://images.unsplash.com/photo-1565008576549-57569a49371d?auto=format&fit=crop&w=800&q=80', 1, @now, @now);

INSERT INTO product_units (product_id, unit_name, conversion_factor, prix_vente, is_default, created_at, updated_at) VALUES
(@bp1, 'feuille', 1, @pa*(1+@pvp/100), 1, @now, @now),
(@bp1, 'palette', 40, @pa*(1+@pvp/100)*40*0.92, 0, @now, @now);

INSERT INTO product_variants (product_id, variant_name, variant_type, reference, prix_achat, cout_revient, cout_revient_pourcentage, prix_gros, prix_gros_pourcentage, prix_vente_pourcentage, prix_vente, remise_client, remise_artisan, stock_quantity, created_at, updated_at) VALUES
(@bp1, '10mm', 'Épaisseur', 'BOIS-CP-M-10', 110, 110*1.08, 8, 110*1.15, 15, 25, 110*1.25, 0, 0, 60, @now, @now),
(@bp1, '15mm', 'Épaisseur', 'BOIS-CP-M-15', 120, 120*1.08, 8, 120*1.15, 15, 25, 120*1.25, 0, 0, 50, @now, @now),
(@bp1, '18mm', 'Épaisseur', 'BOIS-CP-M-18', 135, 135*1.08, 8, 135*1.15, 15, 25, 135*1.25, 0, 0, 40, @now, @now);

-- Products 17-22: More wood products with variants and units
INSERT INTO products (designation, categorie_id, quantite, prix_achat, cout_revient_pourcentage, cout_revient, prix_gros_pourcentage, prix_gros, prix_vente_pourcentage, prix_vente, est_service, image_url, description, ecom_published, stock_partage_ecom, has_variants, base_unit, categorie_base, created_at, updated_at) VALUES
('Panneau MDF Haute Densité 244x122cm', @bois_pan, 0, 95, 8, 95*1.08, 15, 95*1.15, 25, 95*1.25, 0, 'https://images.unsplash.com/photo-1565008576549-57569a49371d?auto=format&fit=crop&w=800&q=80', 'Panneau MDF haute densité pour meubles', 1, 1, 1, 'feuille', 'Maison', @now, @now),
('Panneau OSB Structure 250x125cm', @bois_pan, 0, 85, 8, 85*1.08, 15, 85*1.15, 25, 85*1.25, 0, 'https://images.unsplash.com/photo-1619725002198-6a689b72f41d?auto=format&fit=crop&w=800&q=80', 'OSB pour construction et planchers', 1, 1, 1, 'feuille', 'Professionel', @now, @now),
('Poutre Sapin Charpente', @bois_char, 0, 200, 8, 200*1.08, 15, 200*1.15, 25, 200*1.25, 0, 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=800&q=80', 'Poutre sapin traité classe 2', 1, 1, 1, 'pièce', 'Professionel', @now, @now),
('Latte Bois Pin 40x27mm', @bois_char, 0, 12, 8, 12*1.08, 15, 12*1.15, 25, 12*1.25, 0, 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=800&q=80', 'Latte pin pour lattage et tasseaux', 1, 1, 1, 'barre', 'Maison', @now, @now),
('Panneau Aggloméré Mélaminé Blanc', @bois_pan, 0, 105, 8, 105*1.08, 15, 105*1.15, 25, 105*1.25, 0, 'https://images.unsplash.com/photo-1565008576549-57569a49371d?auto=format&fit=crop&w=800&q=80', 'Panneau aggloméré finition mélaminé', 1, 1, 1, 'feuille', 'Maison', @now, @now),
('Chevron Sapin Traité', @bois_char, 0, 22, 8, 22*1.08, 15, 22*1.15, 25, 22*1.25, 0, 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=800&q=80', 'Chevron traité autoclave', 1, 1, 1, 'pièce', 'Professionel', @now, @now);

-- Add units for wood products 17-22
INSERT INTO product_units (product_id, unit_name, conversion_factor, prix_vente, is_default, created_at, updated_at)
SELECT p.id, 
  CASE 
    WHEN p.base_unit = 'feuille' THEN 'feuille'
    WHEN p.base_unit = 'pièce' THEN 'pièce'
    ELSE 'barre'
  END, 
  1, p.prix_vente, 1, @now, @now
FROM products p 
WHERE p.designation IN ('Panneau MDF Haute Densité 244x122cm', 'Panneau OSB Structure 250x125cm', 'Poutre Sapin Charpente', 'Latte Bois Pin 40x27mm', 'Panneau Aggloméré Mélaminé Blanc', 'Chevron Sapin Traité');

INSERT INTO product_units (product_id, unit_name, conversion_factor, prix_vente, is_default, created_at, updated_at)
SELECT p.id, 
  CASE 
    WHEN p.base_unit IN ('feuille', 'pièce') THEN 'palette'
    ELSE 'lot'
  END,
  CASE 
    WHEN p.base_unit = 'feuille' THEN 40
    WHEN p.base_unit = 'pièce' THEN 20
    ELSE 50
  END,
  p.prix_vente * CASE WHEN p.base_unit = 'feuille' THEN 40*0.92 WHEN p.base_unit = 'pièce' THEN 20*0.93 ELSE 50*0.90 END,
  0, @now, @now
FROM products p 
WHERE p.designation IN ('Panneau MDF Haute Densité 244x122cm', 'Panneau OSB Structure 250x125cm', 'Poutre Sapin Charpente', 'Latte Bois Pin 40x27mm', 'Panneau Aggloméré Mélaminé Blanc', 'Chevron Sapin Traité');

-- Add thickness/dimension variants for wood products
INSERT INTO product_variants (product_id, variant_name, variant_type, reference, prix_achat, cout_revient, cout_revient_pourcentage, prix_gros, prix_gros_pourcentage, prix_vente_pourcentage, prix_vente, remise_client, remise_artisan, stock_quantity, created_at, updated_at)
SELECT p.id, '10mm', 'Épaisseur', CONCAT('BOIS-', p.id, '-10'), p.prix_achat*0.85, p.cout_revient*0.85, p.cout_revient_pourcentage, p.prix_gros*0.85, p.prix_gros_pourcentage, p.prix_vente_pourcentage, p.prix_vente*0.85, 0, 0, 45, @now, @now
FROM products p WHERE p.designation IN ('Panneau MDF Haute Densité 244x122cm', 'Panneau OSB Structure 250x125cm', 'Panneau Aggloméré Mélaminé Blanc');

INSERT INTO product_variants (product_id, variant_name, variant_type, reference, prix_achat, cout_revient, cout_revient_pourcentage, prix_gros, prix_gros_pourcentage, prix_vente_pourcentage, prix_vente, remise_client, remise_artisan, stock_quantity, created_at, updated_at)
SELECT p.id, '15mm', 'Épaisseur', CONCAT('BOIS-', p.id, '-15'), p.prix_achat, p.cout_revient, p.cout_revient_pourcentage, p.prix_gros, p.prix_gros_pourcentage, p.prix_vente_pourcentage, p.prix_vente, 0, 0, 35, @now, @now
FROM products p WHERE p.designation IN ('Panneau MDF Haute Densité 244x122cm', 'Panneau OSB Structure 250x125cm', 'Panneau Aggloméré Mélaminé Blanc');

INSERT INTO product_variants (product_id, variant_name, variant_type, reference, prix_achat, cout_revient, cout_revient_pourcentage, prix_gros, prix_gros_pourcentage, prix_vente_pourcentage, prix_vente, remise_client, remise_artisan, stock_quantity, created_at, updated_at)
SELECT p.id, '18mm', 'Épaisseur', CONCAT('BOIS-', p.id, '-18'), p.prix_achat*1.12, p.cout_revient*1.12, p.cout_revient_pourcentage, p.prix_gros*1.12, p.prix_gros_pourcentage, p.prix_vente_pourcentage, p.prix_vente*1.12, 0, 0, 25, @now, @now
FROM products p WHERE p.designation IN ('Panneau MDF Haute Densité 244x122cm', 'Panneau OSB Structure 250x125cm', 'Panneau Aggloméré Mélaminé Blanc');

-- Add dimension variants for structural wood
INSERT INTO product_variants (product_id, variant_name, variant_type, reference, prix_achat, cout_revient, cout_revient_pourcentage, prix_gros, prix_gros_pourcentage, prix_vente_pourcentage, prix_vente, remise_client, remise_artisan, stock_quantity, created_at, updated_at)
SELECT p.id, '2m', 'Longueur', CONCAT('BOIS-', p.id, '-2M'), p.prix_achat*0.5, p.cout_revient*0.5, p.cout_revient_pourcentage, p.prix_gros*0.5, p.prix_gros_pourcentage, p.prix_vente_pourcentage, p.prix_vente*0.5, 0, 0, 50, @now, @now
FROM products p WHERE p.designation IN ('Poutre Sapin Charpente', 'Latte Bois Pin 40x27mm', 'Chevron Sapin Traité');

INSERT INTO product_variants (product_id, variant_name, variant_type, reference, prix_achat, cout_revient, cout_revient_pourcentage, prix_gros, prix_gros_pourcentage, prix_vente_pourcentage, prix_vente, remise_client, remise_artisan, stock_quantity, created_at, updated_at)
SELECT p.id, '3m', 'Longueur', CONCAT('BOIS-', p.id, '-3M'), p.prix_achat*0.75, p.cout_revient*0.75, p.cout_revient_pourcentage, p.prix_gros*0.75, p.prix_gros_pourcentage, p.prix_vente_pourcentage, p.prix_vente*0.75, 0, 0, 40, @now, @now
FROM products p WHERE p.designation IN ('Poutre Sapin Charpente', 'Latte Bois Pin 40x27mm', 'Chevron Sapin Traité');

INSERT INTO product_variants (product_id, variant_name, variant_type, reference, prix_achat, cout_revient, cout_revient_pourcentage, prix_gros, prix_gros_pourcentage, prix_vente_pourcentage, prix_vente, remise_client, remise_artisan, stock_quantity, created_at, updated_at)
SELECT p.id, '4m', 'Longueur', CONCAT('BOIS-', p.id, '-4M'), p.prix_achat, p.cout_revient, p.cout_revient_pourcentage, p.prix_gros, p.prix_gros_pourcentage, p.prix_vente_pourcentage, p.prix_vente, 0, 0, 30, @now, @now
FROM products p WHERE p.designation IN ('Poutre Sapin Charpente', 'Latte Bois Pin 40x27mm', 'Chevron Sapin Traité');

-- ============================================================================
-- 5. UPDATE stock_partage_ecom_qty for published products
-- ============================================================================

-- For products with stock (multi-unit products like cement)
UPDATE products SET stock_partage_ecom_qty = quantite WHERE ecom_published = 1 AND stock_partage_ecom = 1 AND quantite > 0;

-- For products with variants (paint, wood), sum variant stock
UPDATE products p
SET stock_partage_ecom_qty = (
  SELECT COALESCE(SUM(pv.stock_quantity), 0)
  FROM product_variants pv
  WHERE pv.product_id = p.id
)
WHERE p.ecom_published = 1 
  AND p.stock_partage_ecom = 1 
  AND p.has_variants = 1
  AND p.quantite = 0;

-- ============================================================================
-- Summary Output
-- ============================================================================
SELECT 
  '✅ Seed completed successfully!' as status,
  (SELECT COUNT(*) FROM categories) as total_categories,
  (SELECT COUNT(*) FROM products WHERE ecom_published = 1) as total_ecommerce_products,
  (SELECT COUNT(*) FROM product_variants) as total_variants,
  (SELECT COUNT(*) FROM product_units) as total_units,
  (SELECT COUNT(*) FROM product_images) as total_images;
