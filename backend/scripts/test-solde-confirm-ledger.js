import pool from '../db/pool.js';

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, ok: res.ok, body };
}

async function getOrder(orderId) {
  const [rows] = await pool.query(
    `SELECT id, order_number, user_id, payment_method, status, payment_status, total_amount, remise_used_amount, confirmed_at
     FROM ecommerce_orders
     WHERE id = ?
     LIMIT 1`,
    [orderId]
  );
  return rows[0] || null;
}

async function getLedgerForOrder(orderId) {
  const [rows] = await pool.query(
    `SELECT id, contact_id, order_id, entry_type, amount, description, created_at, created_by_employee_id
     FROM contact_solde_ledger
     WHERE order_id = ?
     ORDER BY id ASC`,
    [orderId]
  );
  return rows;
}

async function main() {
  const baseUrl = String(process.env.BOUKIR_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
  const orderId = Number(process.argv[2] || process.env.ORDER_ID || 6);
  const token = process.env.BOUKIR_TOKEN;

  if (!Number.isFinite(orderId) || orderId <= 0) {
    console.error('Invalid order id. Usage: node backend/scripts/test-solde-confirm-ledger.js <orderId>');
    process.exit(1);
  }

  if (!token) {
    console.error('Missing env var BOUKIR_TOKEN. Set it in your terminal session, then rerun.');
    console.error('Example (bash): export BOUKIR_TOKEN="<your_jwt>"');
    console.error('Example (PowerShell): $env:BOUKIR_TOKEN="<your_jwt>"');
    process.exit(1);
  }

  console.log(`Base URL: ${baseUrl}`);
  console.log(`Order ID: ${orderId}`);

  const beforeOrder = await getOrder(orderId);
  if (!beforeOrder) {
    console.error('Order not found in DB.');
    process.exit(1);
  }

  console.log('Order (before):', {
    id: beforeOrder.id,
    order_number: beforeOrder.order_number,
    user_id: beforeOrder.user_id,
    payment_method: beforeOrder.payment_method,
    status: beforeOrder.status,
    payment_status: beforeOrder.payment_status,
    total_amount: Number(beforeOrder.total_amount),
    remise_used_amount: Number(beforeOrder.remise_used_amount),
    confirmed_at: beforeOrder.confirmed_at,
  });

  const beforeLedger = await getLedgerForOrder(orderId);
  console.log(`Ledger rows (before): ${beforeLedger.length}`);
  if (beforeLedger.length) console.table(beforeLedger);

  const url = `${baseUrl}/api/ecommerce/orders/${orderId}/status`;
  const payload = {
    status: 'confirmed',
    admin_notes: 'Test confirm solde order (script)',
  };

  console.log(`Calling PUT ${url} ...`);
  const resp = await fetchJson(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  console.log('HTTP:', resp.status);
  console.log('Response:', resp.body);

  const afterOrder = await getOrder(orderId);
  console.log('Order (after):', {
    id: afterOrder?.id,
    status: afterOrder?.status,
    payment_status: afterOrder?.payment_status,
    confirmed_at: afterOrder?.confirmed_at,
  });

  const afterLedger = await getLedgerForOrder(orderId);
  console.log(`Ledger rows (after): ${afterLedger.length}`);
  if (afterLedger.length) console.table(afterLedger);

  process.exit(0);
}

main().catch((e) => {
  console.error('Script failed:', e);
  process.exit(1);
});
