/*
  Full Shipping System Scenario Runner (Quote + Checkout + DB verify)

  Goals:
  - Test many shipping scenarios end-to-end using REAL API calls.
  - Auto-select real products from your database (KG + non-KG) so you don't manually maintain IDs.
  - Verify /quote privacy (no sensitive fields).
  - Optionally create REAL orders and verify stored shipping_cost in MySQL.

  Run:
    node test-shipping-scenarios.mjs

  Requirements:
    - Backend server running (default http://localhost:3001)
    - DB credentials configured (same as backend uses) so this script can query products/orders.

  Env vars:
    BASE_URL=http://localhost:3001
    TOKEN=<jwt>                 (optional; enables cart-based scenarios)
    DO_CREATE_ORDER=1           (optional; creates real orders and verifies ecommerce_orders.shipping_cost)

  Optional coordinates override:
    LAT=35.758423
    LNG=-5.800450150969058

  Notes:
  - JWT is NEVER printed.
  - This script queries DB locally (cost data stays local; not exposed via API).
*/

import 'dotenv/config';
import pool from './backend/db/pool.js';
import { getStoreLocation, haversineDistanceKm } from './backend/utils/geo.js';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const TOKEN = process.env.TOKEN || '';
const DO_CREATE_ORDER = String(process.env.DO_CREATE_ORDER || '').trim() === '1';

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
  // Must match business rule tiers:
  // 0-2 => 25
  // 2-4 => 20
  // 4-6 => 17
  // >=6 => 12
  const km = Number(distanceKm);
  if (!Number.isFinite(km) || km < 0) return null;
  if (km < 2) return 25;
  if (km < 4) return 20;
  if (km < 6) return 17;
  return 12;
}

function computeDistanceShipping(distanceKm) {
  const rate = distanceRatePerKm(distanceKm);
  if (!rate) return null;
  return round2(Number(distanceKm) * rate);
}

function computeProfit(itemsDetailed) {
  // Profit = Σ((prix_unitaire - cost) * quantite)
  return itemsDetailed.reduce((sum, it) => {
    const prix = Number(it.prix_unitaire || 0);
    const qty = Number(it.quantite || 0);
    const cost = Number(it.cout_revient || 0);
    return sum + (prix - cost) * qty;
  }, 0);
}

function computeTotalKg(itemsDetailed) {
  return itemsDetailed.reduce((sum, it) => {
    const kg = Number(it.kg || 0);
    const qty = Number(it.quantite || 0);
    if (!(kg > 0) || !(qty > 0)) return sum;
    return sum + kg * qty;
  }, 0);
}

function containsKg(itemsDetailed) {
  return itemsDetailed.some((it) => Number(it.kg || 0) > 0 && Number(it.quantite || 0) > 0);
}

function expectedShipping({
  deliveryMethod,
  itemsDetailed,
  distanceKm,
}) {
  const method = String(deliveryMethod || 'delivery').trim();
  if (method === 'pickup') return { shippingCost: 0, reason: 'pickup' };

  const hasKg = containsKg(itemsDetailed);
  const profit = computeProfit(itemsDetailed);

  if (!hasKg) {
    // Non-KG rule: profit >= 200 => free else 30
    return profit >= 200
      ? { shippingCost: 0, reason: 'nonkg_profit_met', profit }
      : { shippingCost: 30, reason: 'nonkg_profit_not_met', profit };
  }

  const totalKg = computeTotalKg(itemsDetailed);

  // KG band rules
  if (totalKg > 5000) return { shippingCost: 0, reason: 'kg_over_5000', profit, totalKg };

  const requiredProfit = totalKg <= 2000 ? 500 : 1000;
  if (profit >= requiredProfit) {
    return {
      shippingCost: 0,
      reason: totalKg <= 2000 ? 'kg_band1_profit_met' : 'kg_band2_profit_met',
      profit,
      totalKg,
    };
  }

  // Distance pricing when KG is not free
  const distanceCost = computeDistanceShipping(distanceKm);
  // If distance missing/unusable, backend falls back to flat 30
  return {
    shippingCost: distanceCost != null ? distanceCost : 30,
    reason: distanceCost != null ? 'kg_distance_priced' : 'kg_distance_missing_fallback',
    profit,
    totalKg,
    distanceKm,
  };
}

async function findProduct({ kgMode, targetProfit }) {
  // kgMode: 'nonkg' | 'kg'
  // targetProfit: 'low' | 'high'
  // We search for a product where (prix_vente - cost) is known and can satisfy the profit requirement.

  const whereKg = kgMode === 'kg'
    ? 'COALESCE(p.kg, 0) > 0'
    : 'COALESCE(p.kg, 0) <= 0';

  const [rows] = await pool.query(`
    SELECT
      p.id,
      p.designation,
      p.prix_vente,
      p.pourcentage_promo,
      p.prix_achat,
      p.cout_revient,
      p.kg,
      p.stock_partage_ecom_qty,
      p.has_variants,
      p.is_obligatoire_variant,
      p.ecom_published,
      COALESCE(p.is_deleted, 0) AS is_deleted
    FROM products p
    WHERE
      p.ecom_published = 1
      AND COALESCE(p.is_deleted, 0) = 0
      AND ${whereKg}
      AND (p.has_variants = 0 OR COALESCE(p.is_obligatoire_variant, 0) = 0)
      AND COALESCE(p.stock_partage_ecom_qty, 0) >= 50
      AND (COALESCE(p.cout_revient, 0) > 0 OR COALESCE(p.prix_achat, 0) > 0)
    ORDER BY p.stock_partage_ecom_qty DESC
    LIMIT 200
  `);

  // Compute margin per unit and pick candidates.
  const candidates = rows
    .map((r) => {
      const sell = Number(r.prix_vente || 0);
      const cost = Number(r.cout_revient || r.prix_achat || 0);
      const margin = sell - cost;
      return { ...r, sell, cost, margin };
    })
    .filter((r) => Number.isFinite(r.margin) && r.margin > 0);

  if (targetProfit === 'low') {
    // Prefer low margin items for low profit cases
    candidates.sort((a, b) => a.margin - b.margin);
  } else {
    // Prefer high margin items for high profit cases
    candidates.sort((a, b) => b.margin - a.margin);
  }

  return candidates[0] || null;
}

function chooseQuantityForTarget({ product, wantProfitMin, maxTotalKg }) {
  const margin = Number(product.margin || 0);
  if (!(margin > 0)) return null;

  const kg = Number(product.kg || 0);
  const stock = Number(product.stock_partage_ecom_qty || 0);

  // brute force quantities (small range first)
  for (let qty = 1; qty <= Math.min(stock, 200); qty++) {
    const profit = margin * qty;
    const totalKg = kg > 0 ? kg * qty : 0;
    if (maxTotalKg != null && totalKg > maxTotalKg) break;
    if (profit >= wantProfitMin) return qty;
  }

  // If not found in 1..200, try a larger qty until stock/max kg
  const upper = Math.min(stock, 2000);
  for (let qty = 201; qty <= upper; qty += 10) {
    const profit = margin * qty;
    const totalKg = kg > 0 ? kg * qty : 0;
    if (maxTotalKg != null && totalKg > maxTotalKg) break;
    if (profit >= wantProfitMin) return qty;
  }

  return null;
}

function buildDetailedItemFromProduct(product, quantity) {
  // Mimic key parts of orders.js checkout pricing for unit_id=null, variant_id=null.
  // We assume promo is 0 for selected products; if not, we still apply it.
  const unitPrice = Number(product.prix_vente || 0);
  const promo = Number(product.pourcentage_promo || 0);
  const priceAfterPromo = promo > 0 ? unitPrice * (1 - promo / 100) : unitPrice;

  const cost = Number(product.cout_revient || product.prix_achat || 0);
  const kg = Number(product.kg || 0);

  return {
    product_id: product.id,
    variant_id: null,
    unit_id: null,
    quantity,

    // fields used by profit calculation
    prix_unitaire: priceAfterPromo,
    quantite: quantity,
    cout_revient: cost,

    // kg per unit
    kg,
  };
}

async function createScenarioSet() {
  const store = getStoreLocation();
  const distanceKm = round3(haversineDistanceKm(store, { lat: LAT, lng: LNG }));

  // Find products
  const nonKgLow = await findProduct({ kgMode: 'nonkg', targetProfit: 'low' });
  const nonKgHigh = await findProduct({ kgMode: 'nonkg', targetProfit: 'high' });
  const kgLow = await findProduct({ kgMode: 'kg', targetProfit: 'low' });
  const kgHigh = await findProduct({ kgMode: 'kg', targetProfit: 'high' });

  const scenarios = [];

  if (nonKgLow) {
    scenarios.push({
      name: 'NON-KG (likely low profit) => shipping 30',
      delivery_method: 'delivery',
      shipping_location: { lat: LAT, lng: LNG },
      itemsDetailed: [buildDetailedItemFromProduct(nonKgLow, 1)],
      apiItems: [{ product_id: nonKgLow.id, variant_id: null, unit_id: null, quantity: 1 }],
      distanceKm,
    });
  }

  if (nonKgHigh) {
    const qty = chooseQuantityForTarget({ product: nonKgHigh, wantProfitMin: 200, maxTotalKg: null }) || 1;
    scenarios.push({
      name: 'NON-KG (profit >= 200) => shipping free',
      delivery_method: 'delivery',
      shipping_location: { lat: LAT, lng: LNG },
      itemsDetailed: [buildDetailedItemFromProduct(nonKgHigh, qty)],
      apiItems: [{ product_id: nonKgHigh.id, variant_id: null, unit_id: null, quantity: qty }],
      distanceKm,
    });
  }

  if (kgHigh) {
    // KG band1 profit met: totalKg <= 2000 and profit >= 500
    const qty = chooseQuantityForTarget({ product: kgHigh, wantProfitMin: 500, maxTotalKg: 2000 }) || 1;
    scenarios.push({
      name: 'KG band1 (<=2000kg) profit>=500 => shipping free',
      delivery_method: 'delivery',
      shipping_location: { lat: LAT, lng: LNG },
      itemsDetailed: [buildDetailedItemFromProduct(kgHigh, qty)],
      apiItems: [{ product_id: kgHigh.id, variant_id: null, unit_id: null, quantity: qty }],
      distanceKm,
    });
  }

  if (kgLow) {
    // KG band1 profit NOT met: force small qty so profit < 500
    const qty = 1;
    scenarios.push({
      name: 'KG band1 (<=2000kg) profit<500 => distance pricing',
      delivery_method: 'delivery',
      shipping_location: { lat: LAT, lng: LNG },
      itemsDetailed: [buildDetailedItemFromProduct(kgLow, qty)],
      apiItems: [{ product_id: kgLow.id, variant_id: null, unit_id: null, quantity: qty }],
      distanceKm,
    });
  }

  if (kgHigh) {
    // KG band2 profit met: totalKg between 2000 and 5000, profit >= 1000
    // Try to pick qty achieving kg in range first.
    const kg = Number(kgHigh.kg || 0);
    if (kg > 0) {
      // pick qty so totalKg ~ 2500
      const targetQty = Math.ceil(2500 / kg);
      const qty = Math.min(targetQty, Number(kgHigh.stock_partage_ecom_qty || targetQty));
      scenarios.push({
        name: 'KG band2 (2000-5000kg) profit>=1000 => shipping free (if margin allows)',
        delivery_method: 'delivery',
        shipping_location: { lat: LAT, lng: LNG },
        itemsDetailed: [buildDetailedItemFromProduct(kgHigh, qty)],
        apiItems: [{ product_id: kgHigh.id, variant_id: null, unit_id: null, quantity: qty }],
        distanceKm,
      });
    }
  }

  if (kgLow) {
    // KG over 5000 => free (even if profit low)
    const kg = Number(kgLow.kg || 0);
    if (kg > 0) {
      const targetQty = Math.ceil(6000 / kg);
      const stock = Number(kgLow.stock_partage_ecom_qty || 0);
      const qty = Math.min(targetQty, stock);
      if (qty > 0 && kg * qty > 5000) {
        scenarios.push({
          name: 'KG over 5000kg => shipping free',
          delivery_method: 'delivery',
          shipping_location: { lat: LAT, lng: LNG },
          itemsDetailed: [buildDetailedItemFromProduct(kgLow, qty)],
          apiItems: [{ product_id: kgLow.id, variant_id: null, unit_id: null, quantity: qty }],
          distanceKm,
        });
      }
    }
  }

  // Pickup scenario (always free)
  if (kgLow) {
    scenarios.push({
      name: 'PICKUP (with KG product) => shipping free',
      delivery_method: 'pickup',
      shipping_location: { lat: LAT, lng: LNG },
      itemsDetailed: [buildDetailedItemFromProduct(kgLow, 1)],
      apiItems: [{ product_id: kgLow.id, variant_id: null, unit_id: null, quantity: 1 }],
      distanceKm: null,
    });
  }

  return { scenarios, distanceKm };
}

async function quoteWithItems({ delivery_method, shipping_location, apiItems }) {
  const body = {
    use_cart: false,
    delivery_method,
    shipping_location,
    items: apiItems,
  };

  return apiRequest('/api/ecommerce/orders/quote', {
    method: 'POST',
    body,
    auth: false,
  });
}

async function createOrderGuest({ delivery_method, shipping_location, apiItems }) {
  const body = {
    customer_name: 'Scenario Test User',
    customer_email: `scenario-test-${Date.now()}@example.com`,
    customer_phone: '+212600000000',
    shipping_address_line1: 'Test Address 1',
    shipping_city: 'Tangier',
    shipping_location,

    delivery_method,
    payment_method: 'cash_on_delivery',

    use_cart: false,
    items: apiItems,
  };

  return apiRequest('/api/ecommerce/orders', {
    method: 'POST',
    body,
    auth: false,
  });
}

async function fetchOrderShippingFromDb(orderId) {
  const [rows] = await pool.query(
    'SELECT id, shipping_cost, shipping_lat, shipping_lng, subtotal, total_amount, delivery_method FROM ecommerce_orders WHERE id = ? LIMIT 1',
    [orderId]
  );
  return rows?.[0] || null;
}

async function runCartScenarioIfToken({ apiItems }) {
  if (!TOKEN) return null;

  printHeader('CART SCENARIO (auth): clear cart -> add items -> quote use_cart=true');

  // clear cart
  const clear = await apiRequest('/api/ecommerce/cart', { method: 'DELETE', auth: true });
  console.log('Clear cart status:', clear.status);
  assert(clear.ok, 'Failed to clear cart');

  // add items
  for (const it of apiItems) {
    const add = await apiRequest('/api/ecommerce/cart/items', {
      method: 'POST',
      auth: true,
      body: {
        product_id: it.product_id,
        variant_id: it.variant_id,
        unit_id: it.unit_id,
        quantity: it.quantity,
      },
    });
    console.log('Add item status:', add.status);
    assert(add.ok, `Failed to add item to cart (product ${it.product_id})`);
  }

  // quote
  const quote = await apiRequest('/api/ecommerce/orders/quote', {
    method: 'POST',
    auth: true,
    body: {
      use_cart: true,
      delivery_method: 'delivery',
      shipping_location: { lat: LAT, lng: LNG },
    },
  });

  console.log('Quote status:', quote.status);
  console.log('Quote totals:', quote.json?.totals);
  console.log('Quote summary:', quote.json?.summary);

  assert(quote.ok, 'Cart quote failed');
  verifyQuotePrivacy(quote.json);

  return quote.json;
}

async function main() {
  printHeader('Shipping Scenario Runner');
  console.log('BASE_URL:', BASE_URL);
  console.log('TOKEN set:', TOKEN ? 'yes' : 'no');
  console.log('DO_CREATE_ORDER:', DO_CREATE_ORDER ? 'yes' : 'no');
  console.log('shipping_location:', { lat: LAT, lng: LNG });

  // Build scenarios
  const { scenarios, distanceKm } = await createScenarioSet();
  const store = getStoreLocation();
  console.log('store_location:', store);
  console.log('distance_km (local computed):', distanceKm);

  if (!scenarios.length) {
    throw new Error('No scenarios created (could not find suitable products in DB).');
  }

  // Run each scenario using /quote and compare expected shipping_cost.
  for (const sc of scenarios) {
    printHeader(`SCENARIO: ${sc.name}`);

    const expected = expectedShipping({
      deliveryMethod: sc.delivery_method,
      itemsDetailed: sc.itemsDetailed,
      distanceKm: sc.delivery_method === 'delivery' ? sc.distanceKm : null,
    });

    console.log('Expected:', {
      shipping_cost: expected.shippingCost,
      reason: expected.reason,
      profit: expected.profit != null ? round2(expected.profit) : null,
      total_kg: expected.totalKg != null ? round2(expected.totalKg) : null,
      distance_km: expected.distanceKm != null ? expected.distanceKm : null,
    });

    const quote = await quoteWithItems({
      delivery_method: sc.delivery_method,
      shipping_location: sc.shipping_location,
      apiItems: sc.apiItems,
    });

    console.log('Quote status:', quote.status);
    console.log('Quote totals:', quote.json?.totals);
    console.log('Quote summary:', quote.json?.summary);

    assert(quote.ok, 'Quote failed');
    verifyQuotePrivacy(quote.json);

    const got = round2(quote.json?.totals?.shipping_cost);
    const exp = round2(expected.shippingCost);

    if (got !== exp) {
      console.log('MISMATCH! expected shipping_cost != quote shipping_cost');
      console.log('Expected shipping_cost:', exp);
      console.log('Quote shipping_cost:', got);
    } else {
      console.log('OK shipping_cost matches expected:', got);
    }

    // Optional: create an order and verify DB shipping_cost stored
    if (DO_CREATE_ORDER) {
      const created = await createOrderGuest({
        delivery_method: sc.delivery_method,
        shipping_location: sc.shipping_location,
        apiItems: sc.apiItems,
      });

      console.log('Create order status:', created.status);
      console.log('Create order response:', created.json);
      assert(created.ok, 'Create order failed');

      const orderId = created.json?.order?.id;
      assert(orderId, 'Missing order id in create order response');

      const dbOrder = await fetchOrderShippingFromDb(orderId);
      assert(dbOrder, 'Order not found in DB after creation');

      const stored = round2(dbOrder.shipping_cost);
      if (stored !== exp) {
        console.log('DB MISMATCH! stored shipping_cost != expected');
        console.log('Stored shipping_cost:', stored);
        console.log('Expected shipping_cost:', exp);
      } else {
        console.log('OK stored shipping_cost matches expected:', stored);
      }

      console.log('DB order snapshot:', {
        id: dbOrder.id,
        delivery_method: dbOrder.delivery_method,
        subtotal: round2(dbOrder.subtotal),
        shipping_cost: round2(dbOrder.shipping_cost),
        total_amount: round2(dbOrder.total_amount),
        shipping_lat: dbOrder.shipping_lat,
        shipping_lng: dbOrder.shipping_lng,
      });
    }
  }

  // Bonus: cart scenario using TOKEN
  await runCartScenarioIfToken({ apiItems: scenarios[0].apiItems });

  printHeader('DONE');
  console.log('All scenarios executed. Review mismatches above (if any).');
}

main()
  .catch((err) => {
    console.error('\nFAILED:', err?.message || err);
    process.exit(1);
  })
  .finally(() => {
    // keep pool open? we can close in scripts; pool.js might be shared.
    // mysql2 pool has .end(), but pool.js exports a shared pool used by backend.
    // For script, just exit.
    setTimeout(() => process.exit(0), 50);
  });
