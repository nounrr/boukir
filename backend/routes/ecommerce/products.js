import { Router } from 'express';
import pool from '../../db/pool.js';
import { ensureProductRemiseColumns } from '../../utils/ensureRemiseSchema.js';

const router = Router();

// UI-only limit to avoid leaking real stock while keeping good UX.
// Real stock is enforced on cart/checkout.
const PURCHASE_LIMIT = 20;

function toSafeNumber(value, defaultValue = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : defaultValue;
}

function isInStock(stockQty) {
  return toSafeNumber(stockQty) > 0;
}

// Make sure remise fields exist so ecommerce endpoints can always return them.
ensureProductRemiseColumns().catch(e => console.error('ensureProductRemiseColumns:', e));

// ==================== GET ALL PUBLISHED PRODUCTS (WITH FILTERS DATA) ====================
// GET /api/ecommerce/products - List all published products with images, variants preview, and filter metadata
router.get('/', async (req, res, next) => {
  try {
    const { 
      category_id,  // Single or comma-separated IDs
      brand_id,     // Single or comma-separated IDs
      search, 
      min_price, 
      max_price,
      color,        // Single or comma-separated colors
      unit,         // Single or comma-separated units
      in_stock_only = 'true', // Filter only in-stock products
      sort = 'newest', // newest, price_asc, price_desc, popular, promo
      page = 1,     // Page number (starts from 1)
      limit = 50,   // Items per page
      per_page      // Alternative to limit
    } = req.query;

    // Calculate pagination
    const currentPage = Math.max(1, Number(page));
    const itemsPerPage = Number(per_page || limit);
    const offset = (currentPage - 1) * itemsPerPage;

    let whereConditions = [
      'p.ecom_published = 1',
      'COALESCE(p.is_deleted, 0) = 0'
    ];
    const params = [];

    // Stock filter
    if (in_stock_only === 'true' || in_stock_only === true) {
      whereConditions.push('p.stock_partage_ecom_qty > 0');
    }

    // Category filter (includes subcategories) - supports multiple categories
    if (category_id) {
      const inputCategories = Array.isArray(category_id) 
        ? category_id 
        : category_id.split(',').map(id => id.trim()).filter(Boolean);
      
      if (inputCategories.length > 0) {
        // Get all categories and their descendants
        const allCategoryIds = [];
        for (const catId of inputCategories) {
          const [categoryTree] = await pool.query(`
            WITH RECURSIVE category_tree AS (
              SELECT id FROM categories WHERE id = ?
              UNION ALL
              SELECT c.id FROM categories c
              INNER JOIN category_tree ct ON c.parent_id = ct.id
            )
            SELECT id FROM category_tree
          `, [Number(catId)]);
          
          allCategoryIds.push(...categoryTree.map(c => c.id));
        }
        
        // Remove duplicates
        const uniqueCategoryIds = [...new Set(allCategoryIds)];
        
        if (uniqueCategoryIds.length > 0) {
          whereConditions.push(`p.categorie_id IN (${uniqueCategoryIds.map(() => '?').join(',')})`);
          params.push(...uniqueCategoryIds);
        }
      }
    }

    // Brand filter - supports multiple brands
    if (brand_id) {
      const brandIds = Array.isArray(brand_id)
        ? brand_id.map(id => Number(id))
        : brand_id.split(',').map(id => Number(id.trim())).filter(id => !isNaN(id));
      
      if (brandIds.length > 0) {
        whereConditions.push(`p.brand_id IN (${brandIds.map(() => '?').join(',')})`);
        params.push(...brandIds);
      }
    }

    // Color filter - supports multiple colors
    if (color) {
      const colors = Array.isArray(color)
        ? color
        : color.split(',').map(c => c.trim()).filter(Boolean);
      
      if (colors.length > 0) {
        const colorConditions = colors.map(() => 'pv.variant_name = ?').join(' OR ');
        whereConditions.push(`EXISTS (
          SELECT 1 FROM product_variants pv 
          WHERE pv.product_id = p.id 
          AND pv.variant_type = 'Couleur' 
          AND (${colorConditions})
        )`);
        params.push(...colors);
      }
    }

    // Unit filter - supports multiple units
    if (unit) {
      const units = Array.isArray(unit)
        ? unit
        : unit.split(',').map(u => u.trim()).filter(Boolean);
      
      if (units.length > 0) {
        const unitConditions = units.map(() => 'pu.unit_name = ?').join(' OR ');
        whereConditions.push(`EXISTS (
          SELECT 1 FROM product_units pu 
          WHERE pu.product_id = p.id 
          AND (${unitConditions})
        )`);
        params.push(...units);
      }
    }

    // Search filter
    if (search && search.trim()) {
      whereConditions.push('(p.designation LIKE ? OR p.designation_ar LIKE ? OR p.designation_en LIKE ? OR p.description LIKE ?)');
      const searchTerm = `%${search.trim()}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Price range filter
    if (min_price) {
      whereConditions.push('p.prix_vente >= ?');
      params.push(Number(min_price));
    }
    if (max_price) {
      whereConditions.push('p.prix_vente <= ?');
      params.push(Number(max_price));
    }

    // Build ORDER BY clause
    let orderBy = 'p.created_at DESC'; // Default: newest first
    switch (sort) {
      case 'price_asc':
        orderBy = 'p.prix_vente ASC';
        break;
      case 'price_desc':
        orderBy = 'p.prix_vente DESC';
        break;
      case 'promo':
        orderBy = 'p.pourcentage_promo DESC, p.created_at DESC';
        break;
      case 'popular':
        // Could be based on sales count or views in the future
        orderBy = 'p.created_at DESC';
        break;
      case 'newest':
      default:
        orderBy = 'p.created_at DESC';
        break;
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM products p
      WHERE ${whereClause}
    `;
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult[0].total;

    // Get products (lightweight - only essential fields)
    const query = `
      SELECT 
        p.id,
        p.designation,
        p.designation_ar,
        p.designation_en,
        p.designation_zh,
        p.prix_vente,
        p.pourcentage_promo,
        p.remise_client,
        p.remise_artisan,
        p.image_url,
        COALESCE(p.stock_partage_ecom_qty, 0) as stock_qty,
        p.has_variants,
        p.is_obligatoire_variant,
        p.base_unit,
        p.categorie_base,
        b.id as brand_id,
        b.nom as brand_nom,
        b.image_url as brand_image_url,
        c.id as categorie_id,
        c.nom as categorie_nom,
        c.nom_ar as categorie_nom_ar,
        c.nom_en as categorie_nom_en,
        c.nom_zh as categorie_nom_zh
      FROM products p
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN categories c ON p.categorie_id = c.id
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;

    params.push(itemsPerPage, offset);
    const [rows] = await pool.query(query, params);

    // Get wishlist status for authenticated users
    const userId = req.user?.id;
    let wishlistProductIds = new Set();

    console.log('🔍 Products GET / - Auth check:', {
      hasReqUser: !!req.user,
      userId: userId,
      authHeader: req.headers['authorization'] ? 'Present' : 'Missing'
    });

    if (userId) {
      const productIds = rows.map(r => r.id);
      if (productIds.length > 0) {
        const [wishlistItems] = await pool.query(`
          SELECT product_id, variant_id
          FROM wishlist_items
          WHERE user_id = ? AND product_id IN (${productIds.map(() => '?').join(',')})
        `, [userId, ...productIds]);

        console.log('📋 Wishlist items found:', {
          userId: userId,
          productIdsChecked: productIds,
          wishlistItemsCount: wishlistItems.length,
          wishlistItems: wishlistItems
        });

        // Store product_id for quick lookup (variant_id not checked here for simplicity)
        wishlistItems.forEach(item => {
          wishlistProductIds.add(item.product_id);
        });

        console.log('✅ Wishlisted product IDs:', Array.from(wishlistProductIds));
      }
    }

    // Fetch additional data for each product (images, variants preview, units)
    const products = await Promise.all(rows.map(async (r) => {
      // Calculate promo price
      const originalPrice = Number(r.prix_vente);
      const promoPercentage = Number(r.pourcentage_promo || 0);
      const promoPrice = promoPercentage > 0 
        ? originalPrice * (1 - promoPercentage / 100) 
        : null;

      // Get product gallery images (first 3 for preview)
      const [galleryImages] = await pool.query(`
        SELECT id, image_url, position
        FROM product_images
        WHERE product_id = ?
        ORDER BY position ASC
        LIMIT 3
      `, [r.id]);

      // Get variants if product has them
      let variants = [];
      let colors = [];
      let sizes = [];
      let otherVariants = [];

      if (r.has_variants) {
        const [variantsData] = await pool.query(`
          SELECT 
            id,
            variant_name,
            variant_type,
            prix_vente,
            remise_client,
            remise_artisan,
            stock_quantity,
            image_url
          FROM product_variants
          WHERE product_id = ?
          ORDER BY variant_type, variant_name
        `, [r.id]);

        variantsData.forEach(v => {
          const variantObj = {
            id: v.id,
            name: v.variant_name,
            type: v.variant_type,
            prix_vente: Number(v.prix_vente),
            remise_client: Number(v.remise_client || 0),
            remise_artisan: Number(v.remise_artisan || 0),
            available: isInStock(v.stock_quantity),
            image_url: v.image_url
          };

          variants.push(variantObj);

          // Group by type for easy frontend access
          if (v.variant_type === 'Couleur') {
            colors.push({
              id: v.id,
              name: v.variant_name,
              image_url: v.image_url,
              available: isInStock(v.stock_quantity)
            });
          } else if (v.variant_type === 'Taille' || v.variant_type === 'Dimension') {
            sizes.push({
              id: v.id,
              name: v.variant_name,
              available: isInStock(v.stock_quantity)
            });
          } else {
            otherVariants.push({
              id: v.id,
              name: v.variant_name,
              type: v.variant_type,
              available: isInStock(v.stock_quantity)
            });
          }
        });
      }

      // Get product units
      const [unitsData] = await pool.query(`
        SELECT 
          id,
          unit_name,
          conversion_factor,
          is_default
        FROM product_units
        WHERE product_id = ?
        ORDER BY is_default DESC, unit_name
      `, [r.id]);

      const units = unitsData.map(u => ({
        id: u.id,
        name: u.unit_name,
        conversion_factor: Number(u.conversion_factor),
        prix_vente: originalPrice * Number(u.conversion_factor || 1),
        is_default: !!u.is_default
      }));

      return {
        id: r.id,
        reference: String(r.id),
        designation: r.designation,
        designation_ar: r.designation_ar,
        designation_en: r.designation_en,
        designation_zh: r.designation_zh,
        prix_vente: originalPrice,
        prix_promo: promoPrice,
        pourcentage_promo: promoPercentage,
        remise_client: Number(r.remise_client || 0),
        remise_artisan: Number(r.remise_artisan || 0),
        has_promo: promoPercentage > 0,
        image_url: r.image_url,
        gallery: galleryImages.map(img => ({
          id: img.id,
          image_url: img.image_url,
          position: img.position
        })),
        in_stock: isInStock(r.stock_qty),
        purchase_limit: PURCHASE_LIMIT,
        has_variants: !!r.has_variants,
        is_obligatoire_variant: Number(r.is_obligatoire_variant || 0) === 1,
        isObligatoireVariant: Number(r.is_obligatoire_variant || 0) === 1,
        base_unit: r.base_unit,
        categorie_base: r.categorie_base,
        
        // Variants grouped by type for easy frontend use
        variants: {
          all: variants,
          colors: colors.length > 0 ? colors : null,
          sizes: sizes.length > 0 ? sizes : null,
          other: otherVariants.length > 0 ? otherVariants : null
        },
        
        // Units
        units: units.length > 0 ? units : null,
        
        brand: r.brand_id ? {
          id: r.brand_id,
          nom: r.brand_nom,
          image_url: r.brand_image_url
        } : null,
        categorie: r.categorie_id ? {
          id: r.categorie_id,
          nom: r.categorie_nom,
          nom_ar: r.categorie_nom_ar,
          nom_en: r.categorie_nom_en,
          nom_zh: r.categorie_nom_zh
        } : null,

        // Wishlist status (only if user is authenticated)
        is_wishlisted: userId ? wishlistProductIds.has(r.id) : null
      };
    }));

    // ===== GET FILTER METADATA =====
    // 1. Get ALL categories hierarchy (for header menu + filters)
    const [allCategories] = await pool.query(`
      SELECT id, nom, nom_ar, nom_en, nom_zh, parent_id
      FROM categories
      ORDER BY parent_id, nom
    `);

    // Build category tree
    const categoryMap = {};
    const rootCategories = [];

    allCategories.forEach(cat => {
      categoryMap[cat.id] = {
        id: cat.id,
        nom: cat.nom,
        nom_ar: cat.nom_ar,
        nom_en: cat.nom_en,
        nom_zh: cat.nom_zh,
        parent_id: cat.parent_id,
        children: []
      };
    });

    allCategories.forEach(cat => {
      if (cat.parent_id === null) {
        rootCategories.push(categoryMap[cat.id]);
      } else if (categoryMap[cat.parent_id]) {
        categoryMap[cat.parent_id].children.push(categoryMap[cat.id]);
      }
    });

    // 2. Get all available colors (from variants)
    const [allColors] = await pool.query(`
      SELECT DISTINCT pv.variant_name as color
      FROM product_variants pv
      INNER JOIN products p ON p.id = pv.product_id
      WHERE pv.variant_type = 'Couleur'
        AND p.ecom_published = 1
        AND COALESCE(p.is_deleted, 0) = 0
        AND (p.stock_partage_ecom_qty > 0 OR pv.stock_quantity > 0)
      ORDER BY pv.variant_name
    `);

    // 3. Get all available units
    const [allUnits] = await pool.query(`
      SELECT DISTINCT pu.unit_name as unit
      FROM product_units pu
      INNER JOIN products p ON p.id = pu.product_id
      WHERE p.ecom_published = 1
        AND COALESCE(p.is_deleted, 0) = 0
        AND (p.stock_partage_ecom_qty > 0 OR p.has_variants = 1)
      ORDER BY pu.unit_name
    `);

    // 4. Get ALL brands (for header nav + filters)
    const [allBrands] = await pool.query(`
      SELECT id, nom, image_url
      FROM brands
      ORDER BY nom
    `);

    // 5. Get price range
    const [priceRange] = await pool.query(`
      SELECT 
        MIN(prix_vente) as min_price,
        MAX(prix_vente) as max_price
      FROM products
      WHERE ecom_published = 1
        AND COALESCE(is_deleted, 0) = 0
        AND (stock_partage_ecom_qty > 0 OR has_variants = 1)
    `);

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / itemsPerPage);
    
    const brands = allBrands.map(b => ({
      id: b.id,
      nom: b.nom,
      image_url: b.image_url
    }));

    res.json({
      products,
      pagination: {
        current_page: currentPage,
        per_page: itemsPerPage,
        total_items: total,
        total_pages: totalPages,
        has_previous: currentPage > 1,
        has_next: currentPage < totalPages,
        from: total > 0 ? offset + 1 : 0,
        to: Math.min(offset + itemsPerPage, total)
      },
      // Alias for frontend convenience
      brands,
      filters: {
        categories: rootCategories,
        colors: allColors.map(c => c.color),
        units: allUnits.map(u => u.unit),
        brands,
        price_range: {
          min: priceRange[0].min_price ? Number(priceRange[0].min_price) : 0,
          max: priceRange[0].max_price ? Number(priceRange[0].max_price) : 0
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

// ==================== GET SINGLE PRODUCT (FULL DETAILS) ====================
// GET /api/ecommerce/products/:id - Get complete product details with similar products
router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    // Get main product with full details
    const [rows] = await pool.query(`
      SELECT 
        p.*,
        b.id as brand_id,
        b.nom as brand_nom,
        b.description as brand_description,
        b.image_url as brand_image_url
      FROM products p
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE p.id = ?
        AND p.ecom_published = 1
        AND COALESCE(p.is_deleted, 0) = 0
    `, [id]);

    if (!rows.length) {
      return res.status(404).json({ message: 'Produit introuvable ou non disponible' });
    }

    const r = rows[0];

    // Check if product is wishlisted for authenticated users
    const userId = req.user?.id;
    let isWishlisted = null;

    if (userId) {
      const [wishlistItems] = await pool.query(`
        SELECT id
        FROM wishlist_items
        WHERE user_id = ? AND product_id = ? AND variant_id IS NULL
      `, [userId, id]);

      isWishlisted = wishlistItems.length > 0;
    }

    // Get product gallery images
    const [gallery] = await pool.query(`
      SELECT id, image_url, position
      FROM product_images
      WHERE product_id = ?
      ORDER BY position ASC
    `, [id]);

    // Get product category
    const [categories] = await pool.query(`
      SELECT c.id, c.nom, c.nom_ar, c.nom_en, c.nom_zh, c.parent_id
      FROM categories c
      WHERE c.id = ?
    `, [r.categorie_id]);

    // Get product variants (only if has_variants is true)
    let variants = [];
    if (r.has_variants) {
      const [variantsResult] = await pool.query(`
        SELECT 
          id,
          variant_name,
          variant_type,
          reference,
          prix_vente,
          remise_client,
          remise_artisan,
          stock_quantity,
          image_url
        FROM product_variants
        WHERE product_id = ?
        ORDER BY variant_name
      `, [id]);
      
      // Get variant images for each variant
      for (const v of variantsResult) {
        const [variantImages] = await pool.query(`
          SELECT id, image_url, position
          FROM variant_images
          WHERE variant_id = ?
          ORDER BY position ASC
        `, [v.id]);
        
        variants.push({
          id: v.id,
          variant_name: v.variant_name,
          variant_type: v.variant_type,
          reference: v.reference,
          prix_vente: Number(v.prix_vente),
          remise_client: Number(v.remise_client || 0),
          remise_artisan: Number(v.remise_artisan || 0),
          available: isInStock(v.stock_quantity),
          image_url: v.image_url,
          gallery: variantImages.map(img => ({
            id: img.id,
            image_url: img.image_url,
            position: img.position
          }))
        });
      }
    }

    // Calculate promo price
    const originalPrice = Number(r.prix_vente);
    const promoPercentage = Number(r.pourcentage_promo || 0);
    const promoPrice = promoPercentage > 0 
      ? originalPrice * (1 - promoPercentage / 100) 
      : null;

    // Get product units
    const [units] = await pool.query(`
      SELECT 
        id,
        unit_name,
        conversion_factor,
        is_default
      FROM product_units
      WHERE product_id = ?
      ORDER BY is_default DESC, unit_name
    `, [id]);

    const productUnits = units.map(u => ({
      id: u.id,
      unit_name: u.unit_name,
      conversion_factor: Number(u.conversion_factor),
      prix_vente: originalPrice * Number(u.conversion_factor || 1),
      is_default: !!u.is_default
    }));

    // Get smart product suggestions based on category, brand, and promotions
    let suggestions = [];

    // Build smart suggestions with scoring algorithm
    const categoryId = r.categorie_id;
    const brandId = r.brand_id;

    if (categoryId || brandId) {
      const categoryPlaceholder = categoryId ? '?' : 'NULL';
      const brandPlaceholder = brandId ? '?' : 'NULL';

      const suggestionsQuery = `
        SELECT 
          p.id,
          p.designation,
          p.designation_ar,
          p.designation_en,
          p.designation_zh,
          p.prix_vente,
          p.pourcentage_promo,
          p.remise_client,
          p.remise_artisan,
          p.image_url,
          p.stock_partage_ecom_qty,
          p.has_variants,
          p.categorie_id,
          p.brand_id,
          b.nom as brand_nom,
          c.nom as categorie_nom,
          c.nom_ar as categorie_nom_ar,
          c.nom_en as categorie_nom_en,
          c.nom_zh as categorie_nom_zh,
          (
            CASE WHEN p.categorie_id = ${categoryPlaceholder} THEN 10 ELSE 0 END +
            CASE WHEN p.brand_id = ${brandPlaceholder} THEN 5 ELSE 0 END +
            CASE WHEN p.pourcentage_promo > 0 THEN 3 ELSE 0 END
          ) as relevance_score
        FROM products p
        LEFT JOIN brands b ON p.brand_id = b.id
        LEFT JOIN categories c ON p.categorie_id = c.id
        WHERE p.ecom_published = 1
          AND COALESCE(p.is_deleted, 0) = 0
          AND p.stock_partage_ecom_qty > 0
          AND p.id != ?
        ORDER BY relevance_score DESC, p.created_at DESC
        LIMIT 8
      `;

      const queryParams = [];
      if (categoryId) queryParams.push(categoryId);
      if (brandId) queryParams.push(brandId);
      queryParams.push(id); // Exclude current product

      const [suggestedProducts] = await pool.query(suggestionsQuery, queryParams);

      // Get wishlist status for suggestions
      let suggestionsWishlistIds = new Set();
      if (userId && suggestedProducts.length > 0) {
        const suggestionProductIds = suggestedProducts.map(sp => sp.id);
        const [suggestionsWishlistItems] = await pool.query(`
          SELECT product_id
          FROM wishlist_items
          WHERE user_id = ? AND product_id IN (${suggestionProductIds.map(() => '?').join(',')})
        `, [userId, ...suggestionProductIds]);

        suggestionsWishlistItems.forEach(item => {
          suggestionsWishlistIds.add(item.product_id);
        });
      }

      suggestions = await Promise.all(suggestedProducts.map(async (sp) => {
        const spPromoPercentage = Number(sp.pourcentage_promo || 0);
        const spOriginalPrice = Number(sp.prix_vente);
        const spPromoPrice = spPromoPercentage > 0 
          ? spOriginalPrice * (1 - spPromoPercentage / 100) 
          : null;

        // Get first gallery image
        const [galleryImages] = await pool.query(`
          SELECT id, image_url, position
          FROM product_images
          WHERE product_id = ?
          ORDER BY position ASC
          LIMIT 1
        `, [sp.id]);

        return {
          id: sp.id,
          reference: String(sp.id),
          designation: sp.designation,
          designation_ar: sp.designation_ar,
          designation_en: sp.designation_en,
          designation_zh: sp.designation_zh,
          prix_vente: spOriginalPrice,
          prix_promo: spPromoPrice,
          pourcentage_promo: spPromoPercentage,
          remise_client: Number(sp.remise_client || 0),
          remise_artisan: Number(sp.remise_artisan || 0),
          has_promo: spPromoPercentage > 0,
          image_url: sp.image_url,
          gallery: galleryImages.map(img => ({
            id: img.id,
            image_url: img.image_url,
            position: img.position
          })),
          in_stock: isInStock(sp.stock_partage_ecom_qty),
          purchase_limit: PURCHASE_LIMIT,
          has_variants: !!sp.has_variants,
          brand: sp.brand_id ? {
            id: sp.brand_id,
            nom: sp.brand_nom
          } : null,
          categorie: sp.categorie_id ? {
            id: sp.categorie_id,
            nom: sp.categorie_nom,
            nom_ar: sp.categorie_nom_ar,
            nom_en: sp.categorie_nom_en,
            nom_zh: sp.categorie_nom_zh
          } : null,
          relevance_score: Number(sp.relevance_score),
          suggestion_reason: sp.relevance_score >= 15 ? 'same_category_and_brand' :
            sp.relevance_score >= 10 ? 'same_category' :
              sp.relevance_score >= 5 ? 'same_brand' :
                sp.relevance_score >= 3 ? 'on_promotion' : 'popular',
          is_wishlisted: userId ? suggestionsWishlistIds.has(sp.id) : null
        };
      }));
    }

    // Build complete product response
    const product = {
      id: r.id,
      reference: String(r.id),
      designation: r.designation,
      designation_ar: r.designation_ar,
      designation_en: r.designation_en,
      designation_zh: r.designation_zh,
      
      // Pricing
      prix_vente: originalPrice,
      prix_promo: promoPrice,
      pourcentage_promo: promoPercentage,
      remise_client: Number(r.remise_client || 0),
      remise_artisan: Number(r.remise_artisan || 0),
      has_promo: promoPercentage > 0,
      
      // Stock
      in_stock: isInStock(r.stock_partage_ecom_qty),
      purchase_limit: PURCHASE_LIMIT,
      
      // Images & Media
      image_url: r.image_url,
      gallery: gallery.map(img => ({
        id: img.id,
        image_url: img.image_url,
        position: img.position
      })),
      
      // Descriptions
      description: r.description,
      description_ar: r.description_ar,
      description_en: r.description_en,
      description_zh: r.description_zh,
      
      // Technical specifications
      fiche_technique: r.fiche_technique,
      // Backward-compatible alias: French is stored in the base column
      fiche_technique_fr: r.fiche_technique,
      fiche_technique_ar: r.fiche_technique_ar,
      fiche_technique_en: r.fiche_technique_en,
      fiche_technique_zh: r.fiche_technique_zh,
      
      // Product specs
      kg: r.kg !== null && r.kg !== undefined ? Number(r.kg) : null,
      est_service: !!r.est_service,
      base_unit: r.base_unit,
      categorie_base: r.categorie_base,
      
      // Brand
      brand: r.brand_id ? {
        id: r.brand_id,
        nom: r.brand_nom,
        description: r.brand_description,
        image_url: r.brand_image_url
      } : null,
      
      // Category (single)
      categorie: categories.length > 0 ? {
        id: categories[0].id,
        nom: categories[0].nom,
        nom_ar: categories[0].nom_ar,
        nom_en: categories[0].nom_en,
        nom_zh: categories[0].nom_zh,
        parent_id: categories[0].parent_id
      } : null,
      
      // Variants & Units
      has_variants: !!r.has_variants,
      is_obligatoire_variant: Number(r.is_obligatoire_variant || 0) === 1,
      isObligatoireVariant: Number(r.is_obligatoire_variant || 0) === 1,
      variants,
      units: productUnits,
      
      // Product suggestions (smart recommendations based on category, brand, and promotions)
      suggestions: suggestions,
      
      // Wishlist status (only if user is authenticated)
      is_wishlisted: isWishlisted,

      // Metadata
      created_at: r.created_at,
      updated_at: r.updated_at
    };

    res.json(product);
  } catch (err) {
    next(err);
  }
});

// ==================== GET FEATURED/PROMO PRODUCTS ====================
// GET /api/ecommerce/products/featured/promo - Get products with active promotions
router.get('/featured/promo', async (req, res, next) => {
  try {
    const { limit = 12 } = req.query;

    const [rows] = await pool.query(`
      SELECT 
        p.id,
        p.designation,
        p.designation_ar,
        p.designation_en,
        p.designation_zh,
        p.prix_vente,
        p.pourcentage_promo,
        p.remise_client,
        p.remise_artisan,
        p.image_url,
        COALESCE(p.stock_partage_ecom_qty, 0) as stock_qty,
        p.has_variants,
        p.is_obligatoire_variant,
        b.nom as brand_nom
      FROM products p
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE p.ecom_published = 1
        AND COALESCE(p.is_deleted, 0) = 0
        AND p.stock_partage_ecom_qty > 0
        AND p.pourcentage_promo > 0
      ORDER BY p.pourcentage_promo DESC, p.created_at DESC
      LIMIT ?
    `, [Number(limit)]);

    // Get wishlist status for authenticated users
    const userId = req.user?.id;
    let wishlistProductIds = new Set();

    if (userId && rows.length > 0) {
      const productIds = rows.map(r => r.id);
      const [wishlistItems] = await pool.query(`
        SELECT product_id
        FROM wishlist_items
        WHERE user_id = ? AND product_id IN (${productIds.map(() => '?').join(',')})
      `, [userId, ...productIds]);

      wishlistItems.forEach(item => {
        wishlistProductIds.add(item.product_id);
      });
    }

    const products = await Promise.all(rows.map(async (r) => {
      const originalPrice = Number(r.prix_vente);
      const promoPercentage = Number(r.pourcentage_promo);
      const promoPrice = originalPrice * (1 - promoPercentage / 100);

      // Get product gallery images (first 2)
      const [galleryImages] = await pool.query(`
        SELECT id, image_url, position
        FROM product_images
        WHERE product_id = ?
        ORDER BY position ASC
        LIMIT 2
      `, [r.id]);

      return {
        id: r.id,
        reference: String(r.id),
        designation: r.designation,
        designation_ar: r.designation_ar,
        designation_en: r.designation_en,
        designation_zh: r.designation_zh,
        prix_vente: originalPrice,
        prix_promo: promoPrice,
        pourcentage_promo: promoPercentage,
        remise_client: Number(r.remise_client || 0),
        remise_artisan: Number(r.remise_artisan || 0),
        in_stock: isInStock(r.stock_qty),
        purchase_limit: PURCHASE_LIMIT,
        image_url: r.image_url,
        gallery: galleryImages.map(img => ({
          id: img.id,
          image_url: img.image_url,
          position: img.position
        })),
        has_variants: !!r.has_variants,
        is_obligatoire_variant: Number(r.is_obligatoire_variant || 0) === 1,
        isObligatoireVariant: Number(r.is_obligatoire_variant || 0) === 1,
        brand_nom: r.brand_nom,
        is_wishlisted: userId ? wishlistProductIds.has(r.id) : null
      };
    }));

    res.json(products);
  } catch (err) {
    next(err);
  }
});

// ==================== GET NEW ARRIVALS ====================
// GET /api/ecommerce/products/featured/new - Get newest products
router.get('/featured/new', async (req, res, next) => {
  try {
    const { limit = 12 } = req.query;

    const [rows] = await pool.query(`
      SELECT 
        p.id,
        p.designation,
        p.designation_ar,
        p.designation_en,
        p.designation_zh,
        p.prix_vente,
        p.pourcentage_promo,
        p.remise_client,
        p.remise_artisan,
        p.image_url,
        COALESCE(p.stock_partage_ecom_qty, 0) as stock_qty,
        p.has_variants,
        p.is_obligatoire_variant,
        b.nom as brand_nom
      FROM products p
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE p.ecom_published = 1
        AND COALESCE(p.is_deleted, 0) = 0
        AND p.stock_partage_ecom_qty > 0
      ORDER BY p.created_at DESC
      LIMIT ?
    `, [Number(limit)]);

    // Get wishlist status for authenticated users
    const userId = req.user?.id;
    let wishlistProductIds = new Set();

    if (userId && rows.length > 0) {
      const productIds = rows.map(r => r.id);
      const [wishlistItems] = await pool.query(`
        SELECT product_id
        FROM wishlist_items
        WHERE user_id = ? AND product_id IN (${productIds.map(() => '?').join(',')})
      `, [userId, ...productIds]);

      wishlistItems.forEach(item => {
        wishlistProductIds.add(item.product_id);
      });
    }

    const products = await Promise.all(rows.map(async (r) => {
      const originalPrice = Number(r.prix_vente);
      const promoPercentage = Number(r.pourcentage_promo || 0);
      const promoPrice = promoPercentage > 0 
        ? originalPrice * (1 - promoPercentage / 100) 
        : null;

      // Get product gallery images (first 2)
      const [galleryImages] = await pool.query(`
        SELECT id, image_url, position
        FROM product_images
        WHERE product_id = ?
        ORDER BY position ASC
        LIMIT 2
      `, [r.id]);

      return {
        id: r.id,
        reference: String(r.id),
        designation: r.designation,
        designation_ar: r.designation_ar,
        designation_en: r.designation_en,
        designation_zh: r.designation_zh,
        prix_vente: originalPrice,
        prix_promo: promoPrice,
        pourcentage_promo: promoPercentage,
        remise_client: Number(r.remise_client || 0),
        remise_artisan: Number(r.remise_artisan || 0),
        has_promo: promoPercentage > 0,
        in_stock: isInStock(r.stock_qty),
        purchase_limit: PURCHASE_LIMIT,
        image_url: r.image_url,
        gallery: galleryImages.map(img => ({
          id: img.id,
          image_url: img.image_url,
          position: img.position
        })),
        has_variants: !!r.has_variants,
        is_obligatoire_variant: Number(r.is_obligatoire_variant || 0) === 1,
        isObligatoireVariant: Number(r.is_obligatoire_variant || 0) === 1,
        brand_nom: r.brand_nom,
        is_wishlisted: userId ? wishlistProductIds.has(r.id) : null
      };
    }));

    res.json(products);
  } catch (err) {
    next(err);
  }
});

export default router;