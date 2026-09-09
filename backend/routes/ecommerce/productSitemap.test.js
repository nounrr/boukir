import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductSitemapRouter } from './productSitemap.js';

test('compact export uses the same publication/deletion guards as product details', async () => {
  let query;
  const rows = Array.from({ length: 3737 }, (_, i) => ({ id: i + 1, updated_at: '2026-09-01T10:00:00.000Z', description: 'not exported' }));
  const router = createProductSitemapRouter({ query: async sql => { query = sql; return [rows]; } });
  let result;
  await router.stack[0].route.stack[0].handle({}, {
    set: () => {}, json: value => { result = value; },
  }, error => { throw error; });
  assert.match(query, /p.ecom_published = 1 AND COALESCE\(p.is_deleted, 0\) = 0/);
  assert.match(query, /SELECT p.id, p.updated_at/);
  assert.doesNotMatch(query, /LIMIT|SELECT \*/);
  assert.equal(result.total_items, 3737);
  assert.equal(result.products.length, 3737);
  assert.deepEqual(Object.keys(result.products[0]), ['id', 'updated_at', 'designation', 'designation_ar', 'designation_en', 'designation_zh']);
  assert.match(query, /p.designation_ar, p.designation_en, p.designation_zh/);
});

test('database failure is forwarded, never returned as an empty successful export', async () => {
  const failure = new Error('database unavailable');
  const router = createProductSitemapRouter({ query: async () => { throw failure; } });
  let forwarded;
  await router.stack[0].route.stack[0].handle({}, { json: () => assert.fail('must not return JSON') }, error => { forwarded = error; });
  assert.equal(forwarded, failure);
});
