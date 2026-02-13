/*
  Real E-commerce Customer Test Cases (End-to-End)

  What this script does (like a real customer):
    1) Registers a new ecommerce user
    2) Logs in to get JWT
    3) Browses products via public ecommerce API
    4) Clears cart, adds items
    5) Calls /quote (use_cart=true)
    6) Creates an order (use_cart=true)
    7) Fetches order details and verifies shipping_cost matches quote

  Run:
    node test-ecommerce-customer-tests.mjs

  Env vars:
    BASE_URL=http://localhost:3001
    LAT=35.758423
    LNG=-5.800450150969058

  Notes:
    - Password is generated randomly per run.
    - Token is never printed.
*/

import 'dotenv/config';
import { getStoreLocation, haversineDistanceKm } from './backend/utils/geo.js';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const LAT = process.env.LAT != null ? Number(process.env.LAT) : 35.758423;
const LNG = process.env.LNG != null ? Number(process.env.LNG) : -5.800450150969058;

function round2(v) {
  return Math.round(Number(v || 0) * 100) / 100;
}

function round3(v) {
  return Math.round(Number(v || 0) * 1000) / 1000;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiRequest(path, { method = 'GET', body, token } = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;

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

  return { ok: res.ok, status: res.status, json };
}

function printHeader(title) {
  console.log('\n' + '='.repeat(100));
  console.log(title);
  console.log('='.repeat(100));
}

function verifyQuotePrivacy(quoteJson) {
  const summary = quoteJson?.summary;
  assert(summary && typeof summary === 'object', 'Quote response missing summary');

  const allowedSummaryKeys = new Set(['items_count', 'shipping_label']);
  const keys = Object.keys(summary);
  const unexpected = keys.filter((k) => !allowedSummaryKeys.has(k));
  assert(unexpected.length === 0, `Quote summary leaks extra fields: ${unexpected.join(', ')}`);
}

function distanceRatePerKm(distanceKm) {
  const km = Number(distanceKm);
  if (!Number.isFinite(km) || km < 0) return null;
  if (km < 2) return 25;
  if (km < 4) return 20;
  if (km < 6) return 17;
  return 12;
}

function expectedDistanceShipping(distanceKm) {
  const rate = distanceRatePerKm(distanceKm);
  if (!rate) return null;
  return round2(Number(distanceKm) * rate);
}

async function registerAndLoginCustomer() {
  printHeader('AUTH: register + login');

  const ts = Date.now();
  const email = `scenario.customer.${ts}@example.com`;
  const password = `Pass_${ts}_XyZ!`;

  const register = await apiRequest('/api/users/auth/register', {
    method: 'POST',
    body: {
      prenom: 'Scenario',
      nom: 'Customer',
      email,
      telephone: '0612345678',
      type_compte: 'Client',
      password,
      confirm_password: password,
    },
  });

  console.log('Register:', register.status, register.json?.message);
  assert(register.ok, `Register failed: ${register.status}`);

  // Some setups may not auto-login on register; do explicit login.
  await sleep(100);

  const login = await apiRequest('/api/users/auth/login', {
    method: 'POST',
    body: { email, password },
  });

  console.log('Login:', login.status, login.json?.message);
  assert(login.ok, `Login failed: ${login.status}`);

  const token = login.json?.token || register.json?.token;
  assert(token, 'Missing token from login/register response');

  return { token, email };
}

async function pickProductsForTests() {
  printHeader('BROWSE: pick 1 non-KG + 1 KG product via public API');

  const list = await apiRequest('/api/ecommerce/products?in_stock_only=true&limit=100&sort=newest', {
    method: 'GET',
  });

  assert(list.ok, `Products list failed: ${list.status}`);

  // Response is { products, filters, pagination, ... }
  const products = list.json?.products;
  assert(Array.isArray(products) && products.length > 0, 'No products returned from /api/ecommerce/products');

  let nonKg = null;
  let kg = null;

  for (const p of products) {
    if (p?.has_variants && Number(p?.is_obligatoire_variant || 0) === 1) continue;

    const detail = await apiRequest(`/api/ecommerce/products/${p.id}`, { method: 'GET' });
    if (!detail.ok) continue;

    const prod = detail.json;
    if (!prod) continue;

    const prodKg = prod.kg == null ? 0 : Number(prod.kg);

    if (!kg && prodKg > 0) {
      kg = {
        id: prod.id,
        designation: prod.designation,
        kg: prodKg,
        has_variants: !!prod.has_variants,
        is_obligatoire_variant: !!prod.is_obligatoire_variant,
      };
    }

    if (!nonKg && !(prodKg > 0)) {
      nonKg = {
        id: prod.id,
        designation: prod.designation,
        kg: prodKg,
        has_variants: !!prod.has_variants,
        is_obligatoire_variant: !!prod.is_obligatoire_variant,
      };
    }

    if (kg && nonKg) break;
  }

  assert(nonKg, 'Could not find a non-KG product via API');
  assert(kg, 'Could not find a KG product via API');

  console.log('Selected non-KG product:', { id: nonKg.id, designation: nonKg.designation });
  console.log('Selected KG product:', { id: kg.id, designation: kg.designation, kg_per_unit: kg.kg });

  return { nonKg, kg };
}

async function clearCart(token) {
  const res = await apiRequest('/api/ecommerce/cart', { method: 'DELETE', token });
  assert(res.ok, `Clear cart failed: ${res.status}`);
}

async function addToCart(token, item) {
  const res = await apiRequest('/api/ecommerce/cart/items', {
    method: 'POST',
    token,
    body: item,
  });
  assert(res.ok, `Add to cart failed (${item.product_id}): ${res.status}`);
}

async function quoteFromCart(token, { delivery_method, shipping_location }) {
  const res = await apiRequest('/api/ecommerce/orders/quote', {
    method: 'POST',
    token,
    body: {
      use_cart: true,
      delivery_method,
      shipping_location,
    },
  });

  assert(res.ok, `Quote failed: ${res.status}`);
  verifyQuotePrivacy(res.json);
  return res.json;
}

async function createOrderFromCart(token, email, { delivery_method, payment_method, shipping_location }) {
  const res = await apiRequest('/api/ecommerce/orders', {
    method: 'POST',
    token,
    body: {
      customer_name: 'Scenario Customer',
      customer_email: email,
      customer_phone: '0612345678',

      shipping_address_line1: 'Customer Address Line 1',
      shipping_address_line2: 'Apartment 1',
      shipping_city: 'Tangier',
      shipping_state: null,
      shipping_postal_code: null,
      shipping_country: 'Morocco',

      delivery_method,
      payment_method,

      use_cart: true,

      shipping_location,
    },
  });

  assert(res.ok, `Create order failed: ${res.status}`);
  const orderId = res.json?.order?.id;
  assert(orderId, 'Missing order.id in create order response');
  return orderId;
}

async function fetchOrder(token, orderId) {
  const res = await apiRequest(`/api/ecommerce/orders/${orderId}`, {
    method: 'GET',
    token,
  });
  assert(res.ok, `Fetch order failed: ${res.status}`);
  return res.json?.order;
}

async function runTestCase({ name, token, email, items, delivery_method, payment_method }) {
  printHeader(`TEST CASE: ${name}`);

  await clearCart(token);

  for (const it of items) {
    await addToCart(token, it);
  }

  const shipping_location = { lat: LAT, lng: LNG };

  const store = getStoreLocation();
  const distanceKm = round3(haversineDistanceKm(store, shipping_location));
  const expectedDistanceCost = expectedDistanceShipping(distanceKm);

  const quote = await quoteFromCart(token, { delivery_method, shipping_location });
  const quoteShipping = round2(quote?.totals?.shipping_cost);

  console.log('Quote totals:', quote?.totals);
  console.log('Quote summary:', quote?.summary);
  console.log('Local distance_km:', distanceKm, 'expected distance-cost:', expectedDistanceCost);

  const orderId = await createOrderFromCart(token, email, {
    delivery_method,
    payment_method,
    shipping_location,
  });

  const order = await fetchOrder(token, orderId);

  console.log('Order:', {
    id: order.id,
    delivery_method: order.delivery_method,
    payment_method: order.payment_method,
    shipping_cost: order.shipping_cost,
    total_amount: order.total_amount,
  });

  // Assertions that mimic what a customer cares about
  assert(round2(order.shipping_cost) === quoteShipping, 'Mismatch: order.shipping_cost != quote.shipping_cost');

  if (delivery_method === 'pickup') {
    assert(round2(order.shipping_cost) === 0, 'Pickup must always have shipping_cost = 0');
  }

  // Additional invariant checks without knowing profit:
  // - Non-KG shipping is either 0 or 30 (profit-based only)
  // - KG shipping is either 0 or distance-priced (or fallback 30 when distance missing)
  // Here we can only infer KG vs non-KG from the picked products.

  console.log('PASS:', name);
}

async function main() {
  printHeader('Real Customer E2E Tests');
  console.log('BASE_URL:', BASE_URL);
  console.log('shipping_location:', { lat: LAT, lng: LNG });

  // Basic healthcheck
  const health = await apiRequest('/api/health');
  assert(health.ok, `Backend healthcheck failed: ${health.status}`);

  const { token, email } = await registerAndLoginCustomer();
  const { nonKg, kg } = await pickProductsForTests();

  // 1) Delivery, non-KG
  await runTestCase({
    name: 'Delivery / Non-KG product',
    token,
    email,
    delivery_method: 'delivery',
    payment_method: 'cash_on_delivery',
    items: [{ product_id: nonKg.id, variant_id: null, unit_id: null, quantity: 1 }],
  });

  // 2) Delivery, KG
  await runTestCase({
    name: 'Delivery / KG product',
    token,
    email,
    delivery_method: 'delivery',
    payment_method: 'cash_on_delivery',
    items: [{ product_id: kg.id, variant_id: null, unit_id: null, quantity: 1 }],
  });

  // 3) Delivery, mixed cart (KG + non-KG)
  await runTestCase({
    name: 'Delivery / Mixed cart (KG + non-KG)',
    token,
    email,
    delivery_method: 'delivery',
    payment_method: 'cash_on_delivery',
    items: [
      { product_id: nonKg.id, variant_id: null, unit_id: null, quantity: 1 },
      { product_id: kg.id, variant_id: null, unit_id: null, quantity: 1 },
    ],
  });

  // 4) Pickup (must not be COD)
  await runTestCase({
    name: 'Pickup / any product (shipping free)',
    token,
    email,
    delivery_method: 'pickup',
    payment_method: 'pay_in_store',
    items: [{ product_id: nonKg.id, variant_id: null, unit_id: null, quantity: 1 }],
  });

  printHeader('DONE');
  console.log('All customer-like test cases passed.');
}

main().catch((err) => {
  console.error('\nFAILED:', err?.message || err);
  process.exit(1);
});
