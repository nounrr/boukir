import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryBrandPriceOrderSql } from './categoryProductOrder.js';
import { ecommerceOfferPriceSql } from './ecommerceOfferPrice.js';

// Local, connection-scoped temporary tables: no catalogue data is modified.
test('shop and popup use offer prices and respect manual positions across brands', {
  skip: process.env.RUN_CATEGORY_ORDER_DB_TESTS !== '1',
}, async () => {
  const dotenv = await import('dotenv');
  dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true });
  dotenv.config({ path: new URL('../../.env', import.meta.url), quiet: true });
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST || 'localhost'));
  const { createConnection } = await import('mysql2/promise');
  const db = await createConnection({ host: '127.0.0.1', port: 3307,
    user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'boukir3' });
  try {
    await db.query(`CREATE TEMPORARY TABLE products (id INT PRIMARY KEY, designation VARCHAR(40),
      brand_id INT, prix_vente DECIMAL(12,2), pourcentage_promo INT DEFAULT 0,
      has_variants INT DEFAULT 0, is_obligatoire_variant INT DEFAULT 0)`);
    await db.query('CREATE TEMPORARY TABLE brands (id INT PRIMARY KEY, nom VARCHAR(40))');
    await db.query('CREATE TEMPORARY TABLE category_product_order (product_id INT, position INT)');
    await db.query("INSERT INTO brands VALUES (1, 'Sika'), (2, 'Kerakoll')");
    await db.query(`INSERT INTO products (id, designation, brand_id, prix_vente, pourcentage_promo, has_variants, is_obligatoire_variant)
      VALUES (1, 'A', 1, 250, 0, 0, 0), (2, 'B', 2, 999, 25, 1, 1),
      (3, 'C', 1, 350, 0, 0, 0), (4, 'D', 2, 200, 50, 0, 0)`);
    // Inline CTE fixtures avoid MySQL's restriction on reopening temporary tables.
    const price = ecommerceOfferPriceSql(true).replaceAll('product_snapshot', 'test_snapshots').replaceAll('product_variants', 'test_variants');
    const list = async manual => (await db.query(`WITH
      test_snapshots AS (SELECT 1 AS id, 2 AS product_id, 21 AS variant_id, 160 AS prix_vente,
        2 AS quantite, 1 AS en_validation, NOW() AS created_at UNION ALL SELECT 2, 4, NULL, 300, 2, 1, NOW()),
      test_variants AS (SELECT 21 AS id, 2 AS product_id, 800 AS prix_vente, 2 AS stock_quantity,
        0 AS is_deleted, 'color' AS variant_type, 'blue' AS variant_name)
      SELECT p.id, ${price} AS offer_price FROM products p
      LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN category_product_order pco ON pco.product_id = p.id
      ORDER BY ${categoryBrandPriceOrderSql(price, { manual, groupCategory: false })}`))[0];
    const automatic = await list(false);
    assert.deepEqual(automatic.map(p => p.id), [4, 2, 3, 1]);
    assert.equal(Number(automatic.find(p => p.id === 2).offer_price), 120);
    assert.equal(Number(automatic.find(p => p.id === 4).offer_price), 150);
    assert.deepEqual((await list(true)).map(p => p.id), [4, 2, 3, 1]);
    await db.query('INSERT INTO category_product_order VALUES (1, 0), (3, 1), (2, 2), (4, 3)');
    assert.deepEqual((await list(true)).map(p => p.id), [1, 3, 2, 4]);
    assert.deepEqual((await list(false)).map(p => p.id), [4, 2, 3, 1]);
    await db.query("INSERT INTO products (id, designation, brand_id, prix_vente) VALUES (5, 'New', 2, 900)");
    assert.deepEqual((await list(true)).map(p => p.id), [1, 3, 2, 4, 5]);
  } finally { await db.end(); }
});
