import axios from 'axios';
import pool from '../db/pool.js';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const EPS_QTY = Number(process.env.EPS_QTY || 1e-6);

function nearlyEqual(a, b, eps = 1e-6) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  return Math.abs(na - nb) <= eps;
}

async function assertApiUp() {
  const r = await axios.get(`${BASE_URL}/api/health`, { timeout: 5000 });
  if (!r?.data?.ok) throw new Error('healthcheck did not return ok');
}

async function requireSnapshotTable() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'product_snapshot'`
  );
  if (Number(rows?.[0]?.cnt || 0) <= 0) {
    throw new Error('product_snapshot table not found in current database');
  }
}

async function pickVariantWithMultipleLots() {
  // Pick any published product+variant that currently has at least one snapshot row with stock.
  // We'll insert temporary snapshot rows to ensure we can test FIFO spanning + latest-price.
  const [rows] = await pool.query(
    `SELECT ps.product_id, ps.variant_id
     FROM product_snapshot ps
     INNER JOIN products p ON p.id = ps.product_id
     WHERE ps.variant_id IS NOT NULL
       AND ps.quantite > 0
       AND p.ecom_published = 1
       AND COALESCE(p.is_deleted, 0) = 0
     ORDER BY ps.created_at DESC, ps.id DESC
     LIMIT 1`
  );

  const r = rows?.[0];
  if (!r) {
    throw new Error('No published variant found with any positive snapshot quantity. Add stock to a variant (snapshot lots) and re-run.');
  }

  const productId = Number(r.product_id);
  const variantId = Number(r.variant_id);

  // Create deterministic temporary lots:
  // - Two old lots with qty>0 (for FIFO consumption)
  // - One newest row with qty=0 but known price (to validate price selection)
  const conn = await pool.getConnection();
  let insertedSnapshotIds = [];
  try {
    await conn.beginTransaction();

    const fifoQty1 = 1;
    const fifoQty2 = 2;
    const latestPrice = 222.22;

    const [ins1] = await conn.query(
      `INSERT INTO product_snapshot (product_id, variant_id, prix_vente, quantite, bon_commande_id, created_at)
       VALUES (?, ?, ?, ?, NULL, '2000-01-01 00:00:00')`,
      [productId, variantId, 111.11, fifoQty1]
    );
    const id1 = Number(ins1.insertId);

    const [ins2] = await conn.query(
      `INSERT INTO product_snapshot (product_id, variant_id, prix_vente, quantite, bon_commande_id, created_at)
       VALUES (?, ?, ?, ?, NULL, '2000-01-02 00:00:00')`,
      [productId, variantId, 111.12, fifoQty2]
    );
    const id2 = Number(ins2.insertId);

    const [ins3] = await conn.query(
      `INSERT INTO product_snapshot (product_id, variant_id, prix_vente, quantite, bon_commande_id, created_at)
       VALUES (?, ?, ?, 0, NULL, DATE_ADD(NOW(), INTERVAL 1 DAY))`,
      [productId, variantId, latestPrice]
    );
    const id3 = Number(ins3.insertId);

    insertedSnapshotIds = [id1, id2, id3];
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  const [lots] = await pool.query(
    `SELECT id, quantite, created_at
     FROM product_snapshot
     WHERE product_id = ? AND variant_id = ? AND quantite > 0
     ORDER BY created_at ASC, id ASC`,
    [productId, variantId]
  );

  // Requested quantity should span at least our two temp FIFO lots (1 + 1)
  const requestedQty = 2;

  return {
    productId,
    variantId,
    requestedQty,
    lots: lots.map(l => ({ id: Number(l.id), qty: Number(l.quantite), created_at: l.created_at })),
    insertedSnapshotIds,
  };
}

async function getExpectedVariantUnitPrice({ variantId, productId }) {
  // Pull product promo % and latest snapshot variant price.
  const [[row]] = await pool.query(
    `SELECT
      p.pourcentage_promo,
      pv.prix_vente AS legacy_variant_price,
      (
        SELECT ps.prix_vente
        FROM product_snapshot ps
        WHERE ps.variant_id = pv.id
        ORDER BY ps.created_at DESC, ps.id DESC
        LIMIT 1
      ) AS snapshot_variant_price
     FROM products p
     JOIN product_variants pv ON pv.product_id = p.id AND pv.id = ?
     WHERE p.id = ?
     LIMIT 1`,
    [variantId, productId]
  );

  if (!row) throw new Error('Could not load expected price inputs for variant');

  const promo = Number(row.pourcentage_promo || 0);
  const basePrice = row.snapshot_variant_price ?? row.legacy_variant_price;
  const unitPrice = Number(basePrice || 0) * (promo > 0 ? (1 - promo / 100) : 1);
  return {
    promo,
    unitPrice,
  };
}

async function createGuestOrder({ productId, variantId, quantity }) {
  const body = {
    customer_name: 'Snapshot Test',
    customer_email: 'snapshot-test@example.com',
    customer_phone: '0600000000',

    delivery_method: 'delivery',
    payment_method: 'cash_on_delivery',

    shipping_address_line1: 'Test Address 1',
    shipping_address_line2: null,
    shipping_city: 'TestCity',
    shipping_state: null,
    shipping_postal_code: null,
    shipping_country: 'Morocco',

    use_cart: false,
    items: [
      {
        product_id: productId,
        variant_id: variantId,
        unit_id: null,
        quantity,
      },
    ],
  };

  const r = await axios.post(`${BASE_URL}/api/ecommerce/orders`, body, {
    timeout: 30000,
  });

  if (r.status !== 201) {
    throw new Error(`Expected 201, got ${r.status}`);
  }

  const orderId = Number(r.data?.order?.id);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    throw new Error('Order created but missing order.id in response');
  }

  return orderId;
}

async function getOrderItem(orderId) {
  const [rows] = await pool.query(
    `SELECT id, product_id, variant_id, unit_price, quantity
     FROM ecommerce_order_items
     WHERE order_id = ?
     ORDER BY id ASC`,
    [orderId]
  );
  if (!rows?.length) throw new Error('No ecommerce_order_items found for created order');
  if (rows.length !== 1) throw new Error(`Expected 1 order item, got ${rows.length}`);
  const r = rows[0];
  return {
    id: Number(r.id),
    product_id: Number(r.product_id),
    variant_id: r.variant_id == null ? null : Number(r.variant_id),
    unit_price: Number(r.unit_price),
    quantity: Number(r.quantity),
  };
}

async function getAllocations(orderId, orderItemId) {
  const [rows] = await pool.query(
    `SELECT snapshot_id, quantity
     FROM ecommerce_order_item_snapshot_allocations
     WHERE order_id = ? AND order_item_id = ?
     ORDER BY id ASC`,
    [orderId, orderItemId]
  );
  return (rows || []).map(r => ({ snapshot_id: Number(r.snapshot_id), quantity: Number(r.quantity) }));
}

async function getSnapshotQuantities(snapshotIds) {
  if (!snapshotIds.length) return new Map();
  const placeholders = snapshotIds.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT id, quantite
     FROM product_snapshot
     WHERE id IN (${placeholders})`,
    snapshotIds
  );
  const m = new Map();
  for (const r of rows) m.set(Number(r.id), Number(r.quantite));
  return m;
}

async function cleanupOrderAndRestoreStock({ orderId }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Restore snapshot stock from allocations
    const [allocRows] = await conn.query(
      `SELECT snapshot_id, quantity
       FROM ecommerce_order_item_snapshot_allocations
       WHERE order_id = ?`,
      [orderId]
    );

    for (const a of allocRows || []) {
      await conn.query(
        `UPDATE product_snapshot
         SET quantite = quantite + ?
         WHERE id = ?`,
        [Number(a.quantity), Number(a.snapshot_id)]
      );
    }

    // Delete dependent rows (best-effort)
    await conn.query(`DELETE FROM ecommerce_order_item_snapshot_allocations WHERE order_id = ?`, [orderId]);
    try { await conn.query(`DELETE FROM ecommerce_order_status_history WHERE order_id = ?`, [orderId]); } catch {}
    await conn.query(`DELETE FROM ecommerce_order_items WHERE order_id = ?`, [orderId]);
    await conn.query(`DELETE FROM ecommerce_orders WHERE id = ?`, [orderId]);

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function cleanupInsertedSnapshots(snapshotIds) {
  if (!snapshotIds || snapshotIds.length === 0) return;
  const placeholders = snapshotIds.map(() => '?').join(',');
  await pool.query(`DELETE FROM product_snapshot WHERE id IN (${placeholders})`, snapshotIds);
}

async function main() {
  await assertApiUp();
  await requireSnapshotTable();

  const pick = await pickVariantWithMultipleLots();
  const expectedPrice = await getExpectedVariantUnitPrice({ variantId: pick.variantId, productId: pick.productId });

  // Snapshot quantities before
  const beforeMap = new Map(pick.lots.map(l => [l.id, l.qty]));

  console.log('=== Snapshot Orders Test ===');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Picked product_id=${pick.productId} variant_id=${pick.variantId}`);
  console.log(`Lots (oldest first): ${pick.lots.map(l => `${l.id}:${l.qty}`).join(' | ')}`);
  console.log(`Requested quantity: ${pick.requestedQty}`);
  console.log(`Expected unit_price (after promo): ${expectedPrice.unitPrice}`);

  let orderId = null;
  try {
    orderId = await createGuestOrder({
      productId: pick.productId,
      variantId: pick.variantId,
      quantity: pick.requestedQty,
    });

    const item = await getOrderItem(orderId);

    if (!nearlyEqual(item.unit_price, expectedPrice.unitPrice, 1e-4)) {
      throw new Error(`unit_price mismatch: expected ${expectedPrice.unitPrice}, got ${item.unit_price}`);
    }

    if (!nearlyEqual(item.quantity, pick.requestedQty, 1e-6)) {
      throw new Error(`quantity mismatch: expected ${pick.requestedQty}, got ${item.quantity}`);
    }

    const allocations = await getAllocations(orderId, item.id);
    if (allocations.length < 1) {
      throw new Error('No allocations recorded in ecommerce_order_item_snapshot_allocations');
    }

    // Compute expected FIFO allocations.
    let remaining = pick.requestedQty;
    const expectedAllocs = [];
    for (const lot of pick.lots) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, lot.qty);
      if (take > 0) expectedAllocs.push({ snapshot_id: lot.id, quantity: take });
      remaining -= take;
    }

    // Ensure allocations match expected sequence/amounts
    for (let i = 0; i < expectedAllocs.length; i++) {
      const exp = expectedAllocs[i];
      const got = allocations[i];
      if (!got) throw new Error(`Missing allocation at index ${i}`);
      if (got.snapshot_id !== exp.snapshot_id) {
        throw new Error(`FIFO snapshot_id mismatch at index ${i}: expected ${exp.snapshot_id}, got ${got.snapshot_id}`);
      }
      if (!nearlyEqual(got.quantity, exp.quantity, EPS_QTY)) {
        throw new Error(`FIFO quantity mismatch for snapshot ${exp.snapshot_id}: expected ${exp.quantity}, got ${got.quantity}`);
      }
    }

    // Verify snapshot quantities decreased
    const touchedSnapshotIds = expectedAllocs.map(a => a.snapshot_id);
    const afterMap = await getSnapshotQuantities(touchedSnapshotIds);

    for (const exp of expectedAllocs) {
      const before = beforeMap.get(exp.snapshot_id);
      const after = afterMap.get(exp.snapshot_id);
      const expectedAfter = Number(before) - Number(exp.quantity);
      if (!nearlyEqual(after, expectedAfter, EPS_QTY)) {
        throw new Error(
          `Snapshot quantite mismatch for id=${exp.snapshot_id}: before=${before} after=${after} expectedAfter=${expectedAfter}`
        );
      }
    }

    console.log('✅ OK: order stored unit_price matches snapshot price (after promo)');
    console.log('✅ OK: FIFO allocations + snapshot decrements are correct');

  } finally {
    if (orderId) {
      await cleanupOrderAndRestoreStock({ orderId });
      console.log(`🧹 Cleanup done (restored stock + removed order ${orderId})`);
    }
    if (pick?.insertedSnapshotIds?.length) {
      await cleanupInsertedSnapshots(pick.insertedSnapshotIds);
      console.log(`🧹 Cleanup done (removed ${pick.insertedSnapshotIds.length} temporary snapshot rows)`);
    }
  }
}

main()
  .catch(err => {
    console.error('❌ Test failed:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await pool.end(); } catch {}
  });
