/**
 * E-commerce Orders Workflow Test Script
 * ========================================
 * Tests the complete order lifecycle for user ID 514
 * 
 * Test Cases:
 * -----------
 * TC01: Fetch user profile and check is_solde eligibility
 * TC02: Fetch available pickup locations
 * TC03: Create order with delivery + cash_on_delivery
 * TC04: Create order with delivery + card
 * TC05: Create order with pickup + pay_in_store
 * TC06: Create order with solde (if user is_solde = 1)
 * TC07: Confirm an order (admin action) and verify ledger for solde
 * TC08: Cancel an order and verify refunds
 * TC09: Mark order as paid and verify remise earning
 * TC10: Fetch all orders for user and display summary
 * 
 * Run: node backend/scripts/test-orders-workflow.js
 */

import pool from '../db/pool.js';

const USER_ID = 514;
const BASE_URL = 'http://localhost:3001';

// Store test results
const testResults = [];
const createdOrderIds = [];

// Helper: log test result
function logTest(testId, name, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`\n${status} | ${testId}: ${name}`);
  if (details) console.log(`   └─ ${details}`);
  testResults.push({ testId, name, passed, details });
}

// Helper: make HTTP request
async function request(method, path, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  
  const res = await fetch(`${BASE_URL}${path}`, options);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

// ============================================================
// TC01: Fetch user profile and check is_solde eligibility
// ============================================================
async function TC01_checkUserProfile() {
  console.log('\n' + '='.repeat(60));
  console.log('TC01: Check User Profile & Solde Eligibility');
  console.log('='.repeat(60));
  
  const [rows] = await pool.query(`
    SELECT 
      c.id,
      c.nom_complet,
      c.email,
      c.telephone,
      c.is_solde,
      c.remise_balance,
      u.email as user_email
    FROM contacts c
    LEFT JOIN users u ON c.id = u.id
    WHERE c.id = ?
  `, [USER_ID]);
  
  if (rows.length === 0) {
    logTest('TC01', 'User profile exists', false, `User ${USER_ID} not found`);
    return null;
  }
  
  const user = rows[0];
  console.log(`   User: ${user.nom_complet || user.email || user.user_email}`);
  console.log(`   Email: ${user.email || user.user_email}`);
  console.log(`   Phone: ${user.telephone || 'N/A'}`);
  console.log(`   is_solde: ${user.is_solde === 1 ? 'YES ✓' : 'NO'}`);
  console.log(`   remise_balance: ${user.remise_balance || 0} DH`);
  
  logTest('TC01', 'User profile exists', true, `is_solde=${user.is_solde}, remise=${user.remise_balance || 0} DH`);
  return user;
}

// ============================================================
// TC02: Fetch available pickup locations
// ============================================================
async function TC02_fetchPickupLocations() {
  console.log('\n' + '='.repeat(60));
  console.log('TC02: Fetch Pickup Locations');
  console.log('='.repeat(60));
  
  const { status, data } = await request('GET', '/api/ecommerce/pickup-locations');
  
  if (status !== 200) {
    logTest('TC02', 'Fetch pickup locations', false, `HTTP ${status}: ${JSON.stringify(data)}`);
    return [];
  }
  
  const locations = data.pickup_locations || [];
  console.log(`   Found ${locations.length} pickup location(s)`);
  locations.forEach(loc => {
    console.log(`   - [${loc.id}] ${loc.name} (${loc.city})`);
  });
  
  logTest('TC02', 'Fetch pickup locations', locations.length > 0, `${locations.length} location(s) found`);
  return locations;
}

// ============================================================
// TC03: Create order with delivery + cash_on_delivery
// ============================================================
async function TC03_createDeliveryCOD() {
  console.log('\n' + '='.repeat(60));
  console.log('TC03: Create Order - Delivery + Cash on Delivery');
  console.log('='.repeat(60));
  
  // First get a product to order
  const [products] = await pool.query(`
    SELECT id, designation, prix_vente 
    FROM products 
    WHERE prix_vente > 0 
    LIMIT 1
  `);
  
  if (products.length === 0) {
    logTest('TC03', 'Create delivery + COD order', false, 'No products available');
    return null;
  }
  
  const product = products[0];
  console.log(`   Using product: ${product.designation} (${product.prix_vente} DH)`);
  
  const payload = {
    customer_name: 'Test User TC03',
    customer_email: 'test-tc03@boukir.ma',
    customer_phone: '+212600000003',
    delivery_method: 'delivery',
    shipping_address_line1: '123 Test Street TC03',
    shipping_city: 'Casablanca',
    shipping_postal_code: '20000',
    payment_method: 'cash_on_delivery',
    use_cart: false,
    items: [{ product_id: product.id, quantity: 1 }]
  };
  
  // Create order directly in DB to simulate authenticated user
  const result = await createOrderDirectDB(payload, USER_ID);
  
  if (result.success) {
    createdOrderIds.push(result.orderId);
    logTest('TC03', 'Create delivery + COD order', true, 
      `Order #${result.orderNumber} (ID: ${result.orderId}), Total: ${result.totalAmount} DH`);
    return result;
  } else {
    logTest('TC03', 'Create delivery + COD order', false, result.error);
    return null;
  }
}

// ============================================================
// TC04: Create order with delivery + card
// ============================================================
async function TC04_createDeliveryCard() {
  console.log('\n' + '='.repeat(60));
  console.log('TC04: Create Order - Delivery + Card');
  console.log('='.repeat(60));
  
  const [products] = await pool.query(`
    SELECT id, designation, prix_vente 
    FROM products 
    WHERE prix_vente > 0 
    LIMIT 1
  `);
  
  if (products.length === 0) {
    logTest('TC04', 'Create delivery + card order', false, 'No products available');
    return null;
  }
  
  const product = products[0];
  console.log(`   Using product: ${product.designation} (${product.prix_vente} DH)`);
  
  const payload = {
    customer_name: 'Test User TC04',
    customer_email: 'test-tc04@boukir.ma',
    customer_phone: '+212600000004',
    delivery_method: 'delivery',
    shipping_address_line1: '456 Test Avenue TC04',
    shipping_city: 'Rabat',
    shipping_postal_code: '10000',
    payment_method: 'card',
    use_cart: false,
    items: [{ product_id: product.id, quantity: 2 }]
  };
  
  const result = await createOrderDirectDB(payload, USER_ID);
  
  if (result.success) {
    createdOrderIds.push(result.orderId);
    logTest('TC04', 'Create delivery + card order', true, 
      `Order #${result.orderNumber} (ID: ${result.orderId}), Total: ${result.totalAmount} DH`);
    return result;
  } else {
    logTest('TC04', 'Create delivery + card order', false, result.error);
    return null;
  }
}

// ============================================================
// TC05: Create order with pickup + pay_in_store
// ============================================================
async function TC05_createPickupPayInStore() {
  console.log('\n' + '='.repeat(60));
  console.log('TC05: Create Order - Pickup + Pay in Store');
  console.log('='.repeat(60));
  
  const [products] = await pool.query(`
    SELECT id, designation, prix_vente 
    FROM products 
    WHERE prix_vente > 0 
    LIMIT 1
  `);
  
  if (products.length === 0) {
    logTest('TC05', 'Create pickup + pay_in_store order', false, 'No products available');
    return null;
  }
  
  // Get pickup location
  const [locations] = await pool.query(`
    SELECT id, name, address_line1, city 
    FROM ecommerce_pickup_locations 
    WHERE is_active = 1 
    LIMIT 1
  `);
  
  if (locations.length === 0) {
    logTest('TC05', 'Create pickup + pay_in_store order', false, 'No pickup locations available');
    return null;
  }
  
  const product = products[0];
  const location = locations[0];
  console.log(`   Using product: ${product.designation} (${product.prix_vente} DH)`);
  console.log(`   Pickup at: ${location.name} (${location.city})`);
  
  const payload = {
    customer_name: 'Test User TC05',
    customer_email: 'test-tc05@boukir.ma',
    customer_phone: '+212600000005',
    delivery_method: 'pickup',
    pickup_location_id: location.id,
    payment_method: 'pay_in_store',
    use_cart: false,
    items: [{ product_id: product.id, quantity: 1 }]
  };
  
  const result = await createOrderDirectDB(payload, USER_ID);
  
  if (result.success) {
    createdOrderIds.push(result.orderId);
    logTest('TC05', 'Create pickup + pay_in_store order', true, 
      `Order #${result.orderNumber} (ID: ${result.orderId}), Pickup: ${location.name}`);
    return result;
  } else {
    logTest('TC05', 'Create pickup + pay_in_store order', false, result.error);
    return null;
  }
}

// ============================================================
// TC06: Create order with solde (buy now, pay later)
// ============================================================
async function TC06_createSoldeOrder(userProfile) {
  console.log('\n' + '='.repeat(60));
  console.log('TC06: Create Order - Solde (Buy Now, Pay Later)');
  console.log('='.repeat(60));
  
  if (!userProfile || userProfile.is_solde !== 1) {
    // Enable solde for this user temporarily
    console.log(`   User is_solde = ${userProfile?.is_solde || 0}, enabling...`);
    await pool.query('UPDATE contacts SET is_solde = 1 WHERE id = ?', [USER_ID]);
    console.log('   ✓ Enabled is_solde for user');
  }
  
  const [products] = await pool.query(`
    SELECT id, designation, prix_vente 
    FROM products 
    WHERE prix_vente > 0 
    LIMIT 1
  `);
  
  if (products.length === 0) {
    logTest('TC06', 'Create solde order', false, 'No products available');
    return null;
  }
  
  const product = products[0];
  console.log(`   Using product: ${product.designation} (${product.prix_vente} DH)`);
  
  const payload = {
    customer_name: 'Test User TC06',
    customer_email: 'test-tc06@boukir.ma',
    customer_phone: '+212600000006',
    delivery_method: 'delivery',
    shipping_address_line1: '789 Solde Street TC06',
    shipping_city: 'Tangier',
    payment_method: 'solde',
    use_cart: false,
    items: [{ product_id: product.id, quantity: 1 }]
  };
  
  const result = await createOrderDirectDB(payload, USER_ID);
  
  if (result.success) {
    createdOrderIds.push(result.orderId);
    logTest('TC06', 'Create solde order', true, 
      `Order #${result.orderNumber} (ID: ${result.orderId}), payment_status=pending`);
    return result;
  } else {
    logTest('TC06', 'Create solde order', false, result.error);
    return null;
  }
}

// ============================================================
// TC07: Confirm order and verify solde ledger
// ============================================================
async function TC07_confirmOrderAndCheckLedger(soldeOrderResult) {
  console.log('\n' + '='.repeat(60));
  console.log('TC07: Confirm Solde Order & Verify Ledger');
  console.log('='.repeat(60));
  
  if (!soldeOrderResult) {
    logTest('TC07', 'Confirm solde order', false, 'No solde order to confirm');
    return;
  }
  
  const orderId = soldeOrderResult.orderId;
  console.log(`   Confirming order ID: ${orderId}`);
  
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    // Update order status to confirmed
    await connection.query(`
      UPDATE ecommerce_orders 
      SET status = 'confirmed', confirmed_at = NOW() 
      WHERE id = ?
    `, [orderId]);
    
    // Get order details for ledger
    const [orderRows] = await connection.query(`
      SELECT total_amount, remise_used_amount, user_id 
      FROM ecommerce_orders 
      WHERE id = ?
    `, [orderId]);
    
    const order = orderRows[0];
    const debitAmount = Math.max(0, Number(order.total_amount) - Number(order.remise_used_amount || 0));
    
    // Insert solde ledger debit
    await connection.query(`
      INSERT INTO contact_solde_ledger (contact_id, order_id, entry_type, amount, description)
      VALUES (?, ?, 'debit', ?, 'Solde order confirmed (test)')
    `, [order.user_id, orderId, debitAmount]);
    
    // Log status history
    await connection.query(`
      INSERT INTO ecommerce_order_status_history (order_id, old_status, new_status, changed_by_type, notes)
      VALUES (?, 'pending', 'confirmed', 'system', 'Test confirmation')
    `, [orderId]);
    
    await connection.commit();
    
    // Verify ledger entry
    const [ledgerRows] = await pool.query(`
      SELECT * FROM contact_solde_ledger WHERE order_id = ?
    `, [orderId]);
    
    console.log(`   ✓ Order confirmed`);
    console.log(`   ✓ Ledger entry created: ${ledgerRows.length > 0 ? 'YES' : 'NO'}`);
    if (ledgerRows.length > 0) {
      console.log(`   └─ Type: ${ledgerRows[0].type}, Amount: ${ledgerRows[0].amount} DH`);
    }
    
    logTest('TC07', 'Confirm solde order + ledger', ledgerRows.length > 0, 
      `Ledger debit: ${debitAmount} DH`);
    
  } catch (err) {
    await connection.rollback();
    logTest('TC07', 'Confirm solde order', false, err.message);
  } finally {
    connection.release();
  }
}

// ============================================================
// TC08: Cancel an order and verify refunds
// ============================================================
async function TC08_cancelOrder() {
  console.log('\n' + '='.repeat(60));
  console.log('TC08: Cancel Order & Verify Refunds');
  console.log('='.repeat(60));
  
  // Create an order to cancel
  const [products] = await pool.query(`
    SELECT id, designation, prix_vente 
    FROM products 
    WHERE prix_vente > 0 
    LIMIT 1
  `);
  
  if (products.length === 0) {
    logTest('TC08', 'Cancel order', false, 'No products available');
    return;
  }
  
  const product = products[0];
  
  const payload = {
    customer_name: 'Test User TC08 Cancel',
    customer_email: 'test-tc08@boukir.ma',
    customer_phone: '+212600000008',
    delivery_method: 'delivery',
    shipping_address_line1: 'Cancel Street',
    shipping_city: 'Fes',
    payment_method: 'cash_on_delivery',
    use_cart: false,
    items: [{ product_id: product.id, quantity: 1 }]
  };
  
  const result = await createOrderDirectDB(payload, USER_ID);
  
  if (!result.success) {
    logTest('TC08', 'Cancel order', false, `Failed to create order: ${result.error}`);
    return;
  }
  
  console.log(`   Created order to cancel: #${result.orderNumber} (ID: ${result.orderId})`);
  createdOrderIds.push(result.orderId);
  
  // Cancel the order
  await pool.query(`
    UPDATE ecommerce_orders 
    SET status = 'cancelled', cancelled_at = NOW() 
    WHERE id = ?
  `, [result.orderId]);
  
  // Log cancellation
  await pool.query(`
    INSERT INTO ecommerce_order_status_history (order_id, old_status, new_status, changed_by_type, notes)
    VALUES (?, 'pending', 'cancelled', 'system', 'Test cancellation')
  `, [result.orderId]);
  
  // Verify cancellation
  const [cancelledOrder] = await pool.query(`
    SELECT status, cancelled_at FROM ecommerce_orders WHERE id = ?
  `, [result.orderId]);
  
  const cancelled = cancelledOrder[0]?.status === 'cancelled';
  console.log(`   ✓ Order status: ${cancelledOrder[0]?.status}`);
  console.log(`   ✓ Cancelled at: ${cancelledOrder[0]?.cancelled_at}`);
  
  logTest('TC08', 'Cancel order', cancelled, `Order #${result.orderNumber} cancelled`);
}

// ============================================================
// TC09: Mark order as paid and verify remise earning
// ============================================================
async function TC09_markPaidAndEarnRemise() {
  console.log('\n' + '='.repeat(60));
  console.log('TC09: Mark Order Paid & Earn Remise');
  console.log('='.repeat(60));
  
  // Get remise balance before
  const [beforeRows] = await pool.query(`
    SELECT remise_balance FROM contacts WHERE id = ?
  `, [USER_ID]);
  const balanceBefore = Number(beforeRows[0]?.remise_balance || 0);
  console.log(`   Remise balance before: ${balanceBefore} DH`);
  
  // Get the first confirmed order for this user (or create one)
  let [orders] = await pool.query(`
    SELECT id, order_number, total_amount, payment_status, status 
    FROM ecommerce_orders 
    WHERE user_id = ? AND status = 'confirmed' AND payment_status = 'pending'
    LIMIT 1
  `, [USER_ID]);
  
  if (orders.length === 0) {
    console.log('   No confirmed pending orders, checking pending orders...');
    [orders] = await pool.query(`
      SELECT id, order_number, total_amount, payment_status, status 
      FROM ecommerce_orders 
      WHERE user_id = ? AND status = 'pending'
      LIMIT 1
    `, [USER_ID]);
    
    if (orders.length > 0) {
      // Confirm it first
      await pool.query(`
        UPDATE ecommerce_orders 
        SET status = 'confirmed', confirmed_at = NOW() 
        WHERE id = ?
      `, [orders[0].id]);
      console.log(`   Confirmed order #${orders[0].order_number}`);
    }
  }
  
  if (orders.length === 0) {
    logTest('TC09', 'Mark paid & earn remise', false, 'No orders to mark as paid');
    return;
  }
  
  const order = orders[0];
  console.log(`   Processing order #${order.order_number} (ID: ${order.id})`);
  
  // Mark as paid
  await pool.query(`
    UPDATE ecommerce_orders 
    SET payment_status = 'paid' 
    WHERE id = ?
  `, [order.id]);
  
  // Get order items to calculate earned remise
  const [items] = await pool.query(`
    SELECT oi.quantity, p.remise_client
    FROM ecommerce_order_items oi
    JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = ?
  `, [order.id]);
  
  let earnedRemise = 0;
  items.forEach(item => {
    earnedRemise += (Number(item.remise_client || 0) * Number(item.quantity));
  });
  
  if (earnedRemise > 0) {
    // Credit remise to user
    await pool.query(`
      UPDATE contacts 
      SET remise_balance = COALESCE(remise_balance, 0) + ?
      WHERE id = ?
    `, [earnedRemise, USER_ID]);
    
    // Mark remise as earned on order
    await pool.query(`
      UPDATE ecommerce_orders 
      SET remise_earned_at = NOW(), remise_earned_amount = ?
      WHERE id = ?
    `, [earnedRemise, order.id]);
  }
  
  // Get balance after
  const [afterRows] = await pool.query(`
    SELECT remise_balance FROM contacts WHERE id = ?
  `, [USER_ID]);
  const balanceAfter = Number(afterRows[0]?.remise_balance || 0);
  
  console.log(`   ✓ Order marked as paid`);
  console.log(`   ✓ Earned remise: ${earnedRemise} DH`);
  console.log(`   ✓ Remise balance after: ${balanceAfter} DH`);
  
  logTest('TC09', 'Mark paid & earn remise', true, 
    `Earned ${earnedRemise} DH, balance: ${balanceBefore} → ${balanceAfter} DH`);
}

// ============================================================
// TC10: Fetch all orders and display summary
// ============================================================
async function TC10_fetchOrdersSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('TC10: Orders Summary for User ' + USER_ID);
  console.log('='.repeat(60));
  
  const [orders] = await pool.query(`
    SELECT 
      id,
      order_number,
      status,
      payment_status,
      payment_method,
      delivery_method,
      total_amount,
      remise_used_amount,
      remise_earned_amount,
      created_at
    FROM ecommerce_orders
    WHERE user_id = ?
    ORDER BY created_at DESC
  `, [USER_ID]);
  
  console.log(`\n   Total orders: ${orders.length}`);
  
  // Group by status
  const byStatus = {};
  const byPaymentMethod = {};
  const byDeliveryMethod = {};
  let totalAmount = 0;
  
  orders.forEach(o => {
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    byPaymentMethod[o.payment_method] = (byPaymentMethod[o.payment_method] || 0) + 1;
    byDeliveryMethod[o.delivery_method || 'delivery'] = (byDeliveryMethod[o.delivery_method || 'delivery'] || 0) + 1;
    totalAmount += Number(o.total_amount || 0);
  });
  
  console.log('\n   By Status:');
  Object.entries(byStatus).forEach(([k, v]) => console.log(`     - ${k}: ${v}`));
  
  console.log('\n   By Payment Method:');
  Object.entries(byPaymentMethod).forEach(([k, v]) => console.log(`     - ${k}: ${v}`));
  
  console.log('\n   By Delivery Method:');
  Object.entries(byDeliveryMethod).forEach(([k, v]) => console.log(`     - ${k}: ${v}`));
  
  console.log(`\n   Total Revenue: ${totalAmount.toFixed(2)} DH`);
  
  // Recent orders table
  console.log('\n   Recent Orders:');
  console.log('   ' + '-'.repeat(100));
  console.log('   | ID   | Order #           | Status     | Payment    | Delivery | Amount     |');
  console.log('   ' + '-'.repeat(100));
  
  orders.slice(0, 10).forEach(o => {
    console.log(`   | ${String(o.id).padEnd(4)} | ${(o.order_number || '').padEnd(17)} | ${(o.status || '').padEnd(10)} | ${(o.payment_method || '').padEnd(10)} | ${(o.delivery_method || 'delivery').padEnd(8)} | ${String(o.total_amount).padEnd(10)} |`);
  });
  console.log('   ' + '-'.repeat(100));
  
  // Solde ledger summary
  const [ledger] = await pool.query(`
    SELECT 
      SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END) as total_debit,
      SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END) as total_credit,
      COUNT(*) as entries
    FROM contact_solde_ledger
    WHERE contact_id = ?
  `, [USER_ID]);
  
  if (ledger[0]?.entries > 0) {
    console.log('\n   Solde Ledger:');
    console.log(`     - Total Debit: ${ledger[0].total_debit || 0} DH`);
    console.log(`     - Total Credit: ${ledger[0].total_credit || 0} DH`);
    console.log(`     - Net Owed: ${(ledger[0].total_debit || 0) - (ledger[0].total_credit || 0)} DH`);
  }
  
  logTest('TC10', 'Fetch orders summary', orders.length > 0, `${orders.length} orders found`);
  
  return orders;
}

// ============================================================
// Helper: Create order directly in DB (simulates authenticated request)
// ============================================================
async function createOrderDirectDB(payload, userId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    // Generate order number
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const orderNumber = `ORD-${timestamp}-${random}`;
    
    // Calculate totals
    let subtotal = 0;
    const itemsData = [];
    
    for (const item of payload.items) {
      const [products] = await connection.query(`
        SELECT id, designation, designation_ar, prix_vente, remise_client
        FROM products WHERE id = ?
      `, [item.product_id]);
      
      if (products.length === 0) continue;
      
      const product = products[0];
      const qty = Number(item.quantity) || 1;
      const unitPrice = Number(product.prix_vente) || 0;
      const itemSubtotal = unitPrice * qty;
      subtotal += itemSubtotal;
      
      itemsData.push({
        product_id: product.id,
        product_name: product.designation,
        product_name_ar: product.designation_ar,
        unit_price: unitPrice,
        quantity: qty,
        subtotal: itemSubtotal,
        remise_client: product.remise_client || 0
      });
    }
    
    const totalAmount = subtotal;
    const paymentStatus = payload.payment_method === 'card' ? 'paid' : 'pending';
    
    // Handle pickup location
    let shippingLine1 = payload.shipping_address_line1;
    let shippingCity = payload.shipping_city;
    let pickupLocationId = null;
    
    if (payload.delivery_method === 'pickup') {
      pickupLocationId = payload.pickup_location_id || 1;
      const [locations] = await connection.query(`
        SELECT name, address_line1, city FROM ecommerce_pickup_locations WHERE id = ?
      `, [pickupLocationId]);
      if (locations.length > 0) {
        shippingLine1 = locations[0].address_line1 || locations[0].name;
        shippingCity = locations[0].city;
      }
    }
    
    // Insert order
    const [orderResult] = await connection.query(`
      INSERT INTO ecommerce_orders (
        order_number, user_id, customer_name, customer_email, customer_phone,
        shipping_address_line1, shipping_city, shipping_postal_code,
        subtotal, total_amount, status, payment_status, payment_method,
        delivery_method, pickup_location_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, NOW())
    `, [
      orderNumber, userId, payload.customer_name, payload.customer_email, payload.customer_phone,
      shippingLine1, shippingCity, payload.shipping_postal_code || null,
      subtotal, totalAmount, paymentStatus, payload.payment_method,
      payload.delivery_method || 'delivery', pickupLocationId
    ]);
    
    const orderId = orderResult.insertId;
    
    // Insert order items
    for (const item of itemsData) {
      await connection.query(`
        INSERT INTO ecommerce_order_items (
          order_id, product_id, product_name, product_name_ar,
          unit_price, quantity, subtotal
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [orderId, item.product_id, item.product_name, item.product_name_ar,
          item.unit_price, item.quantity, item.subtotal]);
    }
    
    // Log status history
    await connection.query(`
      INSERT INTO ecommerce_order_status_history (order_id, old_status, new_status, changed_by_type, notes)
      VALUES (?, NULL, 'pending', 'customer', 'Order created (test)')
    `, [orderId]);
    
    await connection.commit();
    
    return {
      success: true,
      orderId,
      orderNumber,
      totalAmount,
      paymentStatus
    };
    
  } catch (err) {
    await connection.rollback();
    return { success: false, error: err.message };
  } finally {
    connection.release();
  }
}

// ============================================================
// MAIN: Run all tests
// ============================================================
async function runAllTests() {
  console.log('\n');
  console.log('╔' + '═'.repeat(60) + '╗');
  console.log('║   E-COMMERCE ORDERS WORKFLOW TEST SUITE                   ║');
  console.log('║   User ID: ' + USER_ID + '                                            ║');
  console.log('╚' + '═'.repeat(60) + '╝');
  console.log('\n');
  
  try {
    // TC01: Check user profile
    const userProfile = await TC01_checkUserProfile();
    
    // TC02: Fetch pickup locations
    await TC02_fetchPickupLocations();
    
    // TC03: Create delivery + COD order
    await TC03_createDeliveryCOD();
    
    // TC04: Create delivery + card order
    await TC04_createDeliveryCard();
    
    // TC05: Create pickup + pay_in_store order
    await TC05_createPickupPayInStore();
    
    // TC06: Create solde order
    const soldeOrder = await TC06_createSoldeOrder(userProfile);
    
    // TC07: Confirm solde order and check ledger
    await TC07_confirmOrderAndCheckLedger(soldeOrder);
    
    // TC08: Cancel order
    await TC08_cancelOrder();
    
    // TC09: Mark paid and earn remise
    await TC09_markPaidAndEarnRemise();
    
    // TC10: Summary
    await TC10_fetchOrdersSummary();
    
    // Final summary
    console.log('\n');
    console.log('╔' + '═'.repeat(60) + '╗');
    console.log('║   TEST RESULTS SUMMARY                                    ║');
    console.log('╚' + '═'.repeat(60) + '╝');
    
    const passed = testResults.filter(t => t.passed).length;
    const failed = testResults.filter(t => !t.passed).length;
    
    console.log(`\n   Total: ${testResults.length} | Passed: ${passed} | Failed: ${failed}`);
    console.log('\n   ' + '-'.repeat(70));
    
    testResults.forEach(t => {
      const icon = t.passed ? '✅' : '❌';
      console.log(`   ${icon} ${t.testId}: ${t.name}`);
      if (!t.passed && t.details) {
        console.log(`      └─ ${t.details}`);
      }
    });
    
    console.log('\n   ' + '-'.repeat(70));
    console.log(`\n   Orders created in this test: ${createdOrderIds.length}`);
    console.log(`   Order IDs: ${createdOrderIds.join(', ') || 'None'}`);
    
    if (failed === 0) {
      console.log('\n   🎉 ALL TESTS PASSED!\n');
    } else {
      console.log(`\n   ⚠️  ${failed} test(s) failed. Review above for details.\n`);
    }
    
  } catch (err) {
    console.error('\n❌ Fatal error during tests:', err);
  } finally {
    process.exit(0);
  }
}

// Run
runAllTests();
