/*
  E-commerce Shipping Endpoints Test Script

  - Makes REAL HTTP calls to the running API.
  - Does NOT print or hardcode secrets.

  Usage (PowerShell):
    $env:ECOM_BASE_URL = "http://localhost:3001"
    $env:ECOM_TOKEN    = "<paste-jwt-here>"
    $env:SHIP_LAT      = "35.758423"
    $env:SHIP_LNG      = "-5.800450150969058"
    node backend/scripts/test-ecommerce-shipping-endpoints.mjs

  Usage (bash):
    export ECOM_BASE_URL="http://localhost:3001"
    export ECOM_TOKEN="<paste-jwt-here>"
    export SHIP_LAT="35.758423"
    export SHIP_LNG="-5.800450150969058"
    node backend/scripts/test-ecommerce-shipping-endpoints.mjs

  Optional (creates REAL orders):
    export DO_CREATE_ORDER=1

  Notes:
  - /quote will only work with use_cart=true if ECOM_TOKEN is set.
  - This script verifies that /quote does NOT leak sensitive shipping details.
*/

import 'dotenv/config';

const BASE_URL = (process.env.ECOM_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const TOKEN = process.env.ECOM_TOKEN || '';

const SHIP_LAT = process.env.SHIP_LAT != null ? Number(process.env.SHIP_LAT) : 35.758423;
const SHIP_LNG = process.env.SHIP_LNG != null ? Number(process.env.SHIP_LNG) : -5.800450150969058;

const DO_CREATE_ORDER = String(process.env.DO_CREATE_ORDER || '').trim() === '1';

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function apiRequest(path, { method = 'GET', body = undefined, auth = false } = {}) {
  const url = `${BASE_URL}${path}`;

  const headers = {
    'content-type': 'application/json',
  };

  if (auth) {
    if (!TOKEN) {
      throw new Error(`Missing ECOM_TOKEN env var for authenticated call: ${path}`);
    }
    headers.authorization = `Bearer ${TOKEN}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  return { status: res.status, ok: res.ok, json };
}

function printSection(title) {
  console.log('\n' + '='.repeat(80));
  console.log(title);
  console.log('='.repeat(80));
}

function verifyQuotePrivacy(quoteJson) {
  // We only want: summary.items_count, summary.shipping_label
  const summary = quoteJson?.summary;
  assert(summary && typeof summary === 'object', 'Quote response missing summary');

  const allowedSummaryKeys = new Set(['items_count', 'shipping_label']);
  const keys = Object.keys(summary);
  const unexpected = keys.filter((k) => !allowedSummaryKeys.has(k));

  assert(unexpected.length === 0, `Quote summary leaks extra fields: ${unexpected.join(', ')}`);

  // Explicitly ensure old sensitive fields are not present.
  const forbidden = ['contains_kg', 'total_kg', 'shipping_reason', 'distance_km', 'store_location'];
  for (const k of forbidden) {
    assert(!(k in summary), `Quote summary should not include '${k}'`);
  }
}

async function scenarioQuoteCart() {
  printSection('SCENARIO: /quote (use_cart=true, with coordinates)');

  const body = {
    use_cart: true,
    delivery_method: 'delivery',
    shipping_location: { lat: SHIP_LAT, lng: SHIP_LNG },
  };

  const { status, ok, json } = await apiRequest('/api/ecommerce/orders/quote', {
    method: 'POST',
    body,
    auth: true,
  });

  console.log('Status:', status);
  console.log('Response:', safeJson(json));

  assert(ok, 'Quote (cart) failed');
  verifyQuotePrivacy(json);
}

async function scenarioQuoteDirectDemoItems() {
  printSection('SCENARIO: /quote (use_cart=false, demo items, with coordinates)');

  // Based on your shared cart example:
  // - Demo - Bois #1 (product 5311, variant 161)
  // - Ciment Blanc Extra Blanc (product 5273, unit 33)
  const body = {
    use_cart: false,
    delivery_method: 'delivery',
    shipping_location: { lat: SHIP_LAT, lng: SHIP_LNG },
    items: [
      { product_id: 5311, variant_id: 161, unit_id: null, quantity: 5 },
      { product_id: 5273, variant_id: null, unit_id: 33, quantity: 20 },
    ],
  };

  const { status, ok, json } = await apiRequest('/api/ecommerce/orders/quote', {
    method: 'POST',
    body,
    auth: false, // guest/direct items doesn't require token
  });

  console.log('Status:', status);
  console.log('Response:', safeJson(json));

  assert(ok, 'Quote (direct items) failed');
  verifyQuotePrivacy(json);
}

async function scenarioCheckoutCreateOrderFromDirectItems() {
  if (!DO_CREATE_ORDER) return;

  printSection('SCENARIO: /orders (CREATE REAL ORDER, use_cart=false)');

  const body = {
    customer_name: 'Shipping Test User',
    customer_email: 'shipping-test@example.com',
    customer_phone: '+212600000000',
    shipping_address_line1: 'Test Address 1',
    shipping_city: 'Tangier',
    shipping_location: { lat: SHIP_LAT, lng: SHIP_LNG },

    delivery_method: 'delivery',
    payment_method: 'cash_on_delivery',

    use_cart: false,
    items: [
      { product_id: 5311, variant_id: 161, unit_id: null, quantity: 5 },
      { product_id: 5273, variant_id: null, unit_id: 33, quantity: 20 },
    ],
  };

  const { status, ok, json } = await apiRequest('/api/ecommerce/orders', {
    method: 'POST',
    body,
    auth: false, // guest checkout supported
  });

  console.log('Status:', status);
  console.log('Response:', safeJson(json));

  assert(ok, 'Checkout create order failed');
}

async function scenarioCartDebugUser() {
  printSection('SCENARIO: /cart/debug/user (auth check)');
  const { status, ok, json } = await apiRequest('/api/ecommerce/cart/debug/user', {
    method: 'GET',
    auth: true,
  });
  console.log('Status:', status);
  console.log('Response:', safeJson(json));
  assert(ok, 'Cart debug user failed (token invalid?)');
}

async function main() {
  console.log('Base URL:', BASE_URL);
  console.log('Auth token provided:', TOKEN ? 'yes' : 'no');
  console.log('Coordinates:', { lat: SHIP_LAT, lng: SHIP_LNG });
  console.log('Create orders:', DO_CREATE_ORDER ? 'YES (will create real orders)' : 'no');

  // Basic auth sanity
  await scenarioCartDebugUser();

  // Quotes
  await scenarioQuoteCart();
  await scenarioQuoteDirectDemoItems();

  // Optional: create a real order (side effects)
  await scenarioCheckoutCreateOrderFromDirectItems();

  printSection('DONE');
  console.log('All scenarios completed.');
}

main().catch((err) => {
  console.error('\nFAILED:', err?.message || err);
  process.exit(1);
});
