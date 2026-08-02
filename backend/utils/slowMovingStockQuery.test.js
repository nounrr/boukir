import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSlowMovingStockQueries,
  FINAL_BACKOFFICE_STATUSES,
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
    salesThreshold: 3,
    q: 'ABC',
    limit: 20,
    offset: 0,
  });
  assert.match(queries.dataSql, /snapshot_count > 0 THEN .*snapshot_stock/s);
  assert.match(queries.dataSql, /COALESCE\(si\.variant_id, ps\.variant_id\)/);
  assert.match(queries.dataSql, /COALESCE\(ci\.variant_id, ps\.variant_id\)/);
  assert.match(queries.dataSql, /sales\.variant_id <=> sku\.variant_id/);
  assert.match(queries.dataSql, /sold_at >= \?/);
  assert.equal(queries.dataParams.at(-2), 20);
  assert.equal(queries.dataParams.at(-1), 0);
});

test('query normalizes every SKU catalog text projection used by UNION ALL', () => {
  const { dataSql } = buildSlowMovingStockQueries({
    periodStart: '2026-03-31 12:00:00',
    salesThreshold: 3,
    limit: 20,
    offset: 0,
  });

  assert.match(dataSql, /CONVERT\('parent' USING utf8mb4\) COLLATE utf8mb4_unicode_ci/);
  assert.match(dataSql, /CONVERT\('variant' USING utf8mb4\) COLLATE utf8mb4_unicode_ci/);
  assert.match(dataSql, /CONVERT\(p\.reference_2 USING utf8mb4\) COLLATE utf8mb4_unicode_ci/);
  assert.match(dataSql, /CONVERT\(pv\.variant_name USING utf8mb4\) COLLATE utf8mb4_unicode_ci/);
  assert.match(dataSql, /CONVERT\(pv\.reference USING utf8mb4\) COLLATE utf8mb4_unicode_ci/);
  assert.match(dataSql, /CONVERT\(COALESCE\(NULLIF\(pv\.image_url, ''\), p\.image_url\) USING utf8mb4\) COLLATE utf8mb4_unicode_ci/);
  assert.match(dataSql, /CAST\(NULL AS CHAR CHARACTER SET utf8mb4\) COLLATE utf8mb4_unicode_ci/);
});

test('only finalized back-office statuses and delivered ecommerce orders are included', () => {
  assert.deepEqual(FINAL_BACKOFFICE_STATUSES, [
    'Validé', 'Valide', 'Livré', 'Livre', 'Payé', 'Paye', 'Facturé', 'Facture',
  ]);
  const { summarySql } = buildSlowMovingStockQueries({
    periodStart: '2026-03-31 12:00:00',
    salesThreshold: 3,
    limit: 20,
    offset: 0,
  });
  assert.match(summarySql, /eo\.status = 'delivered'/);
  assert.match(summarySql, /eo\.delivered_at IS NOT NULL/);
  assert.doesNotMatch(summarySql, /pending|En attente|Annulé/);
});
