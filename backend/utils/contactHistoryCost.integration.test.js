import assert from 'node:assert/strict';
import test from 'node:test';
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { historyItemCostExpr } from './contactHistoryCost.js';

// Opt-in MySQL test: all data comes from CTEs; no application table is read or written.
test('contact history compares sale price and weighted cost in the same unit', {
  skip: process.env.RUN_CONTACT_HISTORY_DB_TESTS !== '1',
}, async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3307),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
  });
  try {
    const [rows] = await connection.query(`
      WITH products AS (
        SELECT 1 id, 100 cout_revient, 90 prix_achat
        UNION ALL SELECT 2, 100, 90
        UNION ALL SELECT 3, 100, 90
        UNION ALL SELECT 4, NULL, 10
      ), product_snapshot AS (
        SELECT 1 id, 1 product_id, CAST(NULL AS SIGNED) variant_id, 60.0 cout_revient, 50 prix_achat
        UNION ALL SELECT 2, 1, NULL, 66.4, 50
        UNION ALL SELECT 3, 2, 10, 25, 20
      ), commande_items AS (
        SELECT 1 product_snapshot_id, 1 quantite
        UNION ALL SELECT 2, 2
        UNION ALL SELECT 3, 1
      ), product_variants AS (
        SELECT 10 id, 80 cout_revient, 70 prix_achat
        UNION ALL SELECT 20, 12, 10
      ), product_units AS (
        SELECT 1 id, 1 product_id, 0.04 conversion_factor
        UNION ALL SELECT 2, 1, 2
        UNION ALL SELECT 3, 2, 0.5
        UNION ALL SELECT 4, 3, 3
        UNION ALL SELECT 5, 4, 0.25
      ), items AS (
        SELECT 'kg' label, 1 product_id, CAST(NULL AS SIGNED) variant_id, 1 unit_id, 1 product_snapshot_id, 4 prix_unitaire, 6 quantite
        UNION ALL SELECT 'base', 1, NULL, NULL, 1, 100, 1
        UNION ALL SELECT 'pack', 1, NULL, 2, 1, 150, 1
        UNION ALL SELECT 'snapshot_variant', 2, 10, 3, 3, 20, 2
        UNION ALL SELECT 'variant_fallback', 3, 20, 4, NULL, 40, 1
        UNION ALL SELECT 'purchase_fallback', 4, NULL, 5, NULL, 4, 2
        UNION ALL SELECT 'loss', 1, NULL, 1, 1, 1, 6
        UNION ALL SELECT 'return', 1, NULL, 1, 1, 4, -6
        UNION ALL SELECT 'missing_unit', 4, NULL, 99, NULL, 15, 1
        UNION ALL SELECT 'other_product_unit', 4, NULL, 1, NULL, 15, 1
      )
      SELECT i.label, ${historyItemCostExpr('i')} AS cost,
        ROUND((i.prix_unitaire - ${historyItemCostExpr('i')}) * i.quantite, 2) AS profit
      FROM items i
      LEFT JOIN products p ON p.id = i.product_id
      LEFT JOIN product_snapshot ps ON ps.id = i.product_snapshot_id
      LEFT JOIN product_units pu ON pu.id = i.unit_id AND pu.product_id = i.product_id
    `);
    const byLabel = Object.fromEntries(rows.map(row => [row.label, row]));
    const expected = {
      kg: 8.58, base: 35.73, pack: 21.47, snapshot_variant: 15,
      variant_fallback: 4, purchase_fallback: 3, loss: -9.42,
      return: -8.58, missing_unit: 5, other_product_unit: 5,
    };
    for (const [label, profit] of Object.entries(expected)) {
      assert.equal(Number(byLabel[label].profit), profit, label);
    }
    assert.equal(Number(Number(byLabel.kg.cost).toFixed(2)), 2.57);
  } finally {
    await connection.end();
  }
});
