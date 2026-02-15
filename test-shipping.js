/*
  Standalone Shipping System Test (REAL HTTP calls)

  Run:
    node test-shipping.js

  Requirements:
    - Backend server must be running (default http://localhost:3001)

  Optional env vars:
    BASE_URL=http://localhost:3001
    TOKEN=<jwt>                  (only needed for use_cart=true scenarios)
    DO_CREATE_ORDER=1            (will create a REAL order via POST /api/ecommerce/orders)

  Optional CLI args:
    node test-shipping.js --lat 35.758423 --lng -5.800450150969058

  Notes:
    - This script prints totals (subtotal/shipping/total) but does NOT print JWT.
    - /quote response is expected to be privacy-safe (no distance_km, no kg flags, no reasons).
*/

import { getStoreLocation, haversineDistanceKm } from './backend/utils/geo.js';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const TOKEN = process.env.TOKEN || '';
const DO_CREATE_ORDER = String(process.env.DO_CREATE_ORDER || '').trim() === '1';

function parseArgs(argv) {
  const args = { lat: 35.758423, lng: -5.800450150969058, items: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lat') args.lat = Number(argv[i + 1]);
    if (a === '--lng') args.lng = Number(argv[i + 1]);
    if (a === '--items') {
      try {
        args.items = JSON.parse(String(argv[i + 1] || 'null'));
      } catch {
        throw new Error('Invalid --items JSON. Expected: [{"product_id":1,"variant_id":null,"unit_id":null,"quantity":1}, ...]');
      }
    }
  }
  return args;
}

const { lat, lng, items: cliItems } = parseArgs(process.argv.slice(2));

function round3(v) {
  return Math.round(Number(v || 0) * 1000) / 1000;
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
  return Math.round(Number(distanceKm) * rate * 100) / 100;
}

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
  const headers = { 'content-type': 'application/json' };

  if (auth) {
    if (!TOKEN) throw new Error(`Missing TOKEN env var for authenticated call: ${path}`);
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

function printTitle(title) {
  console.log('\n' + '='.repeat(90));
  console.log(title);
  console.log('='.repeat(90));
}

function summarizeQuote(json) {
  const totals = json?.totals || {};
  return {
    delivery_method: json?.delivery_method,
    subtotal: totals.subtotal,
    shipping_cost: totals.shipping_cost,
    total_amount: totals.total_amount,
    summary: json?.summary,
  };
}

function verifyQuotePrivacy(quoteJson) {
  const summary = quoteJson?.summary;
  assert(summary && typeof summary === 'object', 'Quote response missing summary');

  // Only allow these summary fields
  const allowed = new Set(['items_count', 'shipping_label']);
  const keys = Object.keys(summary);
  const unexpected = keys.filter((k) => !allowed.has(k));
  assert(unexpected.length === 0, `Quote summary leaks extra fields: ${unexpected.join(', ')}`);
}

async function scenarioQuoteGuestDemoCart() {
  printTitle('SCENARIO A: /quote guest (use_cart=false) with demo items + coordinates');

  // These IDs come from your shared cart example.
  const defaultItems = [
    { product_id: 5311, variant_id: 161, unit_id: null, quantity: 5 },
    { product_id: 5273, variant_id: null, unit_id: 33, quantity: 20 },
  ];

  const items = Array.isArray(cliItems) && cliItems.length > 0 ? cliItems : defaultItems;

  const store = getStoreLocation();
  const customer = { lat, lng };
  const distanceKm = round3(haversineDistanceKm(store, customer));
  const rate = distanceRatePerKm(distanceKm);
  const expectedDistanceCost = expectedDistanceShipping(distanceKm);

  console.log('Google Maps:', `https://www.google.com/maps?q=${lat},${lng}`);
  console.log('Store location:', store);
  console.log('Customer location:', customer);
  console.log('Distance (km):', distanceKm);
  console.log('Distance tier rate (MAD/km):', rate);
  console.log('Expected distance-based shipping (MAD):', expectedDistanceCost);

  const body = {
    use_cart: false,
    delivery_method: 'delivery',
    shipping_location: { lat, lng },
    items,
  };

  const { status, ok, json } = await apiRequest('/api/ecommerce/orders/quote', {
    method: 'POST',
    body,
    auth: false,
  });

  console.log('Status:', status);
  console.log('Quote:', safeJson(summarizeQuote(json)));
  console.log(
    'Note: distance-based pricing only applies when the cart contains KG items and KG shipping is not free.'
  );

  assert(ok, 'Quote failed');
  verifyQuotePrivacy(json);
}

async function scenarioQuoteAuthUseCart() {
  if (!TOKEN) {
    printTitle('SCENARIO B: /quote auth (use_cart=true) skipped (TOKEN not set)');
    console.log('Set TOKEN env var to test cart-based quote.');
    return;
  }

  printTitle('SCENARIO B: /quote auth (use_cart=true) with coordinates');

  const body = {
    use_cart: true,
    delivery_method: 'delivery',
    shipping_location: { lat, lng },
  };

  const { status, ok, json } = await apiRequest('/api/ecommerce/orders/quote', {
    method: 'POST',
    body,
    auth: true,
  });

  console.log('Status:', status);
  console.log('Quote:', safeJson(summarizeQuote(json)));

  assert(ok, 'Quote (use_cart=true) failed');
  verifyQuotePrivacy(json);
}

async function scenarioCreateOrderGuest() {
  if (!DO_CREATE_ORDER) {
    printTitle('SCENARIO C: /orders create order skipped (set DO_CREATE_ORDER=1 to enable)');
    return;
  }

  printTitle('SCENARIO C: /orders create REAL order (guest, use_cart=false)');

  const body = {
    customer_name: 'Shipping Test User',
    customer_email: 'shipping-test@example.com',
    customer_phone: '+212600000000',
    shipping_address_line1: 'Test Address 1',
    shipping_city: 'Tangier',
    shipping_location: { lat, lng },

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
    auth: false,
  });

  console.log('Status:', status);
  console.log('Response:', safeJson(json));

  assert(ok, 'Create order failed');
}

async function main() {
  printTitle('Shipping Test Runner');
  console.log('BASE_URL:', BASE_URL);
  console.log('TOKEN set:', TOKEN ? 'yes' : 'no');
  console.log('Coordinates:', { lat, lng });
  if (cliItems) {
    console.log('CLI items override enabled:', Array.isArray(cliItems) ? `${cliItems.length} items` : typeof cliItems);
  }

  await scenarioQuoteGuestDemoCart();
  await scenarioQuoteAuthUseCart();
  await scenarioCreateOrderGuest();

  printTitle('DONE');
  console.log('All enabled scenarios finished.');
}

main().catch((err) => {
  console.error('\nFAILED:', err?.message || err);
  process.exit(1);
});
