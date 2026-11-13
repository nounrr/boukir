import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pool from '../../db/pool.js';

test('manual order remise is credited on delivery and reconciled exactly once', async (t) => {
  let order;
  let item;
  let balance;
  let productReads;
  const reset = (overrides = {}) => {
    order = { id: 1, user_id: 7, status: 'pending', payment_status: 'pending',
      payment_method: 'cash_on_delivery', confirmed_at: null, remise_earned_at: null,
      remise_earned_amount: 0, remise_manually_set: 0, ...overrides };
    item = { id: 11, order_item_id: 11, subtotal: 200, quantity: 2, remise_percent_applied: 0, remise_amount: 0 };
    balance = 0;
    productReads = 0;
  };
  reset();
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async execute(sql) {
      if (sql.includes('information_schema.COLUMNS')) return [[{ exists: 1 }]];
      if (sql.includes('GET_LOCK') || sql.includes('RELEASE_LOCK')) return [[{ ok: 1 }]];
      if (sql.includes('remise_amount_per_unit')) {
        productReads++;
        return [[{ order_item_id: 11, quantity: 2, remise_amount_per_unit: 3 }]];
      }
      assert.fail(`Unexpected execute: ${sql}`);
    },
    async query(sql, params = []) {
      sql = sql.replace(/\s+/g, ' ').trim();
      if (sql.startsWith('SELECT') && sql.includes('FROM ecommerce_orders')) return [[{ ...order }]];
      if (sql.startsWith('SELECT type_compte')) return [[{ type_compte: 'Client' }]];
      if (sql.startsWith('SELECT COALESCE(SUM')) return [[{ total: item.remise_amount }]];
      if (sql.startsWith('SELECT') && sql.includes('FROM ecommerce_order_items')) return [[{ ...item }]];
      if (sql.startsWith('INSERT INTO ecommerce_order_status_history')) return [{ affectedRows: 1 }];
      if (sql.startsWith('UPDATE ecommerce_order_items')) {
        [item.remise_percent_applied, item.remise_amount] = params;
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('UPDATE contacts')) {
        balance = Math.max(0, balance + params[0]);
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('UPDATE ecommerce_orders')) {
        if (sql.includes('WHERE id = ? AND remise_earned_at IS NULL')) {
          if (order.remise_earned_at) return [{ affectedRows: 0 }];
          order.remise_earned_at = 'now';
          order.remise_earned_amount = params[0];
        } else if (sql.includes('remise_manually_set = 1')) {
          order.remise_earned_amount = params[0];
          order.remise_manually_set = 1;
        } else {
          let i = 0;
          if (/SET status = \?/.test(sql)) order.status = params[i++];
          if (sql.includes('confirmed_at =')) order.confirmed_at ||= 'now';
          if (sql.includes('payment_status = ?')) order.payment_status = params[i++];
        }
        return [{ affectedRows: 1 }];
      }
      assert.fail(`Unexpected query: ${sql}`);
    },
  };
  t.mock.method(pool, 'getConnection', async () => connection);
  const { default: router } = await import('./orders.js');
  const app = express();
  app.use(express.json(), (req, _res, next) => { req.user = { id: 2, role: 'PDG' }; next(); }, router);
  app.use((err, _req, res, _next) => res.status(500).json({ message: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await pool.end(); });
  const put = async (path, body) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/1/${path}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const result = await res.json();
    assert.equal(res.status, 200, JSON.stringify(result));
    return result;
  };
  const setRemise = amount => put('remises', { items: [{ order_item_id: 11, remise_amount: amount }] });

  await setRemise(25);
  assert.equal(balance, 0, 'pending orders do not credit the client');
  await put('status', { status: 'delivered' });
  assert.equal(balance, 25, 'direct delivery credits the manual amount');
  assert.equal(productReads, 0, 'product defaults must not overwrite the manual amount');
  assert.ok(order.confirmed_at);
  await put('status', { admin_notes: 'Second update' });
  assert.equal(balance, 25, 'no duplicate credit');
  await setRemise(40);
  assert.equal(balance, 40, 'subsequent edits credit only the difference');

  reset({ status: 'delivered', payment_status: 'paid' });
  await setRemise(30);
  assert.equal(balance, 30, 'resaving repairs a previously delivered uncredited order');

  reset();
  await setRemise(0);
  await put('status', { status: 'delivered' });
  assert.equal(balance, 0, 'an explicit zero remains zero');
  assert.equal(productReads, 0);

  reset();
  await put('status', { status: 'delivered' });
  assert.equal(balance, 6, 'orders without manual edits still earn product remise');

  reset({ payment_method: 'bank_transfer' });
  await setRemise(25);
  await put('status', { status: 'delivered' });
  assert.equal(balance, 0, 'unpaid bank transfers must not earn remise');
  await put('status', { payment_status: 'paid' });
  assert.equal(balance, 25);

  reset({ user_id: null });
  await setRemise(25);
  await put('status', { status: 'delivered' });
  assert.equal(balance, 0, 'guest orders have no client balance');

  reset({ status: 'cancelled', payment_status: 'paid', confirmed_at: 'earlier' });
  await setRemise(25);
  assert.equal(balance, 0, 'cancelled orders must not receive their first credit');
});
