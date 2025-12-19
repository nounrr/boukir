import { Router } from 'express';
import pool from '../../db/pool.js';

const router = Router();

// ==================== GET USER CART ====================
// GET /api/ecommerce/cart - Get current user's cart with all items
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    // Get all cart items for this user
    const [cartItems] = await pool.query(`
      SELECT 
        ci.id,
        ci.product_id,
        ci.variant_id,
        ci.unit_id,
        ci.quantity,
        ci.created_at,
        ci.updated_at,
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
        pv.variant_name,
        pv.variant_type,
        pv.prix_vente as variant_price,
        pv.stock_quantity as variant_stock,
        pv.image_url as variant_image_url,
        pv.remise_client as variant_remise_client,
        pv.remise_artisan as variant_remise_artisan,
        pu.unit_name,
        pu.conversion_factor,
        pu.prix_vente as unit_price
      FROM cart_items ci
      INNER JOIN products p ON ci.product_id = p.id
      LEFT JOIN product_variants pv ON ci.variant_id = pv.id
      LEFT JOIN product_units pu ON ci.unit_id = pu.id
      WHERE ci.user_id = ?
        AND p.ecom_published = 1
        AND COALESCE(p.is_deleted, 0) = 0
      ORDER BY ci.created_at DESC
    `, [userId]);

    // Process each cart item
    const items = cartItems.map(item => {
      // Determine effective price based on variant/unit
      let effectivePrice = Number(item.base_price);
      let effectiveRemiseClient = Number(item.remise_client || 0);
      let effectiveRemiseArtisan = Number(item.remise_artisan || 0);
      
      // If variant is selected, use variant price
      if (item.variant_id && item.variant_price !== null) {
        effectivePrice = Number(item.variant_price);
        effectiveRemiseClient = Number(item.variant_remise_client || 0);
        effectiveRemiseArtisan = Number(item.variant_remise_artisan || 0);
      }
      // If unit is selected and has custom price, use unit price
      else if (item.unit_id && item.unit_price !== null) {
        effectivePrice = Number(item.unit_price);
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

      // Check if requested quantity is available
      const isAvailable = availableStock >= Number(item.quantity);
      const maxQuantity = availableStock;

      // Calculate subtotal
      const quantity = Number(item.quantity);
      const subtotal = priceAfterPromo * quantity;

      return {
        id: item.id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        unit_id: item.unit_id,
        quantity: quantity,
        product: {
          designation: item.designation,
          designation_ar: item.designation_ar,
          designation_en: item.designation_en,
          designation_zh: item.designation_zh,
          image_url: item.variant_image_url || item.image_url,
          has_variants: !!item.has_variants,
          base_unit: item.base_unit
        },
        variant: item.variant_id ? {
          id: item.variant_id,
          name: item.variant_name,
          type: item.variant_type,
          image_url: item.variant_image_url
        } : null,
        unit: item.unit_id ? {
          id: item.unit_id,
          name: item.unit_name,
          conversion_factor: Number(item.conversion_factor)
        } : null,
        pricing: {
          base_price: Number(item.base_price),
          effective_price: effectivePrice,
          promo_percentage: promoPercentage,
          price_after_promo: priceAfterPromo,
          remise_client: effectiveRemiseClient,
          remise_artisan: effectiveRemiseArtisan,
          has_promo: promoPercentage > 0,
          subtotal: subtotal
        },
        stock: {
          available: availableStock,
          is_available: isAvailable,
          max_quantity: maxQuantity
        },
        created_at: item.created_at,
        updated_at: item.updated_at
      };
    });

    // Calculate cart totals
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + item.pricing.subtotal, 0);
    
    // Check if all items are available
    const allItemsAvailable = items.every(item => item.stock.is_available);
    const unavailableItems = items.filter(item => !item.stock.is_available);

    res.json({
      items,
      summary: {
        total_items: totalItems,
        unique_items: items.length,
        subtotal: subtotal,
        all_items_available: allItemsAvailable,
        unavailable_count: unavailableItems.length
      }
    });
  } catch (err) {
    next(err);
  }
});

// ==================== GET CART SUMMARY ====================
// GET /api/ecommerce/cart/summary - Get quick cart summary (lightweight)
router.get('/summary', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    const [result] = await pool.query(`
      SELECT 
        COUNT(*) as unique_items,
        SUM(ci.quantity) as total_items
      FROM cart_items ci
      INNER JOIN products p ON ci.product_id = p.id
      WHERE ci.user_id = ?
        AND p.ecom_published = 1
        AND COALESCE(p.is_deleted, 0) = 0
    `, [userId]);

    res.json({
      unique_items: Number(result[0].unique_items || 0),
      total_items: Number(result[0].total_items || 0)
    });
  } catch (err) {
    next(err);
  }
});

// ==================== ADD ITEM TO CART ====================
// POST /api/ecommerce/cart/items - Add item to cart or update quantity
router.post('/items', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    const { product_id, variant_id = null, unit_id = null, quantity = 1 } = req.body;

    // Validate inputs
    if (!product_id) {
      return res.status(400).json({ message: 'product_id est requis' });
    }

    const productId = Number(product_id);
    const variantId = variant_id ? Number(variant_id) : null;
    const unitId = unit_id ? Number(unit_id) : null;
    const qty = Math.max(1, Number(quantity));

    // Check if product exists and is published
    const [productRows] = await pool.query(`
      SELECT 
        id,
        designation,
        ecom_published,
        is_deleted,
        stock_partage_ecom_qty,
        has_variants,
        prix_vente,
        pourcentage_promo
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
    let availableStock = Number(product.stock_partage_ecom_qty);
    if (variantId) {
      const [variantRows] = await pool.query(`
        SELECT stock_quantity
        FROM product_variants
        WHERE id = ? AND product_id = ?
      `, [variantId, productId]);

      if (!variantRows.length) {
        return res.status(400).json({ message: 'Variante invalide' });
      }

      availableStock = Number(variantRows[0].stock_quantity);
    }

    // Validate unit if provided
    if (unitId) {
      const [unitRows] = await pool.query(`
        SELECT id
        FROM product_units
        WHERE id = ? AND product_id = ?
      `, [unitId, productId]);

      if (!unitRows.length) {
        return res.status(400).json({ message: 'Unité invalide' });
      }
    }

    // Check if item already exists in cart (same product, variant, and unit)
    const [existingItems] = await pool.query(`
      SELECT id, quantity
      FROM cart_items
      WHERE user_id = ?
        AND product_id = ?
        AND (variant_id = ? OR (variant_id IS NULL AND ? IS NULL))
        AND (unit_id = ? OR (unit_id IS NULL AND ? IS NULL))
    `, [userId, productId, variantId, variantId, unitId, unitId]);

    if (existingItems.length > 0) {
      // Update existing cart item
      const existingItem = existingItems[0];
      const newQuantity = Number(existingItem.quantity) + qty;

      // Check stock availability
      if (newQuantity > availableStock) {
        return res.status(400).json({ 
          message: 'Quantité non disponible en stock',
          available_stock: availableStock,
          requested_quantity: newQuantity
        });
      }

      await pool.query(`
        UPDATE cart_items
        SET quantity = ?, updated_at = NOW()
        WHERE id = ?
      `, [newQuantity, existingItem.id]);

      return res.json({
        message: 'Quantité mise à jour',
        cart_item_id: existingItem.id,
        quantity: newQuantity,
        action: 'updated'
      });
    } else {
      // Add new item to cart
      // Check stock availability
      if (qty > availableStock) {
        return res.status(400).json({ 
          message: 'Quantité non disponible en stock',
          available_stock: availableStock,
          requested_quantity: qty
        });
      }

      const [result] = await pool.query(`
        INSERT INTO cart_items (user_id, product_id, variant_id, unit_id, quantity, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, NOW(), NOW())
      `, [userId, productId, variantId, unitId, qty]);

      return res.status(201).json({
        message: 'Article ajouté au panier',
        cart_item_id: result.insertId,
        quantity: qty,
        action: 'added'
      });
    }
  } catch (err) {
    next(err);
  }
});

// ==================== UPDATE CART ITEM QUANTITY ====================
// PUT /api/ecommerce/cart/items/:id - Update cart item quantity
router.put('/items/:id', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    const cartItemId = Number(req.params.id);
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ message: 'Quantité invalide' });
    }

    const qty = Number(quantity);

    // Get cart item with product/variant info
    const [cartItems] = await pool.query(`
      SELECT 
        ci.id,
        ci.product_id,
        ci.variant_id,
        ci.quantity as current_quantity,
        p.stock_partage_ecom_qty,
        pv.stock_quantity as variant_stock
      FROM cart_items ci
      INNER JOIN products p ON ci.product_id = p.id
      LEFT JOIN product_variants pv ON ci.variant_id = pv.id
      WHERE ci.id = ? AND ci.user_id = ?
    `, [cartItemId, userId]);

    if (!cartItems.length) {
      return res.status(404).json({ message: 'Article non trouvé dans le panier' });
    }

    const cartItem = cartItems[0];

    // Determine available stock
    const availableStock = cartItem.variant_id 
      ? Number(cartItem.variant_stock || 0)
      : Number(cartItem.stock_partage_ecom_qty || 0);

    // Check stock availability
    if (qty > availableStock) {
      return res.status(400).json({ 
        message: 'Quantité non disponible en stock',
        available_stock: availableStock,
        requested_quantity: qty
      });
    }

    // Update quantity
    await pool.query(`
      UPDATE cart_items
      SET quantity = ?, updated_at = NOW()
      WHERE id = ?
    `, [qty, cartItemId]);

    res.json({
      message: 'Quantité mise à jour',
      cart_item_id: cartItemId,
      old_quantity: Number(cartItem.current_quantity),
      new_quantity: qty
    });
  } catch (err) {
    next(err);
  }
});

// ==================== REMOVE ITEM FROM CART ====================
// DELETE /api/ecommerce/cart/items/:id - Remove item from cart
router.delete('/items/:id', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    const cartItemId = Number(req.params.id);

    // Check if item belongs to user
    const [cartItems] = await pool.query(`
      SELECT id
      FROM cart_items
      WHERE id = ? AND user_id = ?
    `, [cartItemId, userId]);

    if (!cartItems.length) {
      return res.status(404).json({ message: 'Article non trouvé dans le panier' });
    }

    // Delete item
    await pool.query(`
      DELETE FROM cart_items
      WHERE id = ?
    `, [cartItemId]);

    res.json({
      message: 'Article retiré du panier',
      cart_item_id: cartItemId
    });
  } catch (err) {
    next(err);
  }
});

// ==================== CLEAR CART ====================
// DELETE /api/ecommerce/cart - Clear all items from cart
router.delete('/', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    const [result] = await pool.query(`
      DELETE FROM cart_items
      WHERE user_id = ?
    `, [userId]);

    res.json({
      message: 'Panier vidé',
      items_removed: result.affectedRows
    });
  } catch (err) {
    next(err);
  }
});

// ==================== VALIDATE CART ====================
// POST /api/ecommerce/cart/validate - Validate cart before checkout
router.post('/validate', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    // Get all cart items with stock info
    const [cartItems] = await pool.query(`
      SELECT 
        ci.id,
        ci.product_id,
        ci.variant_id,
        ci.quantity,
        p.designation,
        p.ecom_published,
        p.is_deleted,
        p.stock_partage_ecom_qty,
        pv.stock_quantity as variant_stock,
        pv.variant_name
      FROM cart_items ci
      INNER JOIN products p ON ci.product_id = p.id
      LEFT JOIN product_variants pv ON ci.variant_id = pv.id
      WHERE ci.user_id = ?
    `, [userId]);

    if (cartItems.length === 0) {
      return res.status(400).json({ 
        valid: false,
        message: 'Panier vide'
      });
    }

    const issues = [];

    for (const item of cartItems) {
      // Check if product is still published
      if (!item.ecom_published || item.is_deleted) {
        issues.push({
          cart_item_id: item.id,
          product_id: item.product_id,
          issue: 'product_unavailable',
          message: `${item.designation} n'est plus disponible`
        });
        continue;
      }

      // Check stock availability
      const availableStock = item.variant_id 
        ? Number(item.variant_stock || 0)
        : Number(item.stock_partage_ecom_qty || 0);

      if (Number(item.quantity) > availableStock) {
        const itemName = item.variant_id 
          ? `${item.designation} (${item.variant_name})`
          : item.designation;

        issues.push({
          cart_item_id: item.id,
          product_id: item.product_id,
          variant_id: item.variant_id,
          issue: 'insufficient_stock',
          message: `${itemName}: seulement ${availableStock} disponible(s)`,
          requested_quantity: Number(item.quantity),
          available_stock: availableStock
        });
      }
    }

    const isValid = issues.length === 0;

    res.json({
      valid: isValid,
      total_items: cartItems.length,
      issues: issues,
      message: isValid 
        ? 'Panier valide' 
        : `${issues.length} problème(s) détecté(s)`
    });
  } catch (err) {
    next(err);
  }
});

export default router;
