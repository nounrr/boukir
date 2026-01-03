import { Router } from 'express';
import pool from '../../db/pool.js';

const router = Router();

// ==================== GET USER WISHLIST ====================
// GET /api/ecommerce/wishlist - Get current user's wishlist with all items
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    // Get all wishlist items for this user
    const [wishlistItems] = await pool.query(`
      SELECT 
        w.id,
        w.product_id,
        w.variant_id,
        w.created_at,
        p.designation,
        p.designation_ar,
        p.designation_en,
        p.designation_zh,
        p.prix_vente as base_price,
        p.pourcentage_promo,
        p.remise_client,
        p.remise_artisan,
        p.image_url,
        p.stock_partage_ecom_qty,
        p.has_variants,
        p.base_unit,
        p.ecom_published,
        p.is_deleted,
        pv.variant_name,
        pv.variant_type,
        pv.prix_vente as variant_price,
        pv.stock_quantity as variant_stock,
        pv.image_url as variant_image_url,
        pv.remise_client as variant_remise_client,
        pv.remise_artisan as variant_remise_artisan
      FROM wishlist_items w
      INNER JOIN products p ON w.product_id = p.id
      LEFT JOIN product_variants pv ON w.variant_id = pv.id
      WHERE w.user_id = ?
      ORDER BY w.created_at DESC
    `, [userId]);

    // Process each wishlist item
    const items = wishlistItems.map(item => {
      // Check availability
      const isAvailable = item.ecom_published === 1 && (item.is_deleted === 0 || item.is_deleted === null);

      // Determine effective price based on variant
      let effectivePrice = Number(item.base_price);
      let effectiveRemiseClient = Number(item.remise_client || 0);
      let effectiveRemiseArtisan = Number(item.remise_artisan || 0);
      
      // If variant is selected, use variant price
      if (item.variant_id && item.variant_price !== null) {
        effectivePrice = Number(item.variant_price);
        effectiveRemiseClient = Number(item.variant_remise_client || 0);
        effectiveRemiseArtisan = Number(item.variant_remise_artisan || 0);
      }

      // Apply promo
      const promoPercentage = Number(item.pourcentage_promo || 0);
      const priceAfterPromo = promoPercentage > 0 
        ? effectivePrice * (1 - promoPercentage / 100)
        : effectivePrice;

      // Calculate stock availability
      let availableStock;
      if (item.variant_id) {
        availableStock = Number(item.variant_stock || 0);
      } else {
        availableStock = Number(item.stock_partage_ecom_qty || 0);
      }

      const inStock = availableStock > 0;

      return {
        id: item.id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        product: {
          designation: item.designation,
          designation_ar: item.designation_ar,
          designation_en: item.designation_en,
          designation_zh: item.designation_zh,
          image_url: item.variant_image_url || item.image_url,
          has_variants: !!item.has_variants,
          base_unit: item.base_unit,
          is_available: isAvailable
        },
        variant: item.variant_id ? {
          id: item.variant_id,
          name: item.variant_name,
          type: item.variant_type,
          image_url: item.variant_image_url
        } : null,
        pricing: {
          base_price: Number(item.base_price),
          effective_price: effectivePrice,
          promo_percentage: promoPercentage,
          price_after_promo: priceAfterPromo,
          remise_client: effectiveRemiseClient,
          remise_artisan: effectiveRemiseArtisan,
          has_promo: promoPercentage > 0
        },
        stock: {
          available: availableStock,
          in_stock: inStock
        },
        created_at: item.created_at
      };
    });

    // Calculate summary
    const availableItems = items.filter(item => item.product.is_available);
    const inStockItems = items.filter(item => item.stock.in_stock);

    res.json({
      items,
      summary: {
        total_items: items.length,
        available_items: availableItems.length,
        in_stock_items: inStockItems.length,
        unavailable_items: items.length - availableItems.length
      }
    });
  } catch (err) {
    next(err);
  }
});

// ==================== GET PRODUCT SUGGESTIONS ====================
// GET /api/ecommerce/wishlist/suggestions - Get 4 personalized product suggestions
router.get('/suggestions', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    const limit = Math.min(Number(req.query.limit) || 4, 12); // Max 12 suggestions

    // Get user's wishlist items
    const [wishlistItems] = await pool.query(`
      SELECT product_id
      FROM wishlist_items
      WHERE user_id = ?
    `, [userId]);

    const wishlistedProductIds = wishlistItems.map(item => item.product_id);
    let suggestions = [];

    if (wishlistItems.length > 0) {
      // ===== PERSONALIZED SUGGESTIONS BASED ON WISHLIST =====

      // Analyze user's wishlist patterns - top categories
      const [categoryAnalysis] = await pool.query(`
        SELECT 
          p.categorie_id,
          COUNT(*) as count
        FROM wishlist_items w
        INNER JOIN products p ON w.product_id = p.id
        WHERE w.user_id = ? AND p.categorie_id IS NOT NULL
        GROUP BY p.categorie_id
        ORDER BY count DESC
        LIMIT 3
      `, [userId]);

      // Analyze user's wishlist patterns - top brands
      const [brandAnalysis] = await pool.query(`
        SELECT 
          p.brand_id,
          COUNT(*) as count
        FROM wishlist_items w
        INNER JOIN products p ON w.product_id = p.id
        WHERE w.user_id = ? AND p.brand_id IS NOT NULL
        GROUP BY p.brand_id
        ORDER BY count DESC
        LIMIT 3
      `, [userId]);

      const topCategoryIds = categoryAnalysis.map(c => c.categorie_id);
      const topBrandIds = brandAnalysis.map(b => b.brand_id);

      // Build smart suggestions query with scoring
      const categoryPlaceholders = topCategoryIds.length > 0 ? topCategoryIds.map(() => '?').join(',') : 'NULL';
      const brandPlaceholders = topBrandIds.length > 0 ? topBrandIds.map(() => '?').join(',') : 'NULL';
      const wishlistPlaceholders = wishlistedProductIds.length > 0 ? wishlistedProductIds.map(() => '?').join(',') : 'NULL';

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
          (
            CASE WHEN p.categorie_id IN (${categoryPlaceholders}) THEN 10 ELSE 0 END +
            CASE WHEN p.brand_id IN (${brandPlaceholders}) THEN 5 ELSE 0 END +
            CASE WHEN p.pourcentage_promo > 0 THEN 3 ELSE 0 END
          ) as relevance_score
        FROM products p
        LEFT JOIN brands b ON p.brand_id = b.id
        LEFT JOIN categories c ON p.categorie_id = c.id
        WHERE p.ecom_published = 1
          AND COALESCE(p.is_deleted, 0) = 0
          AND p.stock_partage_ecom_qty > 0
          ${wishlistedProductIds.length > 0 ? `AND p.id NOT IN (${wishlistPlaceholders})` : ''}
        ORDER BY relevance_score DESC, p.created_at DESC
        LIMIT ?
      `;

      const queryParams = [
        ...topCategoryIds,
        ...topBrandIds,
        ...(wishlistedProductIds.length > 0 ? wishlistedProductIds : []),
        limit
      ];

      const [suggestedProducts] = await pool.query(suggestionsQuery, queryParams);

      suggestions = await Promise.all(suggestedProducts.map(async (p) => {
        const originalPrice = Number(p.prix_vente);
        const promoPercentage = Number(p.pourcentage_promo || 0);
        const promoPrice = promoPercentage > 0
          ? originalPrice * (1 - promoPercentage / 100)
          : null;

        // Get first gallery image
        const [galleryImages] = await pool.query(`
          SELECT id, image_url, position
          FROM product_images
          WHERE product_id = ?
          ORDER BY position ASC
          LIMIT 1
        `, [p.id]);

        return {
          id: p.id,
          designation: p.designation,
          designation_ar: p.designation_ar,
          designation_en: p.designation_en,
          designation_zh: p.designation_zh,
          prix_vente: originalPrice,
          prix_promo: promoPrice,
          pourcentage_promo: promoPercentage,
          remise_client: Number(p.remise_client || 0),
          remise_artisan: Number(p.remise_artisan || 0),
          has_promo: promoPercentage > 0,
          image_url: p.image_url,
          gallery: galleryImages.map(img => ({
            id: img.id,
            image_url: img.image_url,
            position: img.position
          })),
          quantite_disponible: Number(p.stock_partage_ecom_qty),
          has_variants: !!p.has_variants,
          brand: p.brand_id ? {
            id: p.brand_id,
            nom: p.brand_nom
          } : null,
          categorie: p.categorie_id ? {
            id: p.categorie_id,
            nom: p.categorie_nom
          } : null,
          relevance_score: Number(p.relevance_score),
          suggestion_reason: p.relevance_score >= 15 ? 'same_category_and_brand' :
            p.relevance_score >= 10 ? 'same_category' :
              p.relevance_score >= 5 ? 'same_brand' :
                p.relevance_score >= 3 ? 'on_promotion' : 'popular'
        };
      }));
    } else {
      // ===== GENERAL SUGGESTIONS (NO WISHLIST YET) =====

      const [popularProducts] = await pool.query(`
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
          b.id as brand_id,
          b.nom as brand_nom,
          c.id as categorie_id,
          c.nom as categorie_nom
        FROM products p
        LEFT JOIN brands b ON p.brand_id = b.id
        LEFT JOIN categories c ON p.categorie_id = c.id
        WHERE p.ecom_published = 1
          AND COALESCE(p.is_deleted, 0) = 0
          AND p.stock_partage_ecom_qty > 0
        ORDER BY 
          CASE WHEN p.pourcentage_promo > 0 THEN 1 ELSE 2 END,
          p.pourcentage_promo DESC,
          p.created_at DESC
        LIMIT ?
      `, [limit]);

      suggestions = await Promise.all(popularProducts.map(async (p) => {
        const originalPrice = Number(p.prix_vente);
        const promoPercentage = Number(p.pourcentage_promo || 0);
        const promoPrice = promoPercentage > 0
          ? originalPrice * (1 - promoPercentage / 100)
          : null;

        const [galleryImages] = await pool.query(`
          SELECT id, image_url, position
          FROM product_images
          WHERE product_id = ?
          ORDER BY position ASC
          LIMIT 1
        `, [p.id]);

        return {
          id: p.id,
          designation: p.designation,
          designation_ar: p.designation_ar,
          designation_en: p.designation_en,
          designation_zh: p.designation_zh,
          prix_vente: originalPrice,
          prix_promo: promoPrice,
          pourcentage_promo: promoPercentage,
          remise_client: Number(p.remise_client || 0),
          remise_artisan: Number(p.remise_artisan || 0),
          has_promo: promoPercentage > 0,
          image_url: p.image_url,
          gallery: galleryImages.map(img => ({
            id: img.id,
            image_url: img.image_url,
            position: img.position
          })),
          quantite_disponible: Number(p.stock_partage_ecom_qty),
          has_variants: !!p.has_variants,
          brand: p.brand_id ? {
            id: p.brand_id,
            nom: p.brand_nom
          } : null,
          categorie: p.categorie_id ? {
            id: p.categorie_id,
            nom: p.categorie_nom
          } : null,
          suggestion_reason: promoPercentage > 0 ? 'on_promotion' : 'new_arrival'
        };
      }));
    }

    res.json({
      suggestions,
      suggestion_type: wishlistItems.length > 0 ? 'personalized' : 'popular',
      based_on_wishlist_items: wishlistItems.length,
      total_suggestions: suggestions.length
    });
  } catch (err) {
    next(err);
  }
});

// ==================== ADD ITEM TO WISHLIST ====================
// POST /api/ecommerce/wishlist/items - Add item to wishlist
router.post('/items', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    const { product_id, variant_id = null } = req.body;

    // Validate inputs
    if (!product_id) {
      return res.status(400).json({ message: 'product_id est requis' });
    }

    const productId = Number(product_id);
    const variantId = variant_id ? Number(variant_id) : null;

    // Check if product exists
    const [productRows] = await pool.query(`
      SELECT 
        id,
        designation,
        ecom_published,
        is_deleted
      FROM products
      WHERE id = ?
    `, [productId]);

    if (!productRows.length) {
      return res.status(404).json({ message: 'Produit introuvable' });
    }

    const product = productRows[0];

    if (!product.ecom_published || product.is_deleted) {
      return res.status(400).json({ message: 'Ce produit n\'est pas disponible' });
    }

    // Validate variant if provided
    if (variantId) {
      const [variantRows] = await pool.query(`
        SELECT id
        FROM product_variants
        WHERE id = ? AND product_id = ?
      `, [variantId, productId]);

      if (!variantRows.length) {
        return res.status(400).json({ message: 'Variante invalide' });
      }
    }

    // Check if item already exists in wishlist
    const [existingItems] = await pool.query(`
      SELECT id
      FROM wishlist_items
      WHERE user_id = ?
        AND product_id = ?
        AND (variant_id = ? OR (variant_id IS NULL AND ? IS NULL))
    `, [userId, productId, variantId, variantId]);

    if (existingItems.length > 0) {
      return res.status(409).json({ 
        message: 'Cet article est déjà dans votre liste de souhaits',
        wishlist_item_id: existingItems[0].id
      });
    }

    // Add item to wishlist
    const [result] = await pool.query(`
      INSERT INTO wishlist_items (user_id, product_id, variant_id, created_at)
      VALUES (?, ?, ?, NOW())
    `, [userId, productId, variantId]);

    res.status(201).json({
      message: 'Article ajouté à la liste de souhaits',
      wishlist_item_id: result.insertId
    });
  } catch (err) {
    next(err);
  }
});

// ==================== REMOVE ITEM FROM WISHLIST ====================
// DELETE /api/ecommerce/wishlist/items/:id - Remove item from wishlist
router.delete('/items/:id', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    const wishlistItemId = Number(req.params.id);

    // Check if item belongs to user
    const [wishlistItems] = await pool.query(`
      SELECT id
      FROM wishlist_items
      WHERE id = ? AND user_id = ?
    `, [wishlistItemId, userId]);

    if (!wishlistItems.length) {
      return res.status(404).json({ message: 'Article non trouvé dans la liste de souhaits' });
    }

    // Delete item
    await pool.query(`
      DELETE FROM wishlist_items
      WHERE id = ?
    `, [wishlistItemId]);

    res.json({
      message: 'Article retiré de la liste de souhaits',
      wishlist_item_id: wishlistItemId
    });
  } catch (err) {
    next(err);
  }
});

// ==================== REMOVE ITEM BY PRODUCT ====================
// DELETE /api/ecommerce/wishlist/products/:productId - Remove item by product_id (and optional variant_id)
router.delete('/products/:productId', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    const productId = Number(req.params.productId);
    const variantId = req.query.variant_id ? Number(req.query.variant_id) : null;

    // Find and delete matching item
    let query, params;
    
    if (variantId) {
      query = `
        DELETE FROM wishlist_items
        WHERE user_id = ? AND product_id = ? AND variant_id = ?
      `;
      params = [userId, productId, variantId];
    } else {
      query = `
        DELETE FROM wishlist_items
        WHERE user_id = ? AND product_id = ? AND variant_id IS NULL
      `;
      params = [userId, productId];
    }

    const [result] = await pool.query(query, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Article non trouvé dans la liste de souhaits' });
    }

    res.json({
      message: 'Article retiré de la liste de souhaits',
      product_id: productId,
      variant_id: variantId
    });
  } catch (err) {
    next(err);
  }
});

// ==================== CLEAR WISHLIST ====================
// DELETE /api/ecommerce/wishlist - Clear all items from wishlist
router.delete('/', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    const [result] = await pool.query(`
      DELETE FROM wishlist_items
      WHERE user_id = ?
    `, [userId]);

    res.json({
      message: 'Liste de souhaits vidée',
      items_removed: result.affectedRows
    });
  } catch (err) {
    next(err);
  }
});

// ==================== CHECK IF ITEM IN WISHLIST ====================
// GET /api/ecommerce/wishlist/check/:productId - Check if product is in wishlist
router.get('/check/:productId', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    const productId = Number(req.params.productId);
    const variantId = req.query.variant_id ? Number(req.query.variant_id) : null;

    let query, params;
    
    if (variantId) {
      query = `
        SELECT id
        FROM wishlist_items
        WHERE user_id = ? AND product_id = ? AND variant_id = ?
      `;
      params = [userId, productId, variantId];
    } else {
      query = `
        SELECT id
        FROM wishlist_items
        WHERE user_id = ? AND product_id = ? AND variant_id IS NULL
      `;
      params = [userId, productId];
    }

    const [items] = await pool.query(query, params);

    res.json({
      in_wishlist: items.length > 0,
      wishlist_item_id: items.length > 0 ? items[0].id : null
    });
  } catch (err) {
    next(err);
  }
});

// ==================== MOVE ITEM TO CART ====================
// POST /api/ecommerce/wishlist/items/:id/move-to-cart - Move wishlist item to cart
router.post('/items/:id/move-to-cart', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    const wishlistItemId = Number(req.params.id);
    const { quantity = 1, unit_id = null } = req.body;

    const qty = Math.max(1, Number(quantity));
    const unitId = unit_id ? Number(unit_id) : null;

    // Get wishlist item
    const [wishlistItems] = await pool.query(`
      SELECT 
        w.product_id,
        w.variant_id,
        p.stock_partage_ecom_qty,
        p.ecom_published,
        p.is_deleted,
        pv.stock_quantity as variant_stock
      FROM wishlist_items w
      INNER JOIN products p ON w.product_id = p.id
      LEFT JOIN product_variants pv ON w.variant_id = pv.id
      WHERE w.id = ? AND w.user_id = ?
    `, [wishlistItemId, userId]);

    if (!wishlistItems.length) {
      return res.status(404).json({ message: 'Article non trouvé dans la liste de souhaits' });
    }

    const item = wishlistItems[0];

    // Check product availability
    if (!item.ecom_published || item.is_deleted) {
      return res.status(400).json({ message: 'Ce produit n\'est plus disponible' });
    }

    // Check stock
    const availableStock = item.variant_id 
      ? Number(item.variant_stock || 0)
      : Number(item.stock_partage_ecom_qty || 0);

    if (qty > availableStock) {
      return res.status(400).json({ 
        message: 'Quantité non disponible en stock',
        available_stock: availableStock,
        requested_quantity: qty
      });
    }

    // Check if item already exists in cart
    const [existingCartItems] = await pool.query(`
      SELECT id, quantity
      FROM cart_items
      WHERE user_id = ?
        AND product_id = ?
        AND (variant_id = ? OR (variant_id IS NULL AND ? IS NULL))
        AND (unit_id = ? OR (unit_id IS NULL AND ? IS NULL))
    `, [userId, item.product_id, item.variant_id, item.variant_id, unitId, unitId]);

    if (existingCartItems.length > 0) {
      // Update existing cart item
      const existingCartItem = existingCartItems[0];
      const newQuantity = Number(existingCartItem.quantity) + qty;

      if (newQuantity > availableStock) {
        return res.status(400).json({ 
          message: 'Quantité totale non disponible en stock',
          available_stock: availableStock,
          requested_quantity: newQuantity
        });
      }

      await pool.query(`
        UPDATE cart_items
        SET quantity = ?, updated_at = NOW()
        WHERE id = ?
      `, [newQuantity, existingCartItem.id]);

      // Remove from wishlist
      await pool.query(`
        DELETE FROM wishlist_items
        WHERE id = ?
      `, [wishlistItemId]);

      return res.json({
        message: 'Article ajouté au panier et retiré de la liste de souhaits',
        cart_item_id: existingCartItem.id,
        quantity: newQuantity,
        action: 'updated'
      });
    } else {
      // Add new item to cart
      const [cartResult] = await pool.query(`
        INSERT INTO cart_items (user_id, product_id, variant_id, unit_id, quantity, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, NOW(), NOW())
      `, [userId, item.product_id, item.variant_id, unitId, qty]);

      // Remove from wishlist
      await pool.query(`
        DELETE FROM wishlist_items
        WHERE id = ?
      `, [wishlistItemId]);

      return res.status(201).json({
        message: 'Article ajouté au panier et retiré de la liste de souhaits',
        cart_item_id: cartResult.insertId,
        quantity: qty,
        action: 'added'
      });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
