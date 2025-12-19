import { Router } from 'express';
import pool from '../../db/pool.js';

const router = Router();

// Generate unique order number
function generateOrderNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}

// ==================== CREATE ORDER (CHECKOUT) ====================
// POST /api/ecommerce/orders - Create order from cart or direct items
router.post('/', async (req, res, next) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const {
      // Customer info (required for both guest and authenticated)
      customer_name,
      customer_email,
      customer_phone,
      
      // Shipping address (required)
      shipping_address_line1,
      shipping_address_line2,
      shipping_city,
      shipping_state,
      shipping_postal_code,
      shipping_country = 'Morocco',
      
      // Order details
      payment_method = 'cash_on_delivery', // 'cash_on_delivery', 'card', 'bank_transfer'
      customer_notes,
      
      // Items can come from cart or be provided directly
      use_cart = true, // If true, use user's cart; if false, use items array
      items = [] // For guest checkout or direct order: [{product_id, variant_id?, unit_id?, quantity}]
    } = req.body;

    // Validate required fields
    if (!customer_name || !customer_email || !shipping_address_line1 || !shipping_city) {
      await connection.rollback();
      return res.status(400).json({ 
        message: 'Informations requises manquantes',
        required: ['customer_name', 'customer_email', 'shipping_address_line1', 'shipping_city']
      });
    }

    const userId = req.user?.id || null; // NULL for guest orders
    let orderItems = [];

    // Get items from cart (authenticated users) or from request body (guest)
    if (use_cart && userId) {
      // Get items from user's cart
      const [cartItems] = await connection.query(`
        SELECT 
          ci.id as cart_item_id,
          ci.product_id,
          ci.variant_id,
          ci.unit_id,
          ci.quantity,
          p.designation,
          p.designation_ar,
          p.prix_vente as base_price,
          p.pourcentage_promo,
          p.stock_partage_ecom_qty,
          p.ecom_published,
          p.is_deleted,
          pv.variant_name,
          pv.variant_type,
          pv.prix_vente as variant_price,
          pv.stock_quantity as variant_stock,
          pu.unit_name,
          pu.prix_vente as unit_price
        FROM cart_items ci
        INNER JOIN products p ON ci.product_id = p.id
        LEFT JOIN product_variants pv ON ci.variant_id = pv.id
        LEFT JOIN product_units pu ON ci.unit_id = pu.id
        WHERE ci.user_id = ?
      `, [userId]);

      if (cartItems.length === 0) {
        await connection.rollback();
        return res.status(400).json({ message: 'Panier vide' });
      }

      orderItems = cartItems;
    } else {
      // Guest checkout or direct items
      if (!items || items.length === 0) {
        await connection.rollback();
        return res.status(400).json({ message: 'Aucun article fourni' });
      }

      // Fetch product details for provided items
      for (const item of items) {
        const [productRows] = await connection.query(`
          SELECT 
            p.id as product_id,
            p.designation,
            p.designation_ar,
            p.prix_vente as base_price,
            p.pourcentage_promo,
            p.stock_partage_ecom_qty,
            p.ecom_published,
            p.is_deleted,
            pv.variant_name,
            pv.variant_type,
            pv.prix_vente as variant_price,
            pv.stock_quantity as variant_stock,
            pu.unit_name,
            pu.prix_vente as unit_price
          FROM products p
          LEFT JOIN product_variants pv ON pv.id = ? AND pv.product_id = p.id
          LEFT JOIN product_units pu ON pu.id = ? AND pu.product_id = p.id
          WHERE p.id = ?
        `, [item.variant_id || null, item.unit_id || null, item.product_id]);

        if (productRows.length === 0) {
          await connection.rollback();
          return res.status(400).json({ 
            message: `Produit introuvable: ${item.product_id}` 
          });
        }

        orderItems.push({
          ...productRows[0],
          variant_id: item.variant_id || null,
          unit_id: item.unit_id || null,
          quantity: item.quantity
        });
      }
    }

    // Validate all items and calculate totals
    let subtotal = 0;
    const validatedItems = [];

    for (const item of orderItems) {
      // Check if product is published and not deleted
      if (!item.ecom_published || item.is_deleted) {
        await connection.rollback();
        return res.status(400).json({ 
          message: `Produit non disponible: ${item.designation}` 
        });
      }

      // Determine effective price
      let unitPrice = Number(item.base_price);
      if (item.variant_id && item.variant_price !== null) {
        unitPrice = Number(item.variant_price);
      } else if (item.unit_id && item.unit_price !== null) {
        unitPrice = Number(item.unit_price);
      }

      // Apply promo
      const promoPercentage = Number(item.pourcentage_promo || 0);
      const priceAfterPromo = promoPercentage > 0 
        ? unitPrice * (1 - promoPercentage / 100)
        : unitPrice;

      // Check stock availability
      const availableStock = item.variant_id 
        ? Number(item.variant_stock || 0)
        : Number(item.stock_partage_ecom_qty || 0);

      if (Number(item.quantity) > availableStock) {
        await connection.rollback();
        return res.status(400).json({ 
          message: `Stock insuffisant pour ${item.designation}`,
          available: availableStock,
          requested: Number(item.quantity)
        });
      }

      const itemSubtotal = priceAfterPromo * Number(item.quantity);
      const discountAmount = promoPercentage > 0 
        ? (unitPrice - priceAfterPromo) * Number(item.quantity)
        : 0;

      subtotal += itemSubtotal;

      validatedItems.push({
        product_id: item.product_id,
        variant_id: item.variant_id,
        unit_id: item.unit_id,
        product_name: item.designation,
        product_name_ar: item.designation_ar,
        variant_name: item.variant_name,
        variant_type: item.variant_type,
        unit_name: item.unit_name,
        unit_price: priceAfterPromo,
        quantity: Number(item.quantity),
        subtotal: itemSubtotal,
        discount_percentage: promoPercentage,
        discount_amount: discountAmount
      });
    }

    // Calculate totals (you can add tax/shipping calculation here)
    const taxAmount = 0; // TODO: Calculate tax if needed
    const shippingCost = 0; // TODO: Calculate shipping if needed
    const discountAmount = validatedItems.reduce((sum, item) => sum + item.discount_amount, 0);
    const totalAmount = subtotal + taxAmount + shippingCost;

    // Create order
    const orderNumber = generateOrderNumber();
    
    const [orderResult] = await connection.query(`
      INSERT INTO ecommerce_orders (
        order_number,
        user_id,
        customer_email,
        customer_phone,
        customer_name,
        shipping_address_line1,
        shipping_address_line2,
        shipping_city,
        shipping_state,
        shipping_postal_code,
        shipping_country,
        subtotal,
        tax_amount,
        shipping_cost,
        discount_amount,
        total_amount,
        status,
        payment_status,
        payment_method,
        customer_notes,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?, ?, NOW())
    `, [
      orderNumber,
      userId,
      customer_email,
      customer_phone,
      customer_name,
      shipping_address_line1,
      shipping_address_line2 || null,
      shipping_city,
      shipping_state || null,
      shipping_postal_code || null,
      shipping_country,
      subtotal,
      taxAmount,
      shippingCost,
      discountAmount,
      totalAmount,
      payment_method,
      customer_notes || null
    ]);

    const orderId = orderResult.insertId;

    // Insert order items and reduce stock
    for (const item of validatedItems) {
      // Insert order item
      await connection.query(`
        INSERT INTO ecommerce_order_items (
          order_id,
          product_id,
          variant_id,
          unit_id,
          product_name,
          product_name_ar,
          variant_name,
          variant_type,
          unit_name,
          unit_price,
          quantity,
          subtotal,
          discount_percentage,
          discount_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        orderId,
        item.product_id,
        item.variant_id,
        item.unit_id,
        item.product_name,
        item.product_name_ar,
        item.variant_name,
        item.variant_type,
        item.unit_name,
        item.unit_price,
        item.quantity,
        item.subtotal,
        item.discount_percentage,
        item.discount_amount
      ]);

      // **REDUCE STOCK** - This is where the stock reduction happens
      if (item.variant_id) {
        // Reduce variant stock
        await connection.query(`
          UPDATE product_variants
          SET stock_quantity = stock_quantity - ?
          WHERE id = ?
        `, [item.quantity, item.variant_id]);
      } else {
        // Reduce main product stock
        await connection.query(`
          UPDATE products
          SET stock_partage_ecom_qty = stock_partage_ecom_qty - ?
          WHERE id = ?
        `, [item.quantity, item.product_id]);
      }
    }

    // Log initial status
    await connection.query(`
      INSERT INTO ecommerce_order_status_history (
        order_id,
        old_status,
        new_status,
        changed_by_type,
        notes
      ) VALUES (?, NULL, 'pending', 'customer', 'Order created')
    `, [orderId]);

    // Clear user's cart if order was from cart
    if (use_cart && userId) {
      await connection.query(`
        DELETE FROM cart_items WHERE user_id = ?
      `, [userId]);
    }

    await connection.commit();

    res.status(201).json({
      message: 'Commande créée avec succès',
      order: {
        id: orderId,
        order_number: orderNumber,
        total_amount: totalAmount,
        status: 'pending',
        payment_status: 'pending',
        payment_method: payment_method,
        items_count: validatedItems.length
      }
    });

  } catch (err) {
    await connection.rollback();
    next(err);
  } finally {
    connection.release();
  }
});

// ==================== GET USER ORDERS ====================
// GET /api/ecommerce/orders - Get current user's order history
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { email } = req.query; // Allow guest to fetch by email

    if (!userId && !email) {
      return res.status(401).json({ 
        message: 'Authentification requise ou email nécessaire' 
      });
    }

    let query = `
      SELECT 
        o.id,
        o.order_number,
        o.customer_name,
        o.customer_email,
        o.total_amount,
        o.status,
        o.payment_status,
        o.payment_method,
        o.created_at,
        o.confirmed_at,
        o.shipped_at,
        o.delivered_at,
        COUNT(oi.id) as items_count
      FROM ecommerce_orders o
      LEFT JOIN ecommerce_order_items oi ON o.id = oi.order_id
      WHERE ${userId ? 'o.user_id = ?' : 'o.customer_email = ?'}
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `;

    const [orders] = await pool.query(query, [userId || email]);

    res.json({
      orders: orders.map(order => ({
        id: order.id,
        order_number: order.order_number,
        customer_name: order.customer_name,
        customer_email: order.customer_email,
        total_amount: Number(order.total_amount),
        status: order.status,
        payment_status: order.payment_status,
        payment_method: order.payment_method,
        items_count: Number(order.items_count),
        created_at: order.created_at,
        confirmed_at: order.confirmed_at,
        shipped_at: order.shipped_at,
        delivered_at: order.delivered_at
      })),
      total: orders.length
    });
  } catch (err) {
    next(err);
  }
});

// ==================== GET SINGLE ORDER ====================
// GET /api/ecommerce/orders/:id - Get order details
router.get('/:id', async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);
    const userId = req.user?.id;
    const { email } = req.query; // Allow guest to fetch by email

    // Get order
    const [orders] = await pool.query(`
      SELECT *
      FROM ecommerce_orders
      WHERE id = ?
    `, [orderId]);

    if (orders.length === 0) {
      return res.status(404).json({ message: 'Commande introuvable' });
    }

    const order = orders[0];

    // Verify ownership (user_id match or email match)
    if (userId && order.user_id !== userId) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    if (!userId && email && order.customer_email !== email) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    if (!userId && !email) {
      return res.status(401).json({ message: 'Authentification requise' });
    }

    // Get order items
    const [items] = await pool.query(`
      SELECT 
        id,
        product_id,
        variant_id,
        unit_id,
        product_name,
        product_name_ar,
        variant_name,
        variant_type,
        unit_name,
        unit_price,
        quantity,
        subtotal,
        discount_percentage,
        discount_amount
      FROM ecommerce_order_items
      WHERE order_id = ?
      ORDER BY id
    `, [orderId]);

    // Get status history
    const [history] = await pool.query(`
      SELECT 
        old_status,
        new_status,
        changed_by_type,
        notes,
        created_at
      FROM ecommerce_order_status_history
      WHERE order_id = ?
      ORDER BY created_at ASC
    `, [orderId]);

    res.json({
      order: {
        id: order.id,
        order_number: order.order_number,
        
        // Customer
        customer_name: order.customer_name,
        customer_email: order.customer_email,
        customer_phone: order.customer_phone,
        
        // Shipping
        shipping_address: {
          line1: order.shipping_address_line1,
          line2: order.shipping_address_line2,
          city: order.shipping_city,
          state: order.shipping_state,
          postal_code: order.shipping_postal_code,
          country: order.shipping_country
        },
        
        // Totals
        subtotal: Number(order.subtotal),
        tax_amount: Number(order.tax_amount),
        shipping_cost: Number(order.shipping_cost),
        discount_amount: Number(order.discount_amount),
        total_amount: Number(order.total_amount),
        
        // Status
        status: order.status,
        payment_status: order.payment_status,
        payment_method: order.payment_method,
        
        // Notes
        customer_notes: order.customer_notes,
        admin_notes: order.admin_notes,
        
        // Dates
        created_at: order.created_at,
        updated_at: order.updated_at,
        confirmed_at: order.confirmed_at,
        shipped_at: order.shipped_at,
        delivered_at: order.delivered_at,
        cancelled_at: order.cancelled_at,
        
        // Items
        items: items.map(item => ({
          id: item.id,
          product_id: item.product_id,
          variant_id: item.variant_id,
          unit_id: item.unit_id,
          product_name: item.product_name,
          product_name_ar: item.product_name_ar,
          variant_name: item.variant_name,
          variant_type: item.variant_type,
          unit_name: item.unit_name,
          unit_price: Number(item.unit_price),
          quantity: Number(item.quantity),
          subtotal: Number(item.subtotal),
          discount_percentage: Number(item.discount_percentage),
          discount_amount: Number(item.discount_amount)
        })),
        
        // Status history
        status_history: history.map(h => ({
          old_status: h.old_status,
          new_status: h.new_status,
          changed_by: h.changed_by_type,
          notes: h.notes,
          timestamp: h.created_at
        }))
      }
    });
  } catch (err) {
    next(err);
  }
});

// ==================== UPDATE ORDER STATUS (ADMIN/SYSTEM) ====================
// PUT /api/ecommerce/orders/:id/status - Update order status
router.put('/:id/status', async (req, res, next) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const orderId = Number(req.params.id);
    const { status, payment_status, admin_notes } = req.body;
    const userId = req.user?.id; // Admin/employee ID

    // Get current order
    const [orders] = await connection.query(`
      SELECT status, payment_status
      FROM ecommerce_orders
      WHERE id = ?
    `, [orderId]);

    if (orders.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Commande introuvable' });
    }

    const currentOrder = orders[0];
    const updates = [];
    const params = [];

    // Update status if provided
    if (status && status !== currentOrder.status) {
      updates.push('status = ?');
      params.push(status);

      // Update timestamp based on status
      if (status === 'confirmed') {
        updates.push('confirmed_at = NOW()');
      } else if (status === 'shipped') {
        updates.push('shipped_at = NOW()');
      } else if (status === 'delivered') {
        updates.push('delivered_at = NOW()');
      } else if (status === 'cancelled') {
        updates.push('cancelled_at = NOW()');
      }

      // Log status change
      await connection.query(`
        INSERT INTO ecommerce_order_status_history (
          order_id,
          old_status,
          new_status,
          changed_by_type,
          notes
        ) VALUES (?, ?, ?, 'admin', ?)
      `, [orderId, currentOrder.status, status, admin_notes || `Status changed to ${status}`]);
    }

    // Update payment status if provided
    if (payment_status && payment_status !== currentOrder.payment_status) {
      updates.push('payment_status = ?');
      params.push(payment_status);
    }

    // Update admin notes if provided
    if (admin_notes) {
      updates.push('admin_notes = ?');
      params.push(admin_notes);
    }

    if (updates.length === 0) {
      await connection.rollback();
      return res.status(400).json({ message: 'Aucune mise à jour fournie' });
    }

    // Perform update
    params.push(orderId);
    await connection.query(`
      UPDATE ecommerce_orders
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = ?
    `, params);

    await connection.commit();

    res.json({
      message: 'Commande mise à jour avec succès',
      order_id: orderId,
      status: status || currentOrder.status,
      payment_status: payment_status || currentOrder.payment_status
    });

  } catch (err) {
    await connection.rollback();
    next(err);
  } finally {
    connection.release();
  }
});

// ==================== CANCEL ORDER ====================
// POST /api/ecommerce/orders/:id/cancel - Cancel order (restore stock)
router.post('/:id/cancel', async (req, res, next) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const orderId = Number(req.params.id);
    const userId = req.user?.id;
    const { email, reason } = req.body;

    // Get order
    const [orders] = await connection.query(`
      SELECT *
      FROM ecommerce_orders
      WHERE id = ?
    `, [orderId]);

    if (orders.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Commande introuvable' });
    }

    const order = orders[0];

    // Verify ownership
    if (userId && order.user_id !== userId) {
      await connection.rollback();
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    if (!userId && email && order.customer_email !== email) {
      await connection.rollback();
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    // Check if order can be cancelled
    if (['shipped', 'delivered', 'cancelled'].includes(order.status)) {
      await connection.rollback();
      return res.status(400).json({ 
        message: `Impossible d'annuler une commande ${order.status}` 
      });
    }

    // Get order items to restore stock
    const [items] = await connection.query(`
      SELECT product_id, variant_id, quantity
      FROM ecommerce_order_items
      WHERE order_id = ?
    `, [orderId]);

    // Restore stock for each item
    for (const item of items) {
      if (item.variant_id) {
        await connection.query(`
          UPDATE product_variants
          SET stock_quantity = stock_quantity + ?
          WHERE id = ?
        `, [item.quantity, item.variant_id]);
      } else {
        await connection.query(`
          UPDATE products
          SET stock_partage_ecom_qty = stock_partage_ecom_qty + ?
          WHERE id = ?
        `, [item.quantity, item.product_id]);
      }
    }

    // Update order status
    await connection.query(`
      UPDATE ecommerce_orders
      SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
      WHERE id = ?
    `, [orderId]);

    // Log cancellation
    await connection.query(`
      INSERT INTO ecommerce_order_status_history (
        order_id,
        old_status,
        new_status,
        changed_by_type,
        notes
      ) VALUES (?, ?, 'cancelled', 'customer', ?)
    `, [orderId, order.status, reason || 'Order cancelled by customer']);

    await connection.commit();

    res.json({
      message: 'Commande annulée avec succès',
      order_id: orderId,
      order_number: order.order_number
    });

  } catch (err) {
    await connection.rollback();
    next(err);
  } finally {
    connection.release();
  }
});

export default router;
