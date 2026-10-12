import assert from 'node:assert/strict';
import test from 'node:test';
import { salePriceCorrectionAction } from '../../frontend/src/utils/salePriceChoice.ts';

// Opt-in, loopback MySQL only. All writes target connection-local TEMPORARY
// tables shadowing the catalogue tables; no real product is changed.
test('sale price corrections persist to catalogue and stock', {
  skip: process.env.RUN_SALE_PRICE_DB_TESTS !== '1',
}, async (t) => {
  const dotenv = await import('dotenv');
  dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true });
  dotenv.config({ path: new URL('../../.env', import.meta.url), quiet: true });
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST || 'localhost'), 'Integration tests require a local database');
  const mysql = await import('mysql2/promise');
  const connection = await mysql.createConnection({
    host: '127.0.0.1', port: Number(process.env.DB_PORT || 3307),
    user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'boukir3',
  });
  const { normalizeSalePriceCorrections, applySalePriceCorrections } = await import('./products.js');
  const { default: pool } = await import('../db/pool.js');
  try {
    for (const table of ['products', 'product_variants', 'product_snapshot']) {
      await connection.query(`CREATE TEMPORARY TABLE ${table} (
        id INT PRIMARY KEY, product_id INT, variant_id INT,
        prix_vente DECIMAL(15,6), prix_vente_2 DECIMAL(15,2),
        quantite DECIMAL(15,3) DEFAULT 1, en_validation INT DEFAULT 1,
        is_deleted INT DEFAULT 0, sale_price_corrected_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME, updated_by INT
      ) ENGINE=InnoDB`);
    }
    async function reset() {
      await connection.query('DELETE FROM product_snapshot');
      await connection.query('DELETE FROM product_variants');
      await connection.query('DELETE FROM products');
      await connection.query('INSERT INTO products (id, prix_vente, prix_vente_2) VALUES (6190, 140, 140)');
      await connection.query('INSERT INTO product_variants (id, product_id, prix_vente, prix_vente_2) VALUES (93, 6190, 0, 0), (94, 6190, 0, 0)');
      await connection.query('INSERT INTO product_snapshot (id, product_id, variant_id, prix_vente, prix_vente_2) VALUES (9214, 6190, 93, 0, 0), (9215, 6190, 94, 0, 0), (9216, 6190, 93, 0, 0)');
    }
    function correction(variantId = 93, price = 140, price2 = 140) {
      return {
        product_id: 6190, variant_id: variantId,
        action: salePriceCorrectionAction({ pv1: { kind: 'price', value: price }, pv2: { kind: 'price', value: price2 } }),
        prix_vente: price, prix_vente_2: price2,
        expected_prix_vente: 140, expected_prix_vente_2: 140,
      };
    }
    async function apply(corrections) {
      const { normalized, error } = normalizeSalePriceCorrections({ corrections });
      assert.equal(error, undefined);
      await connection.beginTransaction();
      try {
        const result = await applySalePriceCorrections(connection, normalized, null, true);
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }
    async function stored(variantId = 93) {
      const [[variant]] = await connection.query('SELECT * FROM product_variants WHERE id = ?', [variantId]);
      const [snapshots] = await connection.query('SELECT * FROM product_snapshot WHERE variant_id = ?', [variantId]);
      // Same effective variant-price lookup used by the public e-commerce API.
      const [[offer]] = await connection.query(`SELECT COALESCE((
        SELECT NULLIF(ps.prix_vente, 0) FROM product_snapshot ps
        WHERE ps.variant_id = pv.id AND COALESCE(ps.en_validation, 0) <> 0
        ORDER BY CASE WHEN ps.quantite > 0 THEN 0 ELSE 1 END, ps.created_at, ps.id LIMIT 1
      ), pv.prix_vente) AS prix_vente FROM product_variants pv WHERE pv.id = ?`, [variantId]);
      return { variant, snapshots, offer };
    }

    await t.test('old confirm action reproduces Treated with zero prices', async () => {
      await reset();
      await apply([{ ...correction(), action: 'confirm' }]);
      const { variant, snapshots, offer } = await stored();
      assert.ok(variant.sale_price_corrected_at);
      assert.equal(Number(variant.prix_vente), 0);
      assert.equal(Number(snapshots[0].prix_vente), 0);
      assert.equal(Number(offer.prix_vente), 0);
    });

    await t.test('explicit inherited 140/140 updates the variant, every snapshot and public offer', async () => {
      await reset();
      await apply([correction()]);
      const { variant, snapshots, offer } = await stored();
      for (const row of [variant, ...snapshots]) {
        assert.equal(Number(row.prix_vente), 140);
        assert.equal(Number(row.prix_vente_2), 140);
        assert.ok(row.sale_price_corrected_at);
      }
      assert.equal(Number(offer.prix_vente), 140);
      assert.equal(Number((await stored(94)).variant.prix_vente), 0);
    });

    await t.test('bulk correction writes separate PV and PV2 for both selected variants', async () => {
      await reset();
      await apply([correction(93, 160, 150), correction(94, 170, 155)]);
      for (const [id, pv, pv2] of [[93, 160, 150], [94, 170, 155]]) {
        const { variant, snapshots, offer } = await stored(id);
        for (const row of [variant, ...snapshots]) {
          assert.equal(Number(row.prix_vente), pv);
          assert.equal(Number(row.prix_vente_2), pv2);
        }
        assert.equal(Number(offer.prix_vente), pv);
      }
    });

    await t.test('group correction updates the base product and all its active variants', async () => {
      await reset();
      await apply([{ ...correction(null, 150, 145), apply_to_all_variants: true }]);
      for (const id of [93, 94]) {
        const { variant, snapshots } = await stored(id);
        for (const row of [variant, ...snapshots]) {
          assert.equal(Number(row.prix_vente), 150);
          assert.equal(Number(row.prix_vente_2), 145);
        }
      }
      const [[product]] = await connection.query('SELECT prix_vente FROM products WHERE id = 6190');
      assert.equal(Number(product.prix_vente), 150);
    });

    await t.test('a stale price rolls the whole batch back, including treated markers', async () => {
      await reset();
      await assert.rejects(apply([correction(), { ...correction(94), expected_prix_vente: 100 }]), { httpStatus: 409 });
      const { variant, snapshots } = await stored();
      for (const row of [variant, ...snapshots]) {
        assert.equal(Number(row.prix_vente), 0);
        assert.equal(row.sale_price_corrected_at, null);
      }
    });
  } finally {
    await connection.end();
    await pool.end();
  }
});
