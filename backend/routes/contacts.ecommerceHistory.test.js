import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pool from '../db/pool.js';
import router from './contacts.js';

test('client history exposes ecommerce documents and lines in both API history formats', async t => {
  const order = { id: 1, user_id: 7, order_number: 'ECO-1', status: 'delivered', created_at: '2026-11-14T10:00:00Z',
    is_solde: 1, total_amount: 90, solde_amount: 80, remise_used_amount: 10, shipping_cost: 10, promo_discount_amount: 20,
    items: JSON.stringify([{ id: 11, product_id: 3, quantity: 2, unit_price: 50, subtotal: 100, product_name: 'Produit e-commerce', cout_revient: 30, remise_amount: 5 }]) };
  t.mock.method(pool, 'query', async (sql, params) => {
    if (sql.includes('SELECT id, type, nom_complet')) return [[{ id: 7, type: 'Client', solde: 0 }]];
    if (sql.includes('FROM ecommerce_orders eo') && sql.includes('GROUP BY eo.id')) {
      assert.deepEqual(params, [7]);
      return [[order, { ...order, id: 2, order_number: 'ECO-2', created_at: '2026-11-15T10:00:00Z', is_solde: 0 },
        { ...order, id: 3, status: 'cancelled' }]];
    }
    return [[]];
  });
  const app = express();
  app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await pool.end(); });
  const url = `http://127.0.0.1:${server.address().port}/7/history`;
  const response = await fetch(`${url}?limit=1&page=last`);
  assert.equal(response.status, 200);
  const history = await response.json();
  assert.equal(history.ecommerceOrders.length, 1);
  assert.equal(history.ecommerceOrders[0].numero, 'ECO-2');
  assert.equal(history.ecommerceOrders[0].balance_amount, 0);
  assert.equal(history.historyPagination.totalPages, 2);
  assert.equal(history.historyTotals.finalSolde, -80);
  assert.ok(history.productHistoryRows.every(row => row.bon_type === 'Ecommerce'));
  assert.ok(history.productHistoryRows.every(row => row.id.startsWith('Ecommerce-')));
  const paged = await fetch(`${url}?ledger=client&tab=ecommerce&limit=1`);
  assert.equal(paged.status, 200);
  const ledger = await paged.json();
  assert.equal(ledger.ecommerceOrders.length, 1);
  assert.equal(ledger.ecommerceOrders[0].numero, 'ECO-2');
  assert.equal(ledger.ledgerCounts.ecommerce, 2);
  assert.equal(ledger.ledgerTotals.finalSolde, 80);
});
