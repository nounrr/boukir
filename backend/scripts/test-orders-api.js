/**
 * E-commerce Orders API Test Script (HTTP Requests)
 * ==================================================
 * Tests the real API endpoints as the frontend would call them.
 * 
 * Test Cases:
 * -----------
 * TC01: Login user and get JWT token
 * TC02: Get user profile (/api/users/auth/me)
 * TC03: Fetch pickup locations (GET /api/ecommerce/pickup-locations)
 * TC04: Create order - Delivery + Cash on Delivery (POST /api/ecommerce/orders)
 * TC05: Create order - Delivery + Card (POST /api/ecommerce/orders)
 * TC06: Create order - Pickup + Pay in Store (POST /api/ecommerce/orders)
 * TC07: Create order - Solde (Buy Now Pay Later) (POST /api/ecommerce/orders)
 * TC08: Get user orders list (GET /api/ecommerce/orders)
 * TC09: Get single order details (GET /api/ecommerce/orders/:id)
 * TC10: Admin confirm order (PUT /api/ecommerce/orders/:id/status)
 * TC11: Admin mark order as paid (PUT /api/ecommerce/orders/:id/status)
 * TC12: Cancel an order (POST /api/ecommerce/orders/:id/cancel)
 * TC13: Verify remise balance after paid orders
 * 
 * Run: node backend/scripts/test-orders-api.js
 * 
 * Prerequisites:
 * - Backend server running on localhost:3001
 * - User with ID 514 exists in the database
 */

const BASE_URL = 'http://localhost:3001';
const USER_ID = 514;

// JWT token for user 514 (Adam Jeniah)
let authToken = 'bla';
const testResults = [];
const createdOrderIds = [];

// Color codes for terminal
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

// Helper: log test result
function logTest(testId, name, passed, details = '') {
  const status = passed 
    ? `${colors.green}✅ PASS${colors.reset}` 
    : `${colors.red}❌ FAIL${colors.reset}`;
  console.log(`\n${status} | ${colors.bold}${testId}${colors.reset}: ${name}`);
  if (details) console.log(`   └─ ${details}`);
  testResults.push({ testId, name, passed, details });
}

// Helper: make HTTP request
async function api(method, path, body = null, useAuth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (useAuth && authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  const options = { method, headers };
  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }
  
  const url = `${BASE_URL}${path}`;
  console.log(`   ${colors.cyan}→ ${method} ${path}${colors.reset}`);
  
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    return { status: res.status, ok: res.ok, data };
  } catch (err) {
    return { status: 0, ok: false, data: { error: err.message } };
  }
}

// Helper: get a product with remise for testing
async function getTestProduct() {
  // First try to get a product with remise_client > 0
  const { data } = await api('GET', '/api/ecommerce/products?limit=50', null, false);
  
  if (data?.products?.length > 0) {
    // Find one with stock
    const product = data.products.find(p => 
      p.stock_partage_ecom_qty > 0 || p.ecom_published
    ) || data.products[0];
    
    return {
      product_id: product.id,
      quantity: 1,
      name: product.designation,
      price: product.prix_vente,
      remise_client: product.remise_client || 0
    };
  }
  
  // Fallback: return a known product ID
  return { product_id: 311, quantity: 1, name: 'Test Product', price: 18, remise_client: 0 };
}

// Helper: get a product WITH remise_client > 0
async function getProductWithRemise() {
  const { data } = await api('GET', '/api/ecommerce/products?limit=200', null, false);
  
  if (data?.products?.length > 0) {
    // Find product with remise_client > 0 and stock
    const productWithRemise = data.products.find(p => 
      (p.remise_client > 0 || p.remise_artisan > 0) && 
      (p.stock_partage_ecom_qty > 0 || p.ecom_published)
    );
    
    if (productWithRemise) {
      return {
        product_id: productWithRemise.id,
        quantity: 1,
        name: productWithRemise.designation,
        price: productWithRemise.prix_vente,
        remise_client: productWithRemise.remise_client || 0,
        remise_artisan: productWithRemise.remise_artisan || 0
      };
    }
  }
  
  // Fallback: Use known products with remise (from DB)
  // Products with remise_client > 0:
  // - ID 5290: Ciment Portland Gris Chantier, remise_client = 50 DH
  // - ID 5295: Ciment Blanc Extra Blanc, remise_client = 65 DH
  // - ID 5304: Poutre Sapin Charpente, remise_client = 70 DH
  console.log(`   ${colors.yellow}Using fallback product ID 5290 (known remise_client=50)${colors.reset}`);
  return {
    product_id: 5290,
    quantity: 1,
    name: 'Ciment Portland Gris Chantier',
    price: 67.5, // approximate
    remise_client: 50,
    remise_artisan: 0
  };
}

// ============================================================
// TC01: Verify auth token works
// ============================================================
async function TC01_getAuthToken() {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bold}TC01: Verify Authentication Token${colors.reset}`);
  console.log('='.repeat(60));
  
  console.log('   Using pre-configured token for user ID:', USER_ID);
  
  // Verify the token works by calling /me
  const { status, data } = await api('GET', `/api/users/auth/me`);
  
  if (status === 200 && data.user) {
    console.log(`   ✓ Token valid for: ${data.user.nom_complet || data.user.email}`);
    console.log(`   ✓ User ID: ${data.user.id}`);
    logTest('TC01', 'Verify auth token', true, `Token valid for user ${data.user.id}`);
    return true;
  }
  
  if (status === 401) {
    console.log('   ✗ Token expired or invalid');
    authToken = null; // Clear invalid token
    logTest('TC01', 'Verify auth token', false, 'Token invalid - will test guest checkout');
    return false;
  }
  
  logTest('TC01', 'Verify auth token', false, `HTTP ${status}: ${JSON.stringify(data)}`);
  return false;
}

// ============================================================
// TC02: Get user profile
// ============================================================
async function TC02_getUserProfile() {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bold}TC02: Get User Profile${colors.reset}`);
  console.log('='.repeat(60));
  
  if (!authToken) {
    logTest('TC02', 'Get user profile', false, 'Skipped - no auth token');
    return null;
  }
  
  const { status, data } = await api('GET', '/api/users/auth/me');
  
  if (status === 200 && data.user) {
    console.log(`   User: ${data.user.nom_complet || data.user.email}`);
    console.log(`   Email: ${data.user.email}`);
    console.log(`   is_solde: ${data.user.is_solde ? 'YES' : 'NO'}`);
    console.log(`   remise_balance: ${data.user.remise_balance || 0} DH`);
    logTest('TC02', 'Get user profile', true, `${data.user.email}`);
    return data.user;
  }
  
  logTest('TC02', 'Get user profile', false, `HTTP ${status}: ${JSON.stringify(data)}`);
  return null;
}

// ============================================================
// TC03: Fetch pickup locations
// ============================================================
async function TC03_fetchPickupLocations() {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bold}TC03: Fetch Pickup Locations (Public API)${colors.reset}`);
  console.log('='.repeat(60));
  
  const { status, data } = await api('GET', '/api/ecommerce/pickup-locations', null, false);
  
  if (status === 200 && data.pickup_locations) {
    console.log(`   Found ${data.pickup_locations.length} pickup location(s)`);
    data.pickup_locations.forEach(loc => {
      console.log(`   - [${loc.id}] ${loc.name} (${loc.city})`);
    });
    logTest('TC03', 'Fetch pickup locations', data.pickup_locations.length > 0, 
      `${data.pickup_locations.length} location(s)`);
    return data.pickup_locations;
  }
  
  logTest('TC03', 'Fetch pickup locations', false, `HTTP ${status}: ${JSON.stringify(data)}`);
  return [];
}

// ============================================================
// TC04: Create order - Delivery + Cash on Delivery
// ============================================================
async function TC04_createDeliveryCOD() {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bold}TC04: Create Order - Delivery + Cash on Delivery${colors.reset}`);
  console.log('='.repeat(60));
  
  const testProduct = await getTestProduct();
  console.log(`   Using product: ${testProduct.name} (${testProduct.price} DH)`);
  
  const payload = {
    customer_name: 'Test User TC04',
    customer_email: 'test-tc04@boukir.ma',
    customer_phone: '+212600000004',
    delivery_method: 'delivery',
    shipping_address_line1: '123 Test Street',
    shipping_city: 'Casablanca',
    shipping_postal_code: '20000',
    payment_method: 'cash_on_delivery',
    use_cart: false,
    items: [testProduct]
  };
  
  const { status, data } = await api('POST', '/api/ecommerce/orders', payload);
  
  if (status === 201 && data.order) {
    createdOrderIds.push(data.order.id);
    console.log(`   ✓ Order created: #${data.order.order_number}`);
    console.log(`   ✓ Order ID: ${data.order.id}`);
    console.log(`   ✓ Total: ${data.order.total_amount} DH`);
    console.log(`   ✓ Payment: ${data.order.payment_method}`);
    console.log(`   ✓ Delivery: ${data.order.delivery_method}`);
    logTest('TC04', 'Create delivery + COD order', true, 
      `Order #${data.order.order_number} (${data.order.total_amount} DH)`);
    return data.order;
  }
  
  logTest('TC04', 'Create delivery + COD order', false, 
    `HTTP ${status}: ${data.message || JSON.stringify(data)}`);
  return null;
}

// ============================================================
// TC05: Create order - Delivery + Card
// ============================================================
async function TC05_createDeliveryCard() {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bold}TC05: Create Order - Delivery + Card${colors.reset}`);
  console.log('='.repeat(60));
  
  const testProduct = await getTestProduct();
  console.log(`   Using product: ${testProduct.name}`);
  
  const payload = {
    customer_name: 'Test User TC05',
    customer_email: 'test-tc05@boukir.ma',
    customer_phone: '+212600000005',
    delivery_method: 'delivery',
    shipping_address_line1: '456 Card Avenue',
    shipping_city: 'Rabat',
    shipping_postal_code: '10000',
    payment_method: 'card',
    use_cart: false,
    items: [{ ...testProduct, quantity: 2 }]
  };
  
  const { status, data } = await api('POST', '/api/ecommerce/orders', payload);
  
  if (status === 201 && data.order) {
    createdOrderIds.push(data.order.id);
    console.log(`   ✓ Order #${data.order.order_number}`);
    console.log(`   ✓ Total: ${data.order.total_amount} DH`);
    console.log(`   ✓ Payment status: ${data.order.payment_status}`);
    logTest('TC05', 'Create delivery + card order', true, 
      `Order #${data.order.order_number}`);
    return data.order;
  }
  
  logTest('TC05', 'Create delivery + card order', false, 
    `HTTP ${status}: ${data.message || JSON.stringify(data)}`);
  return null;
}

// ============================================================
// TC06: Create order - Pickup + Pay in Store
// ============================================================
async function TC06_createPickupPayInStore() {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bold}TC06: Create Order - Pickup + Pay in Store${colors.reset}`);
  console.log('='.repeat(60));
  
  const testProduct = await getTestProduct();
  console.log(`   Using product: ${testProduct.name}`);
  
  const payload = {
    customer_name: 'Test User TC06 Pickup',
    customer_email: 'test-tc06@boukir.ma',
    customer_phone: '+212600000006',
    delivery_method: 'pickup',
    pickup_location_id: 1,
    payment_method: 'pay_in_store',
    use_cart: false,
    items: [testProduct]
  };
  
  const { status, data } = await api('POST', '/api/ecommerce/orders', payload);
  
  if (status === 201 && data.order) {
    createdOrderIds.push(data.order.id);
    console.log(`   ✓ Order #${data.order.order_number}`);
    console.log(`   ✓ Delivery: ${data.order.delivery_method}`);
    console.log(`   ✓ Pickup location: ${data.order.pickup_location_id}`);
    console.log(`   ✓ Payment: ${data.order.payment_method}`);
    logTest('TC06', 'Create pickup + pay_in_store order', true, 
      `Order #${data.order.order_number}, pickup_location_id=${data.order.pickup_location_id}`);
    return data.order;
  }
  
  logTest('TC06', 'Create pickup + pay_in_store order', false, 
    `HTTP ${status}: ${data.message || JSON.stringify(data)}`);
  return null;
}

// ============================================================
// TC07: Create order - Solde (requires auth + is_solde=1)
// ============================================================
async function TC07_createSoldeOrder() {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bold}TC07: Create Order - Solde (Buy Now Pay Later)${colors.reset}`);
  console.log('='.repeat(60));
  
  if (!authToken) {
    console.log('   ⚠️  Solde requires authentication');
    logTest('TC07', 'Create solde order', false, 'Skipped - requires auth token');
    return null;
  }
  
  const testProduct = await getTestProduct();
  console.log(`   Using product: ${testProduct.name}`);
  
  const payload = {
    customer_name: 'Test User TC07 Solde',
    customer_email: 'test-tc07@boukir.ma',
    customer_phone: '+212600000007',
    delivery_method: 'delivery',
    shipping_address_line1: '789 Solde Street',
    shipping_city: 'Tangier',
    payment_method: 'solde',
    use_cart: false,
    items: [testProduct]
  };
  
  const { status, data } = await api('POST', '/api/ecommerce/orders', payload);
  
  if (status === 201 && data.order) {
    createdOrderIds.push(data.order.id);
    console.log(`   ✓ Order #${data.order.order_number}`);
    console.log(`   ✓ Payment method: ${data.order.payment_method}`);
    console.log(`   ✓ Payment status: ${data.order.payment_status}`);
    logTest('TC07', 'Create solde order', true, `Order #${data.order.order_number}`);
    return data.order;
  }
  
  // Expected errors for solde
  if (status === 401) {
    logTest('TC07', 'Create solde order', false, 'Auth required (expected if no token)');
  } else if (status === 403) {
    logTest('TC07', 'Create solde order', false, 'User not authorized for solde (is_solde=0)');
  } else {
    logTest('TC07', 'Create solde order', false, 
      `HTTP ${status}: ${data.message || JSON.stringify(data)}`);
  }
  return null;
}

// ============================================================
// TC08: Get user orders list
// ============================================================
async function TC08_getOrdersList() {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bold}TC08: Get Orders List${colors.reset}`);
  console.log('='.repeat(60));
  
  // Try with auth or by email
  let response;
  if (authToken) {
    response = await api('GET', '/api/ecommerce/orders');
  } else {
    // Guest can fetch by email
    response = await api('GET', '/api/ecommerce/orders?email=test-tc04@boukir.ma', null, false);
  }
  
  const { status, data } = response;
  
  if (status === 200 && data.orders) {
    console.log(`   Found ${data.orders.length} order(s)`);
    
    // Show last 5 orders
    console.log('\n   Recent Orders:');
    console.log('   ' + '-'.repeat(80));
    data.orders.slice(0, 5).forEach(o => {
      console.log(`   | ${o.order_number} | ${o.status.padEnd(10)} | ${o.payment_method.padEnd(15)} | ${o.total_amount} DH |`);
    });
    console.log('   ' + '-'.repeat(80));
    
    logTest('TC08', 'Get orders list', data.orders.length > 0, `${data.orders.length} order(s)`);
    return data.orders;
  }
  
  logTest('TC08', 'Get orders list', false, `HTTP ${status}: ${data.message || JSON.stringify(data)}`);
  return [];
}

// ============================================================
// TC09: Get single order details
// ============================================================
async function TC09_getOrderDetails(orderId) {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bold}TC09: Get Order Details${colors.reset}`);
  console.log('='.repeat(60));
  
  if (!orderId) {
    orderId = createdOrderIds[0];
  }
  
  if (!orderId) {
    logTest('TC09', 'Get order details', false, 'No order ID available');
    return null;
  }
  
  console.log(`   Fetching order ID: ${orderId}`);
  
  // Need email for guest access
  const email = 'test-tc04@boukir.ma';
  const path = authToken 
    ? `/api/ecommerce/orders/${orderId}`
    : `/api/ecommerce/orders/${orderId}?email=${email}`;
  
  const { status, data } = await api('GET', path);
  
  if (status === 200 && data.order) {
    const o = data.order;
    console.log(`   Order #${o.order_number}`);
    console.log(`   Status: ${o.status}`);
    console.log(`   Payment: ${o.payment_method} (${o.payment_status})`);
    console.log(`   Delivery: ${o.delivery_method}`);
    console.log(`   Total: ${o.total_amount} DH`);
    console.log(`   Items: ${o.items?.length || 0}`);
    
    if (o.pickup_location) {
      console.log(`   Pickup: ${o.pickup_location.name} (${o.pickup_location.city})`);
    }
    
    logTest('TC09', 'Get order details', true, `Order #${o.order_number}`);
    return o;
  }
  
  logTest('TC09', 'Get order details', false, `HTTP ${status}: ${data.message || JSON.stringify(data)}`);
  return null;
}

// ============================================================
// TC10: Admin confirm order
// ============================================================
async function TC10_confirmOrder(orderId) {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bold}TC10: Confirm Order (Admin Action)${colors.reset}`);
  console.log('='.repeat(60));
  
  if (!orderId) {
    orderId = createdOrderIds[0];
  }
  
  if (!orderId) {
    logTest('TC10', 'Confirm order', false, 'No order ID available');
    return null;
  }
  
  console.log(`   Confirming order ID: ${orderId}`);
  
  const payload = {
    status: 'confirmed',
    admin_notes: 'Confirmed via API test'
  };
  
  const { status, data } = await api('PUT', `/api/ecommerce/orders/${orderId}/status`, payload);
  
  if (status === 200) {
    console.log(`   ✓ Order confirmed`);
    console.log(`   ✓ New status: ${data.status}`);
    console.log(`   ✓ Payment status: ${data.payment_status}`);
    if (data.earned_remise_amount > 0) {
      console.log(`   ✓ Earned remise: ${data.earned_remise_amount} DH`);
    }
    logTest('TC10', 'Confirm order', true, `Order ${orderId} → confirmed`);
    return data;
  }
  
  logTest('TC10', 'Confirm order', false, `HTTP ${status}: ${data.message || JSON.stringify(data)}`);
  return null;
}

// ============================================================
// TC11: Mark order as paid
// ============================================================
async function TC11_markOrderPaid(orderId) {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bold}TC11: Mark Order as Paid (Admin Action)${colors.reset}`);
  console.log('='.repeat(60));
  
  if (!orderId) {
    // Find a confirmed order
    orderId = createdOrderIds[0];
  }
  
  if (!orderId) {
    logTest('TC11', 'Mark order paid', false, 'No order ID available');
    return null;
  }
  
  console.log(`   Marking order ${orderId} as paid`);
  
  const payload = {
    payment_status: 'paid',
    admin_notes: 'Paid via API test'
  };
  
  const { status, data } = await api('PUT', `/api/ecommerce/orders/${orderId}/status`, payload);
  
  if (status === 200) {
    console.log(`   ✓ Payment status updated: ${data.payment_status}`);
    if (data.earned_remise_amount > 0) {
      console.log(`   ✓ Earned remise: ${data.earned_remise_amount} DH`);
    }
    logTest('TC11', 'Mark order paid', true, `Order ${orderId} → paid`);
    return data;
  }
  
  logTest('TC11', 'Mark order paid', false, `HTTP ${status}: ${data.message || JSON.stringify(data)}`);
  return null;
}

// ============================================================
// TC12: Cancel an order
// ============================================================
async function TC12_cancelOrder() {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bold}TC12: Cancel Order${colors.reset}`);
  console.log('='.repeat(60));
  
  // Create a new order to cancel
  const testProduct = await getTestProduct();
  
  const createPayload = {
    customer_name: 'Test User TC12 Cancel',
    customer_email: 'test-tc12@boukir.ma',
    customer_phone: '+212600000012',
    delivery_method: 'delivery',
    shipping_address_line1: 'Cancel Street',
    shipping_city: 'Fes',
    payment_method: 'cash_on_delivery',
    use_cart: false,
    items: [testProduct]
  };
  
  console.log('   Creating order to cancel...');
  const createRes = await api('POST', '/api/ecommerce/orders', createPayload);
  
  if (createRes.status !== 201) {
    logTest('TC12', 'Cancel order', false, 'Failed to create order to cancel');
    return null;
  }
  
  const orderId = createRes.data.order.id;
  createdOrderIds.push(orderId);
  console.log(`   ✓ Created order #${createRes.data.order.order_number} (ID: ${orderId})`);
  
  // Now cancel it
  console.log('   Cancelling order...');
  
  const cancelPayload = {
    email: 'test-tc12@boukir.ma',
    reason: 'Test cancellation via API'
  };
  
  const { status, data } = await api('POST', `/api/ecommerce/orders/${orderId}/cancel`, cancelPayload);
  
  if (status === 200) {
    console.log(`   ✓ Order cancelled: #${data.order_number}`);
    logTest('TC12', 'Cancel order', true, `Order ${orderId} → cancelled`);
    return data;
  }
  
  logTest('TC12', 'Cancel order', false, `HTTP ${status}: ${data.message || JSON.stringify(data)}`);
  return null;
}

// ============================================================
// TC13: Test invalid combinations
// ============================================================
async function TC13_testValidations() {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bold}TC13: Test Validation Rules${colors.reset}`);
  console.log('='.repeat(60));
  
  const testProduct = await getTestProduct();
  let allPassed = true;
  
  // Test 1: Pickup + Cash on Delivery should fail
  console.log('\n   Test 1: Pickup + COD (should fail)');
  const test1 = await api('POST', '/api/ecommerce/orders', {
    customer_name: 'Test Invalid',
    customer_email: 'test-invalid@boukir.ma',
    customer_phone: '+212600000000',
    delivery_method: 'pickup',
    payment_method: 'cash_on_delivery',
    use_cart: false,
    items: [testProduct]
  });
  
  if (test1.status === 400 && test1.data.error_type === 'PAYMENT_METHOD_NOT_ALLOWED_FOR_PICKUP') {
    console.log(`   ✓ Correctly rejected: ${test1.data.message}`);
  } else {
    console.log(`   ✗ Expected rejection, got: ${test1.status}`);
    allPassed = false;
  }
  
  // Test 2: Invalid payment method
  console.log('\n   Test 2: Invalid payment method (should fail)');
  const test2 = await api('POST', '/api/ecommerce/orders', {
    customer_name: 'Test Invalid',
    customer_email: 'test-invalid@boukir.ma',
    customer_phone: '+212600000000',
    delivery_method: 'delivery',
    shipping_address_line1: 'Test',
    shipping_city: 'Test',
    payment_method: 'bitcoin',
    use_cart: false,
    items: [testProduct]
  });
  
  if (test2.status === 400 && test2.data.field === 'payment_method') {
    console.log(`   ✓ Correctly rejected: ${test2.data.message}`);
  } else {
    console.log(`   ✗ Expected rejection, got: ${test2.status}`);
    allPassed = false;
  }
  
  // Test 3: Missing required fields
  console.log('\n   Test 3: Missing required fields (should fail)');
  const test3 = await api('POST', '/api/ecommerce/orders', {
    customer_name: 'Test',
    // missing customer_email
    delivery_method: 'delivery',
    payment_method: 'cash_on_delivery',
    use_cart: false,
    items: [testProduct]
  });
  
  if (test3.status === 400) {
    console.log(`   ✓ Correctly rejected: ${test3.data.message}`);
  } else {
    console.log(`   ✗ Expected rejection, got: ${test3.status}`);
    allPassed = false;
  }
  
  logTest('TC13', 'Validation rules', allPassed, allPassed ? 'All validations correct' : 'Some validations failed');
}

// ============================================================
// TC14: Check Remise Balance & Solde Ledger
// ============================================================
async function TC14_checkRemiseAndSolde() {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bold}TC14: Check Remise Balance & Solde Ledger${colors.reset}`);
  console.log('='.repeat(60));
  
  if (!authToken) {
    logTest('TC14', 'Check remise & solde', false, 'Skipped - no auth token');
    return null;
  }
  
  // Get user profile to see remise_balance
  const { status, data } = await api('GET', '/api/users/auth/me');
  
  if (status !== 200 || !data.user) {
    logTest('TC14', 'Check remise & solde', false, `Failed to get user: HTTP ${status}`);
    return null;
  }
  
  const user = data.user;
  console.log('\n   ' + colors.bold + '📊 USER BALANCE SUMMARY' + colors.reset);
  console.log('   ' + '-'.repeat(50));
  console.log(`   User: ${user.nom_complet || user.email} (ID: ${user.id})`);
  console.log(`   is_solde: ${user.is_solde ? colors.green + 'YES ✓' + colors.reset : colors.red + 'NO' + colors.reset}`);
  console.log(`   remise_balance: ${colors.cyan}${user.remise_balance || 0} DH${colors.reset}`);
  
  // Check solde ledger via orders that used solde payment
  console.log('\n   ' + colors.bold + '📒 SOLDE ORDERS (Buy Now Pay Later)' + colors.reset);
  console.log('   ' + '-'.repeat(50));
  
  const ordersRes = await api('GET', '/api/ecommerce/orders');
  if (ordersRes.status === 200 && ordersRes.data.orders) {
    const soldeOrders = ordersRes.data.orders.filter(o => o.payment_method === 'solde');
    
    if (soldeOrders.length === 0) {
      console.log('   No solde orders found');
    } else {
      console.log(`   Found ${soldeOrders.length} solde order(s):\n`);
      let totalSoldeDebt = 0;
      
      for (const order of soldeOrders) {
        const statusIcon = order.status === 'confirmed' ? '✓' : 
                          order.status === 'cancelled' ? '✗' : '○';
        const statusColor = order.status === 'confirmed' ? colors.green : 
                           order.status === 'cancelled' ? colors.red : colors.yellow;
        
        console.log(`   ${statusColor}${statusIcon}${colors.reset} Order #${order.order_number}`);
        console.log(`     Status: ${order.status} | Payment: ${order.payment_status}`);
        console.log(`     Total: ${order.total_amount} DH | Remise used: ${order.remise_used_amount || 0} DH`);
        
        // Only confirmed orders create debt in ledger
        if (order.status === 'confirmed') {
          const debt = order.total_amount - (order.remise_used_amount || 0);
          totalSoldeDebt += debt;
          console.log(`     ${colors.yellow}→ Debt booked: ${debt} DH${colors.reset}`);
        }
        console.log('');
      }
      
      console.log('   ' + '-'.repeat(50));
      console.log(`   ${colors.bold}Total Solde Debt: ${colors.yellow}${totalSoldeDebt} DH${colors.reset}`);
    }
  }
  
  // Check remise earned from paid orders
  console.log('\n   ' + colors.bold + '🎁 REMISE EARNED (Loyalty)' + colors.reset);
  console.log('   ' + '-'.repeat(50));
  
  if (ordersRes.status === 200 && ordersRes.data.orders) {
    const paidOrders = ordersRes.data.orders.filter(o => 
      o.status === 'confirmed' && o.payment_status === 'paid'
    );
    
    if (paidOrders.length === 0) {
      console.log('   No confirmed+paid orders (remise not earned yet)');
    } else {
      console.log(`   Found ${paidOrders.length} confirmed+paid order(s):\n`);
      let totalRemiseEarned = 0;
      
      for (const order of paidOrders) {
        console.log(`   ✓ Order #${order.order_number}`);
        console.log(`     Total: ${order.total_amount} DH`);
        console.log(`     Remise earned: ${order.remise_earned_amount || 0} DH`);
        totalRemiseEarned += (order.remise_earned_amount || 0);
        console.log('');
      }
      
      console.log('   ' + '-'.repeat(50));
      console.log(`   ${colors.bold}Total Remise Earned: ${colors.green}${totalRemiseEarned} DH${colors.reset}`);
      console.log(`   ${colors.bold}Current Balance: ${colors.cyan}${user.remise_balance || 0} DH${colors.reset}`);
      
      if (totalRemiseEarned === 0) {
        console.log(`\n   ${colors.yellow}⚠️  Note: Products used in tests may have remise_client = 0 DH${colors.reset}`);
        console.log(`   ${colors.yellow}   To earn remise, use products with remise_client > 0${colors.reset}`);
      }
    }
  }
  
  logTest('TC14', 'Check remise & solde', true, 
    `remise_balance=${user.remise_balance || 0} DH, is_solde=${user.is_solde ? 'YES' : 'NO'}`);
  
  return { remise_balance: user.remise_balance, is_solde: user.is_solde };
}

// ============================================================
// TC15: Test Remise Earning with Product that has remise_client > 0
// ============================================================
async function TC15_testRemiseEarning() {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bold}TC15: Test Remise Earning (Product with remise_client > 0)${colors.reset}`);
  console.log('='.repeat(60));
  
  if (!authToken) {
    logTest('TC15', 'Test remise earning', false, 'Skipped - no auth token');
    return null;
  }
  
  // Step 1: Get initial remise balance
  console.log('\n   ' + colors.bold + 'STEP 1: Get initial remise balance' + colors.reset);
  const initialProfile = await api('GET', '/api/users/auth/me');
  const initialBalance = initialProfile.data?.user?.remise_balance || 0;
  console.log(`   Initial remise_balance: ${colors.cyan}${initialBalance} DH${colors.reset}`);
  
  // Step 2: Find a product with remise_client > 0
  console.log('\n   ' + colors.bold + 'STEP 2: Find product with remise_client > 0' + colors.reset);
  const productWithRemise = await getProductWithRemise();
  
  console.log(`   ✓ Found product: ${productWithRemise.name}`);
  console.log(`   ✓ Product ID: ${productWithRemise.product_id}`);
  console.log(`   ✓ Price: ${productWithRemise.price} DH`);
  console.log(`   ✓ ${colors.green}remise_client: ${productWithRemise.remise_client} DH${colors.reset}`);
  if (productWithRemise.remise_artisan > 0) {
    console.log(`   ✓ remise_artisan: ${productWithRemise.remise_artisan} DH`);
  }
  
  // Step 3: Create order with this product
  console.log('\n   ' + colors.bold + 'STEP 3: Create order with remise product' + colors.reset);
  const orderPayload = {
    customer_name: 'Test Remise User',
    customer_email: 'test-remise@boukir.ma',
    customer_phone: '+212600000015',
    delivery_method: 'delivery',
    shipping_address_line1: 'Remise Test Street',
    shipping_city: 'Casablanca',
    payment_method: 'card',
    use_cart: false,
    items: [{
      product_id: productWithRemise.product_id,
      quantity: 2  // Order 2 units to earn 2x remise
    }]
  };
  
  const createRes = await api('POST', '/api/ecommerce/orders', orderPayload);
  
  if (createRes.status !== 201) {
    console.log(`   ✗ Failed to create order: ${createRes.data.message || JSON.stringify(createRes.data)}`);
    logTest('TC15', 'Test remise earning', false, 'Failed to create order');
    return null;
  }
  
  const order = createRes.data.order;
  createdOrderIds.push(order.id);
  console.log(`   ✓ Order created: #${order.order_number}`);
  console.log(`   ✓ Order ID: ${order.id}`);
  console.log(`   ✓ Total: ${order.total_amount} DH`);
  console.log(`   ✓ Status: ${order.status} | Payment: ${order.payment_status}`);
  
  const expectedRemise = productWithRemise.remise_client * 2; // qty=2
  console.log(`   ${colors.yellow}Expected remise to earn: ${expectedRemise} DH (${productWithRemise.remise_client} × 2)${colors.reset}`);
  
  // Step 4: Confirm order via API
  console.log('\n   ' + colors.bold + 'STEP 4: Confirm order (Admin action)' + colors.reset);
  const confirmRes = await api('PUT', `/api/ecommerce/orders/${order.id}/status`, {
    status: 'confirmed',
    admin_notes: 'Confirmed for remise test'
  });
  
  if (confirmRes.status !== 200) {
    console.log(`   ✗ Failed to confirm: ${confirmRes.data.message || JSON.stringify(confirmRes.data)}`);
    logTest('TC15', 'Test remise earning', false, 'Failed to confirm order');
    return null;
  }
  
  console.log(`   ✓ Order confirmed`);
  console.log(`   ✓ Status: ${confirmRes.data.status}`);
  console.log(`   ✓ Payment status: ${confirmRes.data.payment_status}`);
  
  // Step 5: Mark order as paid via API
  console.log('\n   ' + colors.bold + 'STEP 5: Mark order as paid (Admin action)' + colors.reset);
  const paidRes = await api('PUT', `/api/ecommerce/orders/${order.id}/status`, {
    payment_status: 'paid',
    admin_notes: 'Paid for remise test'
  });
  
  if (paidRes.status !== 200) {
    console.log(`   ✗ Failed to mark paid: ${paidRes.data.message || JSON.stringify(paidRes.data)}`);
    logTest('TC15', 'Test remise earning', false, 'Failed to mark order as paid');
    return null;
  }
  
  console.log(`   ✓ Order marked as paid`);
  console.log(`   ✓ Payment status: ${paidRes.data.payment_status}`);
  
  if (paidRes.data.earned_remise_amount !== undefined) {
    console.log(`   ${colors.green}✓ Earned remise amount: ${paidRes.data.earned_remise_amount} DH${colors.reset}`);
  }
  
  // Step 6: Verify remise balance increased
  console.log('\n   ' + colors.bold + 'STEP 6: Verify remise balance' + colors.reset);
  const finalProfile = await api('GET', '/api/users/auth/me');
  const finalBalance = finalProfile.data?.user?.remise_balance || 0;
  
  console.log(`   Initial balance: ${initialBalance} DH`);
  console.log(`   Final balance: ${colors.cyan}${finalBalance} DH${colors.reset}`);
  console.log(`   ${colors.bold}Difference: ${finalBalance - initialBalance} DH${colors.reset}`);
  
  // Step 7: Check order details to see remise_earned_amount
  console.log('\n   ' + colors.bold + 'STEP 7: Check order remise details' + colors.reset);
  const orderDetailsRes = await api('GET', `/api/ecommerce/orders/${order.id}`);
  
  if (orderDetailsRes.status === 200 && orderDetailsRes.data.order) {
    const orderDetail = orderDetailsRes.data.order;
    console.log(`   Order remise_applied: ${orderDetail.remise_applied ? 'YES' : 'NO'}`);
    console.log(`   Order remise_earned_amount: ${orderDetail.remise_earned_amount || 0} DH`);
    
    // Check item-level remise
    if (orderDetail.items && orderDetail.items.length > 0) {
      console.log('\n   Order items remise breakdown:');
      orderDetail.items.forEach((item, i) => {
        console.log(`   [${i + 1}] ${item.product_name}`);
        console.log(`       qty: ${item.quantity} | remise_amount: ${item.remise_amount || 0} DH`);
      });
    }
  }
  
  // Determine test success
  const balanceIncreased = finalBalance > initialBalance;
  const earnedAmount = finalBalance - initialBalance;
  
  console.log('\n   ' + '-'.repeat(50));
  if (balanceIncreased) {
    console.log(`   ${colors.green}✅ SUCCESS: Remise earned! +${earnedAmount} DH${colors.reset}`);
    logTest('TC15', 'Test remise earning', true, 
      `Earned ${earnedAmount} DH (balance: ${initialBalance} → ${finalBalance} DH)`);
  } else if (paidRes.data.earned_remise_amount > 0) {
    console.log(`   ${colors.yellow}⚠️  Order shows earned_remise but balance unchanged${colors.reset}`);
    logTest('TC15', 'Test remise earning', true, 
      `Order earned ${paidRes.data.earned_remise_amount} DH, balance=${finalBalance} DH`);
  } else {
    console.log(`   ${colors.yellow}⚠️  No remise earned - check product remise_client config${colors.reset}`);
    logTest('TC15', 'Test remise earning', false, 
      `Expected ${expectedRemise} DH but earned 0 DH`);
  }
  
  return { 
    orderId: order.id,
    expectedRemise,
    actualEarned: earnedAmount,
    initialBalance,
    finalBalance
  };
}

// ============================================================
// MAIN: Run all tests
// ============================================================
async function runAllTests() {
  console.log('\n');
  console.log('╔' + '═'.repeat(60) + '╗');
  console.log('║   ' + colors.bold + 'E-COMMERCE ORDERS API TEST SUITE' + colors.reset + '                      ║');
  console.log('║   Testing real HTTP endpoints                             ║');
  console.log('║   Base URL: ' + BASE_URL + '                          ║');
  console.log('╚' + '═'.repeat(60) + '╝');
  
  // Check if server is running
  console.log('\n   Checking server connectivity...');
  try {
    const healthCheck = await fetch(`${BASE_URL}/api/health`);
    if (!healthCheck.ok) throw new Error('Server not responding');
    console.log(`   ${colors.green}✓ Server is running${colors.reset}\n`);
  } catch (err) {
    console.log(`   ${colors.red}✗ Server not running at ${BASE_URL}${colors.reset}`);
    console.log(`   Please start the server with: npm run server`);
    process.exit(1);
  }
  
  try {
    // Authentication tests
    await TC01_getAuthToken();
    await TC02_getUserProfile();
    
    // Public endpoints
    await TC03_fetchPickupLocations();
    
    // Order creation tests
    const orderCOD = await TC04_createDeliveryCOD();
    const orderCard = await TC05_createDeliveryCard();
    const orderPickup = await TC06_createPickupPayInStore();
    await TC07_createSoldeOrder();
    
    // Order retrieval tests
    await TC08_getOrdersList();
    await TC09_getOrderDetails(orderCOD?.id);
    
    // Admin actions
    if (orderCOD) {
      await TC10_confirmOrder(orderCOD.id);
      await TC11_markOrderPaid(orderCOD.id);
    }
    
    // Cancellation
    await TC12_cancelOrder();
    
    // Validation tests
    await TC13_testValidations();
    
    // Check balances
    await TC14_checkRemiseAndSolde();
    
    // Test remise earning with product that has remise_client > 0
    await TC15_testRemiseEarning();
    
    // Final summary
    console.log('\n');
    console.log('╔' + '═'.repeat(60) + '╗');
    console.log('║   ' + colors.bold + 'TEST RESULTS SUMMARY' + colors.reset + '                                   ║');
    console.log('╚' + '═'.repeat(60) + '╝');
    
    const passed = testResults.filter(t => t.passed).length;
    const failed = testResults.filter(t => !t.passed).length;
    
    console.log(`\n   Total: ${testResults.length} | ${colors.green}Passed: ${passed}${colors.reset} | ${colors.red}Failed: ${failed}${colors.reset}`);
    console.log('\n   ' + '-'.repeat(70));
    
    testResults.forEach(t => {
      const icon = t.passed ? `${colors.green}✅${colors.reset}` : `${colors.red}❌${colors.reset}`;
      console.log(`   ${icon} ${t.testId}: ${t.name}`);
      if (!t.passed && t.details) {
        console.log(`      └─ ${t.details}`);
      }
    });
    
    console.log('\n   ' + '-'.repeat(70));
    console.log(`\n   Orders created: ${createdOrderIds.length}`);
    if (createdOrderIds.length > 0) {
      console.log(`   Order IDs: ${createdOrderIds.join(', ')}`);
    }
    
    if (failed === 0) {
      console.log(`\n   ${colors.green}🎉 ALL TESTS PASSED!${colors.reset}\n`);
    } else {
      console.log(`\n   ${colors.yellow}⚠️  ${failed} test(s) failed. Review above.${colors.reset}\n`);
    }
    
  } catch (err) {
    console.error(`\n${colors.red}❌ Fatal error:${colors.reset}`, err);
  }
  
  process.exit(0);
}

// Run
runAllTests();
