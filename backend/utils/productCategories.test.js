import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCategoryIds, validateProductCategories, loadProductCategories, saveProductCategories } from './productCategories.js';

test('accepts JSON multipart values, deduplicates and preserves primary order', () => {
  assert.deepEqual(parseCategoryIds('[3,"2",3]'), [3, 2]);
  assert.deepEqual(parseCategoryIds([]), []);
  for (const value of [null, {}, '3', '[', [0], [-1], [true], [null], [1.5], ['oops']]) {
    assert.throws(() => parseCategoryIds(value), { status: 400 });
  }
});

test('rejects missing and parent categories before writes', async () => {
  const db = { query: async () => [[{ id: 3 }]] };
  await validateProductCategories(db, []);
  await validateProductCategories(db, [3]);
  await assert.rejects(validateProductCategories(db, [3, 4]), { status: 400 });
});

function database({ failInsert = false } = {}) {
  const state = { primary: 3, links: [4], commits: 0, rollbacks: 0, released: 0 };
  let backup;
  const query = async (sql, params) => {
    if (sql.startsWith('CREATE TABLE')) return [{}];
    if (sql.startsWith('SELECT categorie_id')) return [[{ categorie_id: state.primary }]];
    if (sql.startsWith('SELECT category_id')) return [state.links.map(category_id => ({ category_id }))];
    if (sql.startsWith('UPDATE products')) { state.primary = params[0]; return [{}]; }
    if (sql.startsWith('DELETE')) { state.links = []; return [{}]; }
    if (sql.startsWith('INSERT')) {
      if (failInsert) throw new Error('insert failed');
      state.links = params[0].map(row => row[1]);
      return [{}];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  return { state, query, getConnection: async () => ({
    query,
    beginTransaction: async () => { backup = { primary: state.primary, links: [...state.links] }; },
    commit: async () => { state.commits++; },
    rollback: async () => { Object.assign(state, backup); state.rollbacks++; },
    release: () => { state.released++; },
  }) };
}

test('replaces categories and promotes the first selection to primary', async () => {
  const db = database();
  await saveProductCategories(db, 1, [7, 8, 9]);
  assert.equal(db.state.primary, 7);
  assert.deepEqual(db.state.links, [8, 9]);
  assert.equal(db.state.commits, 1);
  assert.equal(db.state.released, 1);
});

test('bulk attachment preserves primary and existing links without duplicates', async () => {
  const db = database();
  await saveProductCategories(db, 1, [4, 7, 3], { append: true });
  assert.equal(db.state.primary, 3);
  assert.deepEqual(db.state.links, [4, 7]);
});

test('transfer replaces the old primary and every additional category with the target', async () => {
  const db = database();
  await saveProductCategories(db, 1, [7], { append: false });
  assert.equal(db.state.primary, 7);
  assert.deepEqual(db.state.links, []);
  assert.equal(db.state.commits, 1);
});

test('keeping categories is idempotent when attaching the same target repeatedly', async () => {
  const db = database();
  await saveProductCategories(db, 1, [7], { append: true });
  await saveProductCategories(db, 1, [7], { append: true });
  assert.equal(db.state.primary, 3);
  assert.deepEqual(db.state.links, [4, 7]);
});

test('clears all categories, including legacy primary', async () => {
  const db = database();
  await saveProductCategories(db, 1, []);
  assert.equal(db.state.primary, null);
  assert.deepEqual(db.state.links, []);
});

test('rolls back primary and links together if a write fails', async () => {
  const db = database({ failInsert: true });
  await assert.rejects(saveProductCategories(db, 1, [7, 8]), /insert failed/);
  assert.equal(db.state.primary, 3);
  assert.deepEqual(db.state.links, [4]);
  assert.equal(db.state.commits, 0);
  assert.equal(db.state.rollbacks, 1);
  assert.equal(db.state.released, 1);
});

test('reads legacy primary and additional categories in order', async () => {
  const db = { query: async sql => sql.startsWith('CREATE TABLE') ? [{}] : [[
    { product_id: 1, id: 3, nom: 'Principale', category_position: 0 },
    { product_id: 1, id: 4, nom: 'Autre', category_position: 1 },
  ]] };
  const categories = await loadProductCategories(db, [1]);
  assert.deepEqual(categories.get(1).map(c => c.id), [3, 4]);
  assert.equal(categories.get(1)[0].product_id, undefined);
  assert.equal((await loadProductCategories(db, [])).size, 0);
});
