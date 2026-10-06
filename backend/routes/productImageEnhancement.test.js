import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAllImageUsages } from './productImageEnhancement.js';

test('image usage query gives all UNION text columns the same charset and collation', async () => {
  const rows = [{ kind: 'variant_gallery', url: '/uploads/item.webp', product_id: 1, variant_id: 2 }];
  let query;
  const result = await loadAllImageUsages({ query: async (sql) => { query = sql; return [rows]; } });
  assert.strictEqual(result, rows);
  const branches = query.split('UNION ALL');
  assert.equal(branches.length, 4);
  for (const branch of branches) {
    const projection = branch.slice(branch.indexOf('SELECT'), branch.indexOf('FROM'));
    // kind, URL, designation and variant name must each be normalized, even NULL names.
    assert.equal((projection.match(/USING utf8mb4\) COLLATE utf8mb4_unicode_ci/g) || []).length, 4);
  }
  for (const table of ['products p', 'product_images pi', 'product_variants pv', 'variant_images vi']) {
    assert.ok(query.includes(`FROM ${table}`));
  }
  assert.match(query, /COALESCE\(pv\.is_deleted, 0\) = 0/);
});
