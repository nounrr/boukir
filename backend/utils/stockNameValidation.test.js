import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { UNVALIDATED_STOCK_NAME_SQL, stockNameValidationSql, markStockNameValidation, hasNameCorrectionsTable, loadStockNameValidation } from './stockNameValidation.js';
import { filterStockRowsByUnvalidatedName } from '../../frontend/src/utils/stockNameValidation.js';

test('the stock SQL finds unreviewed names before pagination and ignores application dates', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE products (id INTEGER, is_deleted INTEGER);
      CREATE TABLE product_variants (id INTEGER, product_id INTEGER, is_deleted INTEGER);
      CREATE TABLE product_name_corrections (matched_product_id INTEGER, matched_variant_id INTEGER, review_status TEXT, applied_at TEXT);
      INSERT INTO products VALUES (1,0),(2,0),(3,0),(4,0),(5,0),(6,1);
      INSERT INTO product_variants VALUES (11,1,0),(21,2,0),(22,2,0),(51,5,1);
      INSERT INTO product_name_corrections VALUES
        (1,NULL,'correct',NULL),(1,11,'correct',NULL),
        (2,NULL,'correct',NULL),(2,21,'correct',NULL),(2,22,'initial',NULL),
        (4,NULL,'false','2026-11-01'),(5,NULL,'correct',NULL);`);
    const where = `COALESCE(p.is_deleted,0)=0 AND ${UNVALIDATED_STOCK_NAME_SQL}`;
    assert.deepEqual(db.prepare(`SELECT p.id FROM products p WHERE ${where} ORDER BY p.id`).all().map(row => row.id), [2,3,4]);
    assert.equal(db.prepare(`SELECT COUNT(*) AS total FROM products p WHERE ${where}`).get().total, 3);
    assert.equal(db.prepare(`SELECT p.id FROM products p WHERE ${where} ORDER BY p.id LIMIT 1 OFFSET 1`).get().id, 3);
  } finally { db.close(); }
});

test('correct variants are hidden without hiding unchecked siblings or mixing product ids', () => {
  const products = [{ id: 2, variants: [{ id: 21 }, { id: 22 }] }, { id: 3, variants: [] }];
  markStockNameValidation(products, [{ matched_product_id: 2, matched_variant_id: null }, { matched_product_id: 2, matched_variant_id: 21 }]);
  const rows = [{ id: 2, name_validation_correct: products[0].name_validation_correct },
    ...products[0].variants, products[1]];
  assert.deepEqual(filterStockRowsByUnvalidatedName(rows, true).map(row => row.id), [22,3]);
  assert.equal(filterStockRowsByUnvalidatedName(rows, false), rows);
});

test('the name and missing-image filters must match the same stock entity', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE products (id INTEGER, image_url TEXT);
      CREATE TABLE product_variants (id INTEGER, product_id INTEGER, is_deleted INTEGER, image_url TEXT);
      CREATE TABLE product_name_corrections (matched_product_id INTEGER, matched_variant_id INTEGER, review_status TEXT);
      INSERT INTO products VALUES (1,NULL),(2,'/photo.png');
      INSERT INTO product_variants VALUES (11,1,0,'/variant.png'),(21,2,0,NULL);
      INSERT INTO product_name_corrections VALUES (1,NULL,'correct'),(2,NULL,'correct');`);
    assert.deepEqual(db.prepare(`SELECT p.id FROM products p WHERE ${stockNameValidationSql({ missingImage: true })}`).all().map(row => row.id), [2]);
  } finally { db.close(); }
});

test('a missing corrections table treats every entity as unreviewed without creating a table', async () => {
  let queries = 0;
  const db = { query: async sql => { queries++; assert.match(sql, /information_schema.TABLES/); return [[]]; } };
  const exists = await hasNameCorrectionsTable(db);
  assert.equal(exists, false);
  const products = await loadStockNameValidation(db, [{ id: 7, variants: [{ id: 71 }] }], exists);
  assert.equal(queries, 1);
  assert.equal(products[0].name_validation_correct, false);
  assert.equal(products[0].variants[0].name_validation_correct, false);
});

test('only Correct rows for the requested product page are loaded', async () => {
  const db = { query: async (sql, params) => {
    assert.match(sql, /review_status = 'correct'/);
    assert.doesNotMatch(sql, /applied_at/);
    assert.deepEqual(params, [[7]]);
    return [[{ matched_product_id: 7, matched_variant_id: null }]];
  } };
  const result = await loadStockNameValidation(db, [{ id: 7, variants: [] }], true);
  assert.equal(result[0].name_validation_correct, true);
});
