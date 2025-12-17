-- ============================================================================
-- Enhance Product Variants with Professional Images
-- Date: 2025-12-17
-- Description: Add color-specific images to paint variants and "Bleu Ciel" variant
-- ============================================================================

SET @now := NOW();

-- ============================================================================
-- 1. ADD MISSING "BLEU CIEL" COLOR VARIANT TO ALL PAINT PRODUCTS
-- ============================================================================

-- Add Bleu Ciel variant to paint products that are missing it
INSERT INTO product_variants (product_id, variant_name, variant_type, reference, prix_achat, cout_revient, cout_revient_pourcentage, prix_gros, prix_gros_pourcentage, prix_vente_pourcentage, prix_vente, remise_client, remise_artisan, stock_quantity, created_at, updated_at)
SELECT 
  p.id,
  'Bleu Ciel',
  'Couleur',
  CONCAT('PAINT-', p.id, '-BC'),
  p.prix_achat,
  p.cout_revient,
  p.cout_revient_pourcentage,
  p.prix_gros,
  p.prix_gros_pourcentage,
  p.prix_vente_pourcentage,
  p.prix_vente,
  0,
  0,
  60,
  @now,
  @now
FROM products p
WHERE p.has_variants = 1
  AND p.base_unit = 'pot'
  AND p.ecom_published = 1
  AND NOT EXISTS (
    SELECT 1 FROM product_variants pv 
    WHERE pv.product_id = p.id 
    AND pv.variant_name = 'Bleu Ciel'
  );

-- ============================================================================
-- 2. ADD COLOR-SPECIFIC IMAGES TO PAINT VARIANTS
-- ============================================================================

-- Update Blanc Pur variants with white/light themed images
UPDATE product_variants pv
SET image_url = 'https://images.unsplash.com/photo-1513467535987-fd81bc7d62f8?auto=format&fit=crop&w=400&q=80'
WHERE pv.variant_name = 'Blanc Pur'
  AND pv.variant_type = 'Couleur'
  AND pv.image_url IS NULL;

-- Update Gris Perle variants with grey themed images
UPDATE product_variants pv
SET image_url = 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=400&q=80'
WHERE pv.variant_name = 'Gris Perle'
  AND pv.variant_type = 'Couleur'
  AND pv.image_url IS NULL;

-- Update Beige Sable variants with beige/sand themed images
UPDATE product_variants pv
SET image_url = 'https://images.unsplash.com/photo-1615529328331-f8917597711f?auto=format&fit=crop&w=400&q=80'
WHERE pv.variant_name = 'Beige Sable'
  AND pv.variant_type = 'Couleur'
  AND pv.image_url IS NULL;

-- Update Bleu Ciel variants with blue/sky themed images
UPDATE product_variants pv
SET image_url = 'https://images.unsplash.com/photo-1557682250-33bd709cbe85?auto=format&fit=crop&w=400&q=80'
WHERE pv.variant_name = 'Bleu Ciel'
  AND pv.variant_type = 'Couleur'
  AND pv.image_url IS NULL;

-- ============================================================================
-- 3. UPDATE PRODUCT STOCK QUANTITIES FOR VARIANT-BASED PRODUCTS
-- ============================================================================

-- Recalculate stock_partage_ecom_qty for products with variants
UPDATE products p
SET stock_partage_ecom_qty = (
  SELECT COALESCE(SUM(pv.stock_quantity), 0)
  FROM product_variants pv
  WHERE pv.product_id = p.id
)
WHERE p.ecom_published = 1 
  AND p.stock_partage_ecom = 1 
  AND p.has_variants = 1;

-- ============================================================================
-- 4. ADD PROFESSIONAL PRODUCT DESCRIPTIONS
-- ============================================================================

-- Update paint products with better descriptions
UPDATE products 
SET description = 'Peinture acrylique mate de haute qualité pour murs et plafonds intérieurs. Finition veloutée élégante, excellente couvrance. Disponible en 4 coloris tendance.',
    description_ar = 'طلاء أكريليك مات عالي الجودة للجدران والأسقف الداخلية. لمسة نهائية مخملية أنيقة، تغطية ممتازة.',
    description_en = 'High-quality matte acrylic paint for interior walls and ceilings. Elegant velvety finish, excellent coverage. Available in 4 trendy colors.'
WHERE designation LIKE '%Peinture Acrylique%Intérieure%'
  AND ecom_published = 1;

UPDATE products 
SET description = 'Peinture façade extérieure haute résistance. Protection durable contre les intempéries, UV et pollution. Finition mate respirante.',
    description_ar = 'طلاء واجهات خارجي عالي المقاومة. حماية دائمة ضد الطقس والأشعة فوق البنفسجية والتلوث.',
    description_en = 'High-resistance exterior facade paint. Durable protection against weather, UV and pollution. Breathable matte finish.'
WHERE designation LIKE '%Peinture Façade%Extérieure%'
  AND ecom_published = 1;

-- Update wood products with better descriptions
UPDATE products 
SET description = 'Panneau contreplaqué marine qualité supérieure, résistant à l\'humidité. Idéal pour applications extérieures et milieux humides. Certifié marine.',
    description_ar = 'لوح خشب رقائقي بحري عالي الجودة، مقاوم للرطوبة. مثالي للتطبيقات الخارجية والبيئات الرطبة.',
    description_en = 'Superior quality marine plywood, moisture resistant. Ideal for outdoor applications and humid environments. Marine certified.'
WHERE designation LIKE '%Contreplaqué Marine%'
  AND ecom_published = 1;

UPDATE products 
SET description = 'Panneau MDF haute densité, surface lisse et homogène. Parfait pour fabrication de meubles, étagères et aménagements intérieurs.',
    description_ar = 'لوح MDF عالي الكثافة، سطح أملس ومتجانس. مثالي لتصنيع الأثاث والرفوف والتجهيزات الداخلية.',
    description_en = 'High-density MDF board, smooth and homogeneous surface. Perfect for furniture, shelves and interior fittings.'
WHERE designation LIKE '%MDF%'
  AND ecom_published = 1;

UPDATE products 
SET description = 'Panneau OSB structural robuste pour construction. Excellente résistance mécanique, idéal pour planchers, toitures et murs porteurs.',
    description_ar = 'لوح OSB الإنشائي القوي للبناء. مقاومة ميكانيكية ممتازة، مثالي للأرضيات والأسقف والجدران الحاملة.',
    description_en = 'Robust structural OSB panel for construction. Excellent mechanical resistance, ideal for floors, roofs and load-bearing walls.'
WHERE designation LIKE '%OSB%'
  AND ecom_published = 1;

UPDATE products 
SET description = 'Poutre en sapin traité autoclave classe 2 pour charpente. Résistante aux insectes et champignons. Dimensions standards de construction.',
    description_ar = 'عارضة خشب التنوب المعالج بالأوتوكلاف فئة 2 للهيكل الخشبي. مقاومة للحشرات والفطريات.',
    description_en = 'Class 2 autoclave-treated fir beam for framing. Resistant to insects and fungi. Standard construction dimensions.'
WHERE designation LIKE '%Poutre Sapin%'
  AND ecom_published = 1;

UPDATE products 
SET description = 'Latte en pin de qualité pour lattage, tasseaux et finitions. Bois séché, raboté 4 faces. Multiple longueurs disponibles.',
    description_ar = 'شريحة خشب الصنوبر عالية الجودة للشرائح والقوائم والتشطيبات. خشب مجفف ومسحوج من 4 جوانب.',
    description_en = 'Quality pine lath for lathing, battens and finishes. Dried wood, planed 4 sides. Multiple lengths available.'
WHERE designation LIKE '%Latte%Pin%'
  AND ecom_published = 1;

-- ============================================================================
-- Summary Output
-- ============================================================================
SELECT 
  '✅ Variants enhanced successfully!' as status,
  (SELECT COUNT(*) FROM product_variants WHERE variant_name = 'Bleu Ciel') as bleu_ciel_variants,
  (SELECT COUNT(*) FROM product_variants WHERE image_url IS NOT NULL) as variants_with_images,
  (SELECT COUNT(*) FROM products WHERE ecom_published = 1 AND description IS NOT NULL) as products_with_descriptions;
