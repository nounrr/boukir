import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assembleSlowMovingStock,
  buildSlowMovingStockQueries,
  FINAL_BACKOFFICE_STATUSES,
  STOCK_ENTRY_BACKOFFICE_STATUSES,
  isSlowMovingCandidate,
  skuKindsForProduct,
} from './slowMovingStockQuery.js';

test('parent and variant SKU rules stay independent', () => {
  assert.deepEqual(skuKindsForProduct({ hasVariants: false, mandatoryVariants: false }), ['parent']);
  assert.deepEqual(skuKindsForProduct({ hasVariants: true, mandatoryVariants: true }), ['variant']);
  assert.deepEqual(skuKindsForProduct({ hasVariants: true, mandatoryVariants: false }), ['parent', 'variant']);
});

test('stock must be positive and thresholds 0, 3 and 4 are inclusive', () => {
  assert.equal(isSlowMovingCandidate(5, 0, 0), true);
  assert.equal(isSlowMovingCandidate(5, 3, 3), true);
  assert.equal(isSlowMovingCandidate(5, 4, 3), false);
  assert.equal(isSlowMovingCandidate(5, 4, 4), true);
  assert.equal(isSlowMovingCandidate(0, 0, 4), false);
});

test('query uses snapshot fallback, effective variant and null-safe SKU equality', () => {
  const queries = buildSlowMovingStockQueries({
    periodStart: '2026-03-31 12:00:00',
    q: 'ABC',
  });
  assert.match(queries.parentCatalog.sql, /snapshot_count, 0\) > 0 THEN COALESCE\(parent_stock\.snapshot_stock, 0\)/);
  assert.match(queries.variantCatalog.sql, /snapshot_count, 0\) > 0 THEN COALESCE\(variant_stock\.snapshot_stock, 0\)/);
  assert.match(queries.sortieSales.sql, /COALESCE\(item\.variant_id, ps\.variant_id\)/);
  assert.match(queries.comptantSales.sql, /COALESCE\(item\.variant_id, ps\.variant_id\)/);
  assert.match(queries.ecommerceSales.sql, /COALESCE\(eoi\.variant_id, ps\.variant_id\)/);
  assert.equal(queries.parentCatalog.params[0], 'ABC');
});

test('queries avoid UNION and CTE syntax for old MySQL compatibility', () => {
  const queries = buildSlowMovingStockQueries({
    periodStart: '2026-03-31 12:00:00',
  });
  for (const query of Object.values(queries)) {
    assert.doesNotMatch(query.sql, /\bUNION\b/i);
    assert.doesNotMatch(query.sql, /^\s*WITH\b/i);
  }
});

test('pending and finalized back-office statuses and delivered ecommerce orders are included', () => {
  assert.deepEqual(FINAL_BACKOFFICE_STATUSES, [
    'En attente', 'Validé', 'Valide', 'Livré', 'Livre', 'Payé', 'Paye', 'Facturé', 'Facture',
  ]);
  const queries = buildSlowMovingStockQueries({
    periodStart: '2026-03-31 12:00:00',
  });
  assert.match(queries.ecommerceSales.sql, /eo\.status = 'delivered'/);
  assert.match(queries.ecommerceSales.sql, /eo\.delivered_at IS NOT NULL/);
  assert.doesNotMatch(queries.ecommerceSales.sql, /pending|En attente|Annulé/);
});

test('last stock date uses pending and validated purchase orders', () => {
  const queries = buildSlowMovingStockQueries({
    periodStart: '2026-03-31 12:00:00',
  });
  assert.deepEqual(STOCK_ENTRY_BACKOFFICE_STATUSES, ['En attente', 'Validé', 'Valide']);
  assert.match(queries.stockEntries.sql, /FROM bons_commande header/);
  assert.match(queries.stockEntries.sql, /INNER JOIN commande_items item/);
  assert.match(queries.stockEntries.sql, /MAX\(header\.date_creation\) AS last_stock_at/);
  assert.match(queries.stockEntries.sql, /COALESCE\(item\.variant_id, ps\.variant_id\)/);
});

test('catalog and separate sale sources are merged, sorted and paginated', () => {
  const result = assembleSlowMovingStock({
    catalogRows: [
      { product_id: 2, variant_id: null, stock_current: 4 },
      { product_id: 1, variant_id: 10, stock_current: 8 },
      { product_id: 1, variant_id: 11, stock_current: 0 },
    ],
    salesRows: [
      { product_id: 1, variant_id: 10, sold_quantity: 1, last_sale_at: '2026-04-01 10:00:00' },
      { product_id: 1, variant_id: 10, sold_quantity: 2, last_sale_at: '2026-05-01 10:00:00' },
      { product_id: 2, variant_id: null, sold_quantity: 0, last_sale_at: null },
    ],
    stockEntryRows: [
      { product_id: 1, variant_id: 10, last_stock_at: '2026-03-01 09:00:00' },
      { product_id: 1, variant_id: 10, last_stock_at: '2026-04-01 09:00:00' },
      { product_id: 2, variant_id: null, last_stock_at: '2026-02-01 09:00:00' },
    ],
    salesThreshold: 3,
    page: 1,
    limit: 20,
  });

  assert.deepEqual(result.data.map((row) => [row.product_id, row.variant_id]), [[2, null], [1, 10]]);
  assert.equal(result.data[1].sold_quantity, 3);
  assert.equal(result.data[1].last_sale_at, '2026-05-01 10:00:00');
  assert.equal(result.data[0].last_stock_at, '2026-02-01 09:00:00');
  assert.equal(result.data[1].last_stock_at, '2026-04-01 09:00:00');
  assert.deepEqual(result.summary, {
    skuCount: 2,
    productCount: 2,
    totalStock: 12,
    zeroSalesCount: 1,
  });
});
