import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryTotals, createCatalogPagesRouter } from './catalogPages.js';
test('category counts include descendants once, tolerate orphans and stop cycles', () => {
  const result = categoryTotals([{ id: 48 }, { id: 52, parent_id: 48 }, { id: 92, parent_id: 52 }], [{ id: 48, total: 1 }, { id: 52, total: 3 }, { id: 92, total: 5 }, { id: 999, total: 9 }]);
  assert.deepEqual(result, [{ id: 48, total: 9 }, { id: 52, total: 8 }, { id: 92, total: 5 }]);
  assert.deepEqual(categoryTotals([{ id: 1, parent_id: 2 }, { id: 2, parent_id: 1 }], [{ id: 1, total: 3 }]), [{ id: 1, total: 3 }, { id: 2, total: 3 }]);
});
test('counts restrict products to public, not deleted rows and errors propagate', async () => {
  const sqls = [];
  const db = { query: async sql => { sqls.push(sql); return [[]]; } };
  let result;
  await createCatalogPagesRouter(db).stack[0].route.stack[0].handle({}, { set() {}, json(v) { result = v; } }, e => { throw e; });
  for (const sql of sqls.slice(1)) { assert.match(sql, /ecom_published = 1/); assert.match(sql, /is_deleted, 0\) = 0/); }
  assert.deepEqual(result, { categories: [], brands: [] });
  const failure = new Error('offline');
  let caught;
  await createCatalogPagesRouter({ query: async () => { throw failure; } }).stack[0].route.stack[0].handle({}, {}, e => { caught = e; });
  assert.equal(caught, failure);
});
