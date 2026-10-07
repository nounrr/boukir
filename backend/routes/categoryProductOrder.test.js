import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createCategoryProductOrderRouter } from './categoryProductOrder.js';

function database() {
  const state = { order: [1, 2, 3], commits: 0, rollbacks: 0, failInsert: false, queries: [] };
  let backup;
  const query = async (sql, params) => {
    state.queries.push(sql);
    if (sql.startsWith('CREATE TABLE')) return [[]];
    if (sql.startsWith('SELECT id FROM categories')) return [[{ id: 7 }]];
    if (sql.startsWith('SELECT p.id')) return [state.order.map(id => ({ id, designation: `Produit ${id}` }))];
    if (sql.startsWith('DELETE')) { state.order = []; return [{}]; }
    if (sql.startsWith('INSERT')) {
      if (state.failInsert) throw new Error('write failed');
      state.order.push(...params[0].map(row => row[1]));
      return [{}];
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
  return {
    state, query,
    getConnection: async () => ({
      query, beginTransaction: async () => { backup = [...state.order]; },
      commit: async () => { state.commits++; },
      rollback: async () => { state.order = backup; state.rollbacks++; },
      release() {},
    }),
  };
}

async function run(t, db, callback, role = 'Manager', onSaved) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = { role }; next(); });
  app.use('/order', createCategoryProductOrderRouter(db, onSaved));
  app.use((error, req, res, next) => res.status(500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/order/7`;
  const put = body => fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  await callback(url, put);
}

test('loads all category products and persists a drag order with cache invalidation', async t => {
  const db = database();
  let invalidation;
  await run(t, db, async (url, put) => {
    assert.deepEqual((await (await fetch(url)).json()).order, [1, 2, 3]);
    const response = await put({ product_ids: [3, 1, 2], expected_order: [1, 2, 3] });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).order, [3, 1, 2]);
    assert.deepEqual((await (await fetch(url)).json()).order, [3, 1, 2]);
    assert.equal(db.state.commits, 1);
    assert.deepEqual(invalidation, [3, 7]);
    assert.ok(db.state.queries.some(sql => sql.includes('p.categorie_id = ?') && sql.includes('pco.position ASC') && !sql.includes('LIMIT')));
  }, 'Manager', async (...args) => { invalidation = args; });
});

test('rejects duplicates, missing products, foreign products and stale ordering without changes', async t => {
  const db = database();
  await run(t, db, async (url, put) => {
    assert.equal((await put({ product_ids: [1, 1, 3], expected_order: [1, 2, 3] })).status, 400);
    for (const body of [
      { product_ids: [3, 1], expected_order: [1, 2, 3] },
      { product_ids: [3, 1, 99], expected_order: [1, 2, 3] },
      { product_ids: [3, 1, 2], expected_order: [2, 1, 3] },
    ]) assert.equal((await put(body)).status, 409);
    assert.deepEqual(db.state.order, [1, 2, 3]);
    assert.equal(db.state.commits, 0);
  });
});

test('rolls back partial writes and denies unauthorized roles', async t => {
  const db = database();
  db.state.failInsert = true;
  await run(t, db, async (url, put) => {
    assert.equal((await put({ product_ids: [3, 2, 1], expected_order: [1, 2, 3] })).status, 500);
    assert.deepEqual(db.state.order, [1, 2, 3]);
    assert.equal(db.state.rollbacks, 1);
  });
  await run(t, database(), async (url, put) => {
    assert.equal((await put({ product_ids: [3, 2, 1], expected_order: [1, 2, 3] })).status, 403);
  }, 'Chauffeur');
});
