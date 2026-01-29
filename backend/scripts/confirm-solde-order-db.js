import pool from '../db/pool.js';

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

async function getOrder(conn, orderId) {
  const [rows] = await conn.query(
    `SELECT id, order_number, user_id, payment_method, status, payment_status, total_amount, remise_used_amount, confirmed_at
     FROM ecommerce_orders
     WHERE id = ?
     LIMIT 1`,
    [orderId]
  );
  return rows[0] || null;
}

async function getLedgerForOrder(conn, orderId) {
  const [rows] = await conn.query(
    `SELECT id, contact_id, order_id, entry_type, amount, description, created_at, created_by_employee_id
     FROM contact_solde_ledger
     WHERE order_id = ?
     ORDER BY id ASC`,
    [orderId]
  );
  return rows;
}

async function main() {
  const orderId = Number(process.argv[2] || 6);
  const createdByEmployeeIdRaw = process.argv[3];
  const createdByEmployeeId = createdByEmployeeIdRaw ? Number(createdByEmployeeIdRaw) : null;

  if (!Number.isFinite(orderId) || orderId <= 0) {
    console.error('Invalid order id. Usage: node backend/scripts/confirm-solde-order-db.js <orderId> [createdByEmployeeId]');
    process.exit(1);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const before = await getOrder(conn, orderId);
    if (!before) {
      await conn.rollback();
      console.error('Order not found.');
      process.exit(1);
    }

    console.log('Order (before):', {
      id: before.id,
      order_number: before.order_number,
      user_id: before.user_id,
      payment_method: before.payment_method,
      status: before.status,
      payment_status: before.payment_status,
      total_amount: Number(before.total_amount),
      remise_used_amount: Number(before.remise_used_amount),
      confirmed_at: before.confirmed_at,
    });

    if (before.payment_method !== 'solde') {
      await conn.rollback();
      console.error('This order is not a solde order (payment_method != solde).');
      process.exit(1);
    }

    if (!before.user_id) {
      await conn.rollback();
      console.error('Solde order has no user_id (unexpected).');
      process.exit(1);
    }

    // Lock row and confirm if not already confirmed.
    const [lockRows] = await conn.query(
      `SELECT id, user_id, status, payment_method, total_amount, remise_used_amount, confirmed_at
       FROM ecommerce_orders
       WHERE id = ?
       FOR UPDATE`,
      [orderId]
    );

    const locked = lockRows[0];
    if (!locked) {
      await conn.rollback();
      console.error('Order disappeared.');
      process.exit(1);
    }

    if (locked.status === 'cancelled') {
      await conn.rollback();
      console.error('Order is cancelled; cannot confirm.');
      process.exit(1);
    }

    if (locked.status !== 'confirmed') {
      await conn.query(
        `UPDATE ecommerce_orders
         SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [orderId]
      );

      await conn.query(
        `INSERT INTO ecommerce_order_status_history (order_id, old_status, new_status, changed_by_type, notes)
         VALUES (?, ?, 'confirmed', 'admin', 'Confirmed via DB test script')`,
        [orderId, locked.status]
      );
    }

    // Create solde debit if missing.
    const totalAmount = Number(locked.total_amount || 0);
    const remiseUsed = Number(locked.remise_used_amount || 0);
    const soldeAmount = Math.max(0, roundMoney(totalAmount - remiseUsed));

    if (soldeAmount > 0) {
      const [existingDebit] = await conn.query(
        `SELECT 1
         FROM contact_solde_ledger
         WHERE contact_id = ? AND order_id = ? AND entry_type = 'debit'
         LIMIT 1`,
        [locked.user_id, orderId]
      );

      if (existingDebit.length === 0) {
        await conn.query(
          `INSERT INTO contact_solde_ledger
             (contact_id, order_id, entry_type, amount, description, created_by_employee_id)
           VALUES
             (?, ?, 'debit', ?, 'Solde order confirmed (DB test)', ?)`,
          [locked.user_id, orderId, soldeAmount, createdByEmployeeId]
        );
      }
    }

    await conn.commit();

    const after = await getOrder(conn, orderId);
    console.log('Order (after):', {
      id: after?.id,
      status: after?.status,
      confirmed_at: after?.confirmed_at,
    });

    const ledger = await getLedgerForOrder(conn, orderId);
    console.log(`Ledger rows (order_id=${orderId}): ${ledger.length}`);
    if (ledger.length) console.table(ledger);
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      // ignore
    }
    throw e;
  } finally {
    conn.release();
  }
}

main().catch((e) => {
  console.error('Script failed:', e);
  process.exit(1);
});
'pending','confirmed','processing','shipped','delivered','cancelled','refunded'