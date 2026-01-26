import { Router } from 'express';
import pool from '../../db/pool.js';
import {
  computeOrderItemRemiseBreakdown,
  ensureContactsCheckoutColumns,
  ensureContactsRemiseBalance,
  ensureEcommerceOrderItemsRemiseColumns,
  ensureEcommerceOrdersRemiseColumns,
  ensureProductRemiseColumns
} from '../../utils/ensureRemiseSchema.js';

async function ensureRemiseSchema() {
  try {
    await ensureProductRemiseColumns(pool);
    await ensureContactsRemiseBalance(pool);
    await ensureContactsCheckoutColumns(pool);
    await ensureEcommerceOrdersRemiseColumns(pool);
    await ensureEcommerceOrderItemsRemiseColumns(pool);
  } catch (e) {
    console.error('ensureRemiseSchema:', e);
  }
}
ensureRemiseSchema();

const router = Router();

function splitFullName(fullName) {
  const name = String(fullName || '').trim().replace(/\s+/g, ' ');
  if (!name) return { prenom: null, nom: null, nom_complet: null };
  const parts = name.split(' ');
  const prenom = parts[0] || null;
  const nom = parts.length > 1 ? parts.slice(1).join(' ') : null;
  return { prenom, nom, nom_complet: name };
}

function formatContactAdresse({ shipping_address_line1, shipping_address_line2 }) {
  return [shipping_address_line1, shipping_address_line2]
    .filter((v) => v != null && String(v).trim() !== '')
    .map((v) => String(v).trim())
    .join('\n');
}

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

    // Safety: never accept raw card details in this API.
    // If you integrate card payments, only send a provider token/intent id.
    const forbiddenCardKeys = [
      'card_number',
      'cardNumber',
      'card_cvc',
      'cvc',
      'cvv',
      'exp_month',
      'expMonth',
      'exp_year',
      'expYear',
      'expiry',
      'expiration',
      'cardholder_name',
      'cardholderName',
    ];
    const receivedForbidden = forbiddenCardKeys.filter((k) => req.body?.[k] != null && String(req.body[k]).trim() !== '');
    if (receivedForbidden.length > 0) {
      await connection.rollback();
      return res.status(400).json({
        message: 'Ne jamais envoyer les données de carte bancaire (numéro/CVV/expiration).',
        forbidden_fields: receivedForbidden,
      });
    }

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

      // Delivery method
      delivery_method = 'delivery', // 'delivery' | 'pickup'
      pickup_location_id,

      // Order details
      payment_method = 'cash_on_delivery', // 'cash_on_delivery', 'card', 'solde', 'pay_in_store'
      customer_notes,
      // Optional promo code
      promo_code,
      
      // Remise (loyalty balance) usage
      remise_to_use,
      use_remise_balance,

      // Items can come from cart or be provided directly
      use_cart = true, // If true, use user's cart; if false, use items array
      items = [] // For guest checkout or direct order: [{product_id, variant_id?, unit_id?, quantity}]
    } = req.body;

    const userId = req.user?.id || null; // NULL for guest orders

    // Validate delivery method early.
    const normalizedDeliveryMethod = String(delivery_method || 'delivery').trim();
    const allowedDeliveryMethods = new Set(['delivery', 'pickup']);
    if (!allowedDeliveryMethods.has(normalizedDeliveryMethod)) {
      await connection.rollback();
      return res.status(400).json({
        message: 'Mode de livraison invalide',
        field: 'delivery_method',
        allowed: Array.from(allowedDeliveryMethods),
      });
    }

    // Validate payment method early.
    const normalizedPaymentMethod = String(payment_method || 'cash_on_delivery').trim();
    const allowedPaymentMethods = new Set(['cash_on_delivery', 'card', 'solde', 'pay_in_store']);
    if (!allowedPaymentMethods.has(normalizedPaymentMethod)) {
      await connection.rollback();
      return res.status(400).json({
        message: 'Méthode de paiement invalide',
        field: 'payment_method',
        allowed: Array.from(allowedPaymentMethods),
      });
    }

    // Basic combination rules (keep it simple): COD doesn't make sense for pickup.
    if (normalizedDeliveryMethod === 'pickup' && normalizedPaymentMethod === 'cash_on_delivery') {
      await connection.rollback();
      return res.status(400).json({
        message: 'Méthode de paiement incompatible avec le retrait en boutique',
        error_type: 'PAYMENT_METHOD_NOT_ALLOWED_FOR_PICKUP',
      });
    }

    // Solde authorization is intentionally checked later (after totals/remise are computed),
    // so we only enforce it when there is an actual remaining amount to pay via solde.

    // For pickup orders, shipping address is automatically set from pickup location.
    // For delivery orders, shipping address is required.
    let effectiveShippingLine1 = shipping_address_line1;
    let effectiveShippingLine2 = shipping_address_line2;
    let effectiveShippingCity = shipping_city;
    let effectiveShippingState = shipping_state;
    let effectiveShippingPostalCode = shipping_postal_code;
    let effectiveShippingCountry = shipping_country;
    let effectivePickupLocationId = pickup_location_id != null ? Number(pickup_location_id) : null;

    if (normalizedDeliveryMethod === 'pickup') {
      if (!Number.isFinite(effectivePickupLocationId) || effectivePickupLocationId <= 0) {
        // Minimal setup: default to the first seeded pickup location.
        effectivePickupLocationId = 1;
      }

      const [locRows] = await connection.query(
        `SELECT id, name, address_line1, address_line2, city, state, postal_code, country
         FROM ecommerce_pickup_locations
         WHERE id = ? AND is_active = 1
         LIMIT 1`,
        [effectivePickupLocationId]
      );

      if (locRows.length === 0) {
        await connection.rollback();
        return res.status(400).json({
          message: 'Point de retrait introuvable',
          field: 'pickup_location_id',
          error_type: 'PICKUP_LOCATION_NOT_FOUND',
        });
      }

      const loc = locRows[0];
      effectiveShippingLine1 = loc.address_line1 || loc.name;
      effectiveShippingLine2 = loc.address_line2 || null;
      effectiveShippingCity = loc.city || 'Casablanca';
      effectiveShippingState = loc.state || null;
      effectiveShippingPostalCode = loc.postal_code || null;
      effectiveShippingCountry = loc.country || 'Morocco';
    }

    // Validate required fields
    if (!customer_name || !customer_email || !effectiveShippingLine1 || !effectiveShippingCity) {
      await connection.rollback();
      return res.status(400).json({
        message: 'Informations requises manquantes',
        required: ['customer_name', 'customer_email', 'shipping_address_line1', 'shipping_city'],
      });
    }

    let orderItems = [];

    // If authenticated user: persist checkout info into contacts so /api/users/auth/me can prefill next time.
    if (userId) {
      try {
        await ensureContactsCheckoutColumns(connection);
        const nameParts = splitFullName(customer_name);
        const adresse = formatContactAdresse({ shipping_address_line1, shipping_address_line2 });

        await connection.query(
          `
          UPDATE contacts
          SET
            nom_complet = COALESCE(NULLIF(?, ''), nom_complet),
            prenom = COALESCE(NULLIF(?, ''), prenom),
            nom = COALESCE(NULLIF(?, ''), nom),
            telephone = COALESCE(NULLIF(?, ''), telephone),
            adresse = COALESCE(NULLIF(?, ''), adresse),
            shipping_address_line1 = COALESCE(NULLIF(?, ''), shipping_address_line1),
            shipping_address_line2 = COALESCE(NULLIF(?, ''), shipping_address_line2),
            shipping_city = COALESCE(NULLIF(?, ''), shipping_city),
            shipping_state = COALESCE(NULLIF(?, ''), shipping_state),
            shipping_postal_code = COALESCE(NULLIF(?, ''), shipping_postal_code),
            shipping_country = COALESCE(NULLIF(?, ''), shipping_country),
            updated_at = NOW()
          WHERE id = ? AND deleted_at IS NULL
          `,
          [
            nameParts.nom_complet,
            nameParts.prenom,
            nameParts.nom,
            customer_phone?.trim() || null,
            adresse || null,
            String(effectiveShippingLine1 || '').trim() || null,
            effectiveShippingLine2 != null ? String(effectiveShippingLine2).trim() : null,
            String(effectiveShippingCity || '').trim() || null,
            effectiveShippingState != null ? String(effectiveShippingState).trim() : null,
            effectiveShippingPostalCode != null ? String(effectiveShippingPostalCode).trim() : null,
            String(effectiveShippingCountry || '').trim() || null,
            userId,
          ]
        );
      } catch (e) {
        // Do not block checkout if profile update fails
        console.error('Checkout profile sync (contacts) failed:', e);
      }
    }

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
          pu.conversion_factor
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
            pu.conversion_factor
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
      }

      // If unit is selected, adjust by conversion factor
      if (item.unit_id && item.conversion_factor !== null && item.conversion_factor !== undefined) {
        unitPrice = unitPrice * Number(item.conversion_factor || 1);
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
    let discountAmount = validatedItems.reduce((sum, item) => sum + item.discount_amount, 0);

    // Promo code validation (if provided)
    let promoDiscountAmount = 0;
    let promoCodeId = null;
    if (promo_code) {
      const [promoRows] = await connection.query(`
        SELECT id, code, type, value, max_discount_amount, min_order_amount, max_redemptions, redeemed_count, active,
               start_date, end_date
        FROM ecommerce_promo_codes
        WHERE code = ? AND active = 1
        LIMIT 1
      `, [promo_code]);

      if (promoRows.length === 0) {
        await connection.rollback();
        return res.status(400).json({ message: 'Code promo invalide ou inactif' });
      }

      const promo = promoRows[0];

      // Date window checks
      const now = new Date();
      if (promo.start_date && now < new Date(promo.start_date)) {
        await connection.rollback();
        return res.status(400).json({ message: 'Code promo pas encore actif' });
      }
      if (promo.end_date && now > new Date(promo.end_date)) {
        await connection.rollback();
        return res.status(400).json({ message: 'Code promo expiré' });
      }

      // Redemption limit
      if (promo.max_redemptions !== null && promo.max_redemptions > 0 && promo.redeemed_count >= promo.max_redemptions) {
        await connection.rollback();
        return res.status(400).json({ message: 'Code promo a atteint sa limite d\'utilisation' });
      }

      // Minimum order amount
      if (promo.min_order_amount && subtotal < Number(promo.min_order_amount)) {
        await connection.rollback();
        return res.status(400).json({ message: 'Montant minimum non atteint pour le code promo' });
      }

      // Compute discount
      if (promo.type === 'percentage') {
        promoDiscountAmount = (Number(promo.value) / 100) * subtotal;
      } else {
        promoDiscountAmount = Number(promo.value);
      }

      // Cap discount
      if (promo.max_discount_amount) {
        promoDiscountAmount = Math.min(promoDiscountAmount, Number(promo.max_discount_amount));
      }

      // Ensure non-negative and not exceeding subtotal
      promoDiscountAmount = Math.max(0, Math.min(promoDiscountAmount, subtotal));

      // Track promo id to update redemption after order creation
      promoCodeId = promo.id;

      // Accumulate into global discount
      discountAmount += promoDiscountAmount;
    }

    const totalAmount = Math.max(0, subtotal + taxAmount + shippingCost - promoDiscountAmount);

    // Apply optional remise_balance payment for authenticated users.
    // We only "spend" remise inside the same transaction and cap it to
    // both the current balance and the order total.
    let remiseUsedAmount = 0;

    if (userId) {
      const rawRequestedRemise = Number(remise_to_use ?? 0);
      const wantsUseRemise =
        use_remise_balance === true ||
        rawRequestedRemise > 0 ||
        String(use_remise_balance ?? '').toLowerCase() === 'true';

      if (wantsUseRemise && totalAmount > 0) {
        const [balanceRows] = await connection.query(
          'SELECT remise_balance FROM contacts WHERE id = ? FOR UPDATE',
          [userId]
        );

        const currentBalance = Number(balanceRows?.[0]?.remise_balance || 0);

        if (currentBalance > 0) {
          const requested = Number.isFinite(rawRequestedRemise) && rawRequestedRemise > 0
            ? rawRequestedRemise
            : currentBalance;

          const maxUsable = Math.min(currentBalance, totalAmount);
          remiseUsedAmount = Math.min(requested, maxUsable);

          // Round down to 2 decimals to avoid floating issues.
          remiseUsedAmount = Math.floor(remiseUsedAmount * 100) / 100;

          if (remiseUsedAmount > 0) {
            const [updateRes] = await connection.query(
              `UPDATE contacts
               SET remise_balance = remise_balance - ?
               WHERE id = ? AND remise_balance >= ?`,
              [remiseUsedAmount, userId, remiseUsedAmount]
            );

            if (updateRes.affectedRows !== 1) {
              await connection.rollback();
              return res.status(409).json({
                message: 'Solde de remise insuffisant ou mis à jour, veuillez réessayer.',
                error_type: 'REMISE_BALANCE_CHANGED',
              });
            }
          }
        }
      }
    }

    // Determine initial payment status:
    // - If the full total is covered by remise (no remaining amount),
    //   we consider the payment collected immediately.
    // - Otherwise, payment will be collected later via the chosen method.
    const remainingToPay = Math.max(0, totalAmount - remiseUsedAmount);
    const isFullyPaidByRemise = remainingToPay <= 0.000001;
    const initialPaymentStatus = isFullyPaidByRemise ? 'paid' : 'pending';
    const isSoldeOrder = normalizedPaymentMethod === 'solde';
    const soldeAmount = isSoldeOrder
      ? Math.max(0, Math.round((totalAmount - remiseUsedAmount) * 100) / 100)
      : 0;
    const computedIsSolde = isSoldeOrder && soldeAmount > 0 ? 1 : 0;

    // Solde is only allowed for authenticated users explicitly enabled by backoffice,
    // but only when there is actually something to pay via solde.
    if (isSoldeOrder && soldeAmount > 0) {
      if (!userId) {
        await connection.rollback();
        return res.status(401).json({
          message: 'Authentification requise pour payer en solde',
          error_type: 'SOLDE_AUTH_REQUIRED',
        });
      }

      const [soldeRows] = await connection.query(
        'SELECT is_solde FROM contacts WHERE id = ? AND deleted_at IS NULL LIMIT 1',
        [userId]
      );
      const isSoldeEnabled = Number(soldeRows?.[0]?.is_solde || 0) === 1;
      if (!isSoldeEnabled) {
        await connection.rollback();
        return res.status(403).json({
          message: 'Votre compte n\'est pas autorisé à payer en solde',
          error_type: 'SOLDE_NOT_ALLOWED',
        });
      }
    }

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
        promo_code,
        promo_discount_amount,
        total_amount,
        remise_used_amount,
        status,
        payment_status,
        payment_method,
        is_solde,
        solde_amount,
        delivery_method,
        pickup_location_id,
        customer_notes,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      orderNumber,
      userId,
      customer_email,
      customer_phone,
      customer_name,
      effectiveShippingLine1,
      effectiveShippingLine2 || null,
      effectiveShippingCity,
      effectiveShippingState || null,
      effectiveShippingPostalCode || null,
      effectiveShippingCountry,
      subtotal,
      taxAmount,
      shippingCost,
      discountAmount,
      promo_code || null,
      promoDiscountAmount,
      totalAmount,
      remiseUsedAmount,
      'pending', // status
      initialPaymentStatus, // payment_status
      normalizedPaymentMethod,
      computedIsSolde,
      soldeAmount,
      normalizedDeliveryMethod,
      normalizedDeliveryMethod === 'pickup' ? effectivePickupLocationId : null,
      customer_notes || null
    ]);

    const orderId = orderResult.insertId;

    // Safety net: always persist computed solde flags/amount server-side.
    // This also helps when older running code created orders with defaults.
    await connection.query(
      `UPDATE ecommerce_orders
       SET is_solde = ?, solde_amount = ?
       WHERE id = ?`,
      [computedIsSolde, isSoldeOrder ? soldeAmount : 0, orderId]
    );

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

    // Increase promo code redemption counter if used
    if (promoCodeId) {
      await connection.query(`
        UPDATE ecommerce_promo_codes
        SET redeemed_count = redeemed_count + 1,
            updated_at = NOW()
        WHERE id = ?
      `, [promoCodeId]);
    }

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
        remise_used_amount: remiseUsedAmount,
        status: 'pending',
        payment_status: initialPaymentStatus,
        payment_method: normalizedPaymentMethod,
        is_solde: computedIsSolde,
        solde_amount: soldeAmount,
        delivery_method: normalizedDeliveryMethod,
        pickup_location_id: normalizedDeliveryMethod === 'pickup' ? effectivePickupLocationId : null,
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
    const role = req.user?.role != null ? String(req.user.role).trim() : '';
    const isBackoffice = role.length > 0;
    const { email } = req.query; // Allow fetch by email (when enabled by auth rules)

    // Pagination + date filters
    const rawPage = req.query?.page;
    const rawLimit = req.query?.limit;
    const period = req.query?.period != null ? String(req.query.period).trim() : null; // this_week | this_month
    const startDate = req.query?.start_date != null ? String(req.query.start_date).trim() : null; // YYYY-MM-DD
    const endDate = req.query?.end_date != null ? String(req.query.end_date).trim() : null; // YYYY-MM-DD

    // Other filters
    const rawStatus = req.query?.status != null ? String(req.query.status).trim() : null; // can be CSV
    const rawPaymentStatus = req.query?.payment_status != null ? String(req.query.payment_status).trim() : null; // can be CSV
    const rawPaymentMethod = req.query?.payment_method != null ? String(req.query.payment_method).trim() : null;
    const rawDeliveryMethod = req.query?.delivery_method != null ? String(req.query.delivery_method).trim() : null;

    const page = Math.max(1, Number.parseInt(rawPage ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(rawLimit ?? '20', 10) || 20));
    const offset = (page - 1) * limit;

    if (!isBackoffice && !userId && !email) {
      return res.status(401).json({
        message: 'Authentification requise ou email nécessaire'
      });
    }

    // Build WHERE clause
    const whereParts = [];
    const whereParams = [];

    // Backoffice users (employees) can list all orders.
    // E-commerce users are restricted to their own orders (by user_id) or by email.
    if (!isBackoffice) {
      whereParts.push(userId ? 'o.user_id = ?' : 'o.customer_email = ?');
      whereParams.push(userId || email);
    } else if (email) {
      whereParts.push('o.customer_email = ?');
      whereParams.push(email);
    }

    const isValidDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
    const parseCsv = (v) =>
      String(v)
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x.length > 0);

    const addInFilter = (fieldSql, values) => {
      if (!values || values.length === 0) return;
      whereParts.push(`${fieldSql} IN (${values.map(() => '?').join(',')})`);
      whereParams.push(...values);
    };

    if (period) {
      const p = period.toLowerCase();
      if (p === 'this_week') {
        // ISO week (mode 1): week starts Monday
        whereParts.push('YEARWEEK(o.created_at, 1) = YEARWEEK(CURDATE(), 1)');
      } else if (p === 'this_month') {
        whereParts.push('YEAR(o.created_at) = YEAR(CURDATE()) AND MONTH(o.created_at) = MONTH(CURDATE())');
      } else {
        return res.status(400).json({
          message: 'Filtre de période invalide',
          field: 'period',
          allowed: ['this_week', 'this_month'],
        });
      }
    }

    if (startDate || endDate) {
      if (startDate && !isValidDate(startDate)) {
        return res.status(400).json({
          message: 'Format de date invalide (YYYY-MM-DD)',
          field: 'start_date',
        });
      }
      if (endDate && !isValidDate(endDate)) {
        return res.status(400).json({
          message: 'Format de date invalide (YYYY-MM-DD)',
          field: 'end_date',
        });
      }

      if (startDate) {
        whereParts.push('o.created_at >= ?');
        whereParams.push(`${startDate} 00:00:00`);
      }
      if (endDate) {
        // inclusive end date by using an exclusive upper bound (endDate + 1 day)
        whereParts.push('o.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
        whereParams.push(`${endDate} 00:00:00`);
      }
    }

    // Status filters
    const allowedStatuses = new Set(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']);
    const allowedPaymentStatuses = new Set(['pending', 'paid', 'failed', 'refunded']);
    const allowedPaymentMethods = new Set(['cash_on_delivery', 'card', 'solde', 'pay_in_store']);
    const allowedDeliveryMethods = new Set(['delivery', 'pickup']);

    if (rawStatus) {
      const statuses = parseCsv(rawStatus);
      const invalid = statuses.filter((s) => !allowedStatuses.has(s));
      if (invalid.length > 0) {
        return res.status(400).json({
          message: 'Statut de commande invalide',
          field: 'status',
          invalid,
          allowed: Array.from(allowedStatuses),
        });
      }
      addInFilter('o.status', statuses);
    }

    if (rawPaymentStatus) {
      const paymentStatuses = parseCsv(rawPaymentStatus);
      const invalid = paymentStatuses.filter((s) => !allowedPaymentStatuses.has(s));
      if (invalid.length > 0) {
        return res.status(400).json({
          message: 'Statut de paiement invalide',
          field: 'payment_status',
          invalid,
          allowed: Array.from(allowedPaymentStatuses),
        });
      }
      addInFilter('o.payment_status', paymentStatuses);
    }

    if (rawPaymentMethod) {
      const paymentMethod = rawPaymentMethod;
      if (!allowedPaymentMethods.has(paymentMethod)) {
        return res.status(400).json({
          message: 'Méthode de paiement invalide',
          field: 'payment_method',
          allowed: Array.from(allowedPaymentMethods),
        });
      }
      whereParts.push('o.payment_method = ?');
      whereParams.push(paymentMethod);
    }

    if (rawDeliveryMethod) {
      const deliveryMethod = rawDeliveryMethod;
      if (!allowedDeliveryMethods.has(deliveryMethod)) {
        return res.status(400).json({
          message: 'Mode de livraison invalide',
          field: 'delivery_method',
          allowed: Array.from(allowedDeliveryMethods),
        });
      }
      whereParts.push('o.delivery_method = ?');
      whereParams.push(deliveryMethod);
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    // Total count (for pagination)
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM ecommerce_orders o ${whereSql}`,
      whereParams
    );
    const total = Number(countRows?.[0]?.total || 0);

    // Fetch orders with shipping details
    const [orders] = await pool.query(`
      SELECT 
        o.id,
        o.order_number,
        o.customer_name,
        o.customer_email,
        o.customer_phone,
        o.total_amount,
        o.remise_used_amount,
        o.status,
        o.payment_status,
        o.payment_method,
        o.is_solde,
        o.solde_amount,
        o.delivery_method,
        o.pickup_location_id,
        o.created_at,
        o.confirmed_at,
        o.remise_earned_at,
        o.remise_earned_amount,
        o.shipped_at,
        o.delivered_at,
        o.shipping_address_line1,
        o.shipping_address_line2,
        o.shipping_city,
        o.shipping_state,
        o.shipping_postal_code,
        o.shipping_country
      FROM ecommerce_orders o
      ${whereSql}
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `, [...whereParams, limit, offset]);

    const orderIds = orders.map(o => o.id);

    let itemsByOrder = new Map();
    if (orderIds.length > 0) {
      // Fetch items for all orders, with image URLs
      const [items] = await pool.query(`
        SELECT 
          oi.order_id,
          oi.id,
          oi.product_id,
          oi.variant_id,
          oi.unit_id,
          oi.product_name,
          oi.product_name_ar,
          oi.variant_name,
          oi.variant_type,
          oi.unit_name,
          oi.unit_price,
          oi.quantity,
          oi.subtotal,
          oi.discount_percentage,
          oi.discount_amount,
          oi.remise_percent_applied,
          oi.remise_amount,
          COALESCE(pv.image_url, p.image_url) AS image_url
        FROM ecommerce_order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        LEFT JOIN product_variants pv ON oi.variant_id = pv.id
        WHERE oi.order_id IN (${orderIds.map(() => '?').join(',')})
        ORDER BY oi.order_id, oi.id
      `, orderIds);

      for (const it of items) {
        if (!itemsByOrder.has(it.order_id)) itemsByOrder.set(it.order_id, []);
        itemsByOrder.get(it.order_id).push({
          id: it.id,
          product_id: it.product_id,
          variant_id: it.variant_id,
          unit_id: it.unit_id,
          product_name: it.product_name,
          product_name_ar: it.product_name_ar,
          variant_name: it.variant_name,
          variant_type: it.variant_type,
          unit_name: it.unit_name,
          unit_price: Number(it.unit_price),
          quantity: Number(it.quantity),
          subtotal: Number(it.subtotal),
          discount_percentage: Number(it.discount_percentage),
          discount_amount: Number(it.discount_amount),
          remise_percent_applied: Number(it.remise_percent_applied || 0),
          remise_amount: Number(it.remise_amount || 0),
          image_url: it.image_url || null,
        });
      }
    }

    res.json({
      orders: orders.map(order => ({
        id: order.id,
        order_number: order.order_number,
        customer_name: order.customer_name,
        customer_email: order.customer_email,
        customer_phone: order.customer_phone,
        total_amount: Number(order.total_amount),
        remise_used_amount: Number(order.remise_used_amount || 0),
        status: order.status,
        payment_status: order.payment_status,
        payment_method: order.payment_method,
        is_solde: order.payment_method === 'solde'
          ? (Math.max(0, Math.round((Number(order.total_amount || 0) - Number(order.remise_used_amount || 0)) * 100) / 100) > 0 ? 1 : 0)
          : Number(order.is_solde || 0),
        solde_amount: order.payment_method === 'solde'
          ? Math.max(0, Math.round((Number(order.total_amount || 0) - Number(order.remise_used_amount || 0)) * 100) / 100)
          : Number(order.solde_amount || 0),
        delivery_method: order.delivery_method || 'delivery',
        pickup_location_id: order.pickup_location_id || null,
        created_at: order.created_at,
        confirmed_at: order.confirmed_at,
        remise_applied: !!order.remise_earned_at,
        remise_earned_amount: Number(order.remise_earned_amount || 0),
        shipped_at: order.shipped_at,
        delivered_at: order.delivered_at,
        shipping_address: {
          line1: order.shipping_address_line1,
          line2: order.shipping_address_line2,
          city: order.shipping_city,
          state: order.shipping_state,
          postal_code: order.shipping_postal_code,
          country: order.shipping_country,
        },
        items: itemsByOrder.get(order.id) || [],
        items_count: (itemsByOrder.get(order.id) || []).length,
      })),
      total,
      page,
      limit,
      pages: total > 0 ? Math.ceil(total / limit) : 0,
      returned: orders.length
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

    // Get order (+ pickup location if any)
    const [orders] = await pool.query(`
      SELECT
        o.*,
        pl.name AS pickup_location_name,
        pl.address_line1 AS pickup_address_line1,
        pl.address_line2 AS pickup_address_line2,
        pl.city AS pickup_city,
        pl.state AS pickup_state,
        pl.postal_code AS pickup_postal_code,
        pl.country AS pickup_country
      FROM ecommerce_orders o
      LEFT JOIN ecommerce_pickup_locations pl ON o.pickup_location_id = pl.id
      WHERE o.id = ?
      LIMIT 1
    `, [orderId]);

    if (orders.length === 0) {
      return res.status(404).json({ message: 'Commande introuvable' });
    }

    const order = orders[0];

    // If this is a solde order, ensure stored solde fields are consistent.
    // This fixes older orders created when the server was still running without the new insert fields.
    if (order.payment_method === 'solde') {
      const computedSoldeAmount = Math.max(
        0,
        Math.round((Number(order.total_amount || 0) - Number(order.remise_used_amount || 0)) * 100) / 100
      );
      const computedIsSolde = computedSoldeAmount > 0 ? 1 : 0;
      const currentIsSolde = Number(order.is_solde || 0);
      const currentSoldeAmount = Number(order.solde_amount || 0);

      if (currentIsSolde !== computedIsSolde || Math.abs(currentSoldeAmount - computedSoldeAmount) > 0.000001) {
        await pool.query(
          `UPDATE ecommerce_orders
           SET is_solde = ?, solde_amount = ?
           WHERE id = ?`,
          [computedIsSolde, computedSoldeAmount, orderId]
        );
        order.is_solde = computedIsSolde;
        order.solde_amount = computedSoldeAmount;
      }
    }

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
        discount_amount,
        remise_percent_applied,
        remise_amount
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

    const pickupLocation = (order.delivery_method === 'pickup' && order.pickup_location_id) ? {
      id: order.pickup_location_id,
      name: order.pickup_location_name,
      address_line1: order.pickup_address_line1,
      address_line2: order.pickup_address_line2,
      city: order.pickup_city,
      state: order.pickup_state,
      postal_code: order.pickup_postal_code,
      country: order.pickup_country,
    } : null;

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

        // Delivery / pickup
        delivery_method: order.delivery_method || 'delivery',
        pickup_location_id: order.pickup_location_id || null,
        pickup_location: pickupLocation,
        
        // Totals
        subtotal: Number(order.subtotal),
        tax_amount: Number(order.tax_amount),
        shipping_cost: Number(order.shipping_cost),
        discount_amount: Number(order.discount_amount),
        total_amount: Number(order.total_amount),
        remise_used_amount: Number(order.remise_used_amount || 0),
        
        // Status
        status: order.status,
        payment_status: order.payment_status,
        payment_method: order.payment_method,
        is_solde: Number(order.is_solde || 0),
        solde_amount: Number(order.solde_amount || 0),

        // Remise (earned/applied)
        remise_applied: !!order.remise_earned_at,
        remise_earned_amount: Number(order.remise_earned_amount || 0),

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
          discount_amount: Number(item.discount_amount),
          remise_percent_applied: Number(item.remise_percent_applied || 0),
          remise_amount: Number(item.remise_amount || 0)
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
    const orderId = Number(req.params.id);
    const { status, payment_status, admin_notes } = req.body;
    const userId = req.user?.id; // Admin/employee ID

    // Ensure schema for remise
    await ensureProductRemiseColumns(connection);
    await ensureContactsRemiseBalance(connection);
    await ensureEcommerceOrdersRemiseColumns(connection);
    await ensureEcommerceOrderItemsRemiseColumns(connection);

    await connection.beginTransaction();

    // Get current order (lock row)
    const [orders] = await connection.query(
      `
      SELECT
        id,
        user_id,
        status,
        payment_status,
        payment_method,
        is_solde,
        solde_amount,
        confirmed_at,
        total_amount,
        remise_used_amount,
        remise_earned_at,
        remise_earned_amount
      FROM ecommerce_orders
      WHERE id = ?
      FOR UPDATE
      `,
      [orderId]
    );

    if (orders.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Commande introuvable' });
    }

    const currentOrder = orders[0];
    const updates = [];
    const params = [];

    // For COD (cash_on_delivery): when delivered, payment is considered collected.
    // If caller didn't specify payment_status, we auto-mark it paid on delivery.
    const normalizedRequestedStatus = status ? String(status) : null;
    let effectivePaymentStatus = payment_status ? String(payment_status) : null;
    const shouldAutoMarkCodPaid =
      normalizedRequestedStatus === 'delivered' &&
      currentOrder.payment_method === 'cash_on_delivery' &&
      !effectivePaymentStatus &&
      currentOrder.payment_status !== 'paid';
    if (shouldAutoMarkCodPaid) {
      effectivePaymentStatus = 'paid';
    }

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
    if (effectivePaymentStatus && effectivePaymentStatus !== currentOrder.payment_status) {
      updates.push('payment_status = ?');
      params.push(effectivePaymentStatus);

      // Log payment status change (stored in same history table as an event row)
      await connection.query(
        `
        INSERT INTO ecommerce_order_status_history (
          order_id,
          old_status,
          new_status,
          changed_by_type,
          notes
        ) VALUES (?, ?, ?, 'system', ?)
        `,
        [
          orderId,
          `payment:${currentOrder.payment_status}`,
          `payment:${effectivePaymentStatus}`,
          admin_notes || `Payment status changed to ${effectivePaymentStatus}`,
        ]
      );
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

    // Award remise balance when order is confirmed + paid (authenticated users only)
    // Idempotent by setting ecommerce_orders.remise_earned_at once.
    const [updatedRows] = await connection.query(
      `
      SELECT
        id,
        user_id,
        status,
        payment_status,
        payment_method,
        is_solde,
        solde_amount,
        confirmed_at,
        total_amount,
        remise_used_amount,
        remise_earned_at
      FROM ecommerce_orders
      WHERE id = ?
      LIMIT 1
      `,
      [orderId]
    );

    const updatedOrder = updatedRows[0];
    let earned_remise_amount = 0;

    // Solde: when an admin confirms a solde order, book the debt once in the ledger.
    // We keep solde info on the order itself (legacy-friendly fields).
    if (updatedOrder?.user_id && updatedOrder.payment_method === 'solde' && updatedOrder.confirmed_at !== null) {
      const totalAmount = Number(updatedOrder.total_amount || 0);
      const remiseUsed = Number(updatedOrder.remise_used_amount || 0);
      const soldeAmount = Math.max(0, Math.round((totalAmount - remiseUsed) * 100) / 100);
      const computedIsSolde = soldeAmount > 0 ? 1 : 0;

      // Ensure solde columns are set for legacy compatibility
      if (
        Number(updatedOrder.is_solde || 0) !== computedIsSolde ||
        Math.abs(Number(updatedOrder.solde_amount || 0) - soldeAmount) > 0.000001
      ) {
        await connection.query(
          `UPDATE ecommerce_orders
           SET is_solde = ?, solde_amount = ?
           WHERE id = ?`,
          [computedIsSolde, soldeAmount, orderId]
        );
      }
    }

    if (updatedOrder?.user_id && updatedOrder.payment_status === 'paid' && updatedOrder.confirmed_at !== null && !updatedOrder.remise_earned_at) {
      const [urows] = await connection.query(
        `SELECT type_compte FROM contacts WHERE id = ? LIMIT 1`,
        [updatedOrder.user_id]
      );
      const typeCompte = urows?.[0]?.type_compte || 'Client';

      // Compute per-item remise breakdown (snapshot on order items)
      const breakdown = await computeOrderItemRemiseBreakdown(connection, orderId, typeCompte);
      earned_remise_amount = Number(breakdown.total || 0);

      // Try to mark order as awarded (idempotent)
      const [awardRes] = await connection.query(
        `UPDATE ecommerce_orders
         SET remise_earned_amount = ?, remise_earned_at = NOW(), updated_at = NOW()
         WHERE id = ? AND remise_earned_at IS NULL`,
        [earned_remise_amount, orderId]
      );

      if (awardRes.affectedRows === 1) {
        // Persist per-item details
        for (const it of breakdown.items) {
          await connection.query(
            `UPDATE ecommerce_order_items
             SET remise_percent_applied = ?, remise_amount = ?
             WHERE id = ? AND order_id = ?`,
            [it.remise_percent_applied, it.remise_amount, it.order_item_id, orderId]
          );
        }

        // Credit contact balance (only when > 0)
        if (earned_remise_amount > 0) {
          await connection.query(
            `UPDATE contacts
             SET remise_balance = remise_balance + ?
             WHERE id = ?`,
            [earned_remise_amount, updatedOrder.user_id]
          );
        }
      }
    }

    await connection.commit();

    res.json({
      message: 'Commande mise à jour avec succès',
      order_id: orderId,
      status: status || currentOrder.status,
      payment_status: effectivePaymentStatus || currentOrder.payment_status,
      earned_remise_amount
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

    // If a promo code was used on this order, decrement redemption counter
    const [promoInfoRows] = await connection.query(`
      SELECT promo_code, promo_discount_amount, remise_used_amount, user_id
      FROM ecommerce_orders
      WHERE id = ?
    `, [orderId]);
    const promoUsed = promoInfoRows[0]?.promo_code;
    if (promoUsed) {
      await connection.query(`
        UPDATE ecommerce_promo_codes
        SET redeemed_count = CASE WHEN redeemed_count > 0 THEN redeemed_count - 1 ELSE 0 END,
            updated_at = NOW()
        WHERE code = ?
      `, [promoUsed]);
    }

    // If remise balance was used to pay part of this order,
    // refund that amount back to the user's remise_balance.
    const remiseUsedOnOrder = Number(promoInfoRows[0]?.remise_used_amount || 0);
    const promoUserId = promoInfoRows[0]?.user_id || null;
    if (promoUserId && remiseUsedOnOrder > 0) {
      await connection.query(
        `UPDATE contacts
         SET remise_balance = remise_balance + ?
         WHERE id = ?`,
        [remiseUsedOnOrder, promoUserId]
      );
    }

    // Note: no contact_solde_ledger usage here.
    // Backoffice can compute contact solde from orders (sum of is_solde/solde_amount) if needed.

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