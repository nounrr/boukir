import test from 'node:test';
import assert from 'node:assert/strict';
import { countProductPhotoUrlReferences, syncAttachedPhotoUrl } from './productPhotoFiles.js';

test('countProductPhotoUrlReferences totals every supported database reference', async () => {
  const counts = [1, 0, 2, 1, 0, 1];
  const conn = { query: async () => [[{ count: counts.shift() }]] };
  assert.equal(await countProductPhotoUrlReferences(conn, '/uploads/products/shoots/a.jpg'), 5);
});

test('syncAttachedPhotoUrl updates a product gallery and its main image conditionally', async () => {
  const calls = [];
  const conn = { query: async (sql, params) => { calls.push({ sql, params }); return [{ affectedRows: 1 }]; } };
  await syncAttachedPhotoUrl(conn, { product_id: 12, variant_id: null }, '/old.jpg', '/new.jpg');
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /UPDATE product_images/);
  assert.deepEqual(calls[0].params, ['/new.jpg', 12, '/old.jpg']);
  assert.match(calls[1].sql, /AND image_url = \?/);
});

test('syncAttachedPhotoUrl scopes variant updates to the addressed variant', async () => {
  const calls = [];
  const conn = { query: async (sql, params) => { calls.push({ sql, params }); return [{ affectedRows: 1 }]; } };
  await syncAttachedPhotoUrl(conn, { product_id: 12, variant_id: 44 }, '/old.jpg', '/new.jpg');
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /UPDATE variant_images/);
  assert.deepEqual(calls[0].params, ['/new.jpg', 44, '/old.jpg']);
  assert.match(calls[1].sql, /UPDATE product_variants/);
});

