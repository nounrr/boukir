import test from 'node:test';
import assert from 'node:assert/strict';
import { filterStockRowsByMissingImage } from './stockMissingImage.js';

test('missing-image filter keeps only the exact parent and variant rows without images', () => {
  const rows = [
    { id: 1, image_url: null },
    { id: 'var-10', originalId: 1, isVariantRow: true, variant_image_url: null },
    { id: 'var-11', originalId: 1, isVariantRow: true, variant_image_url: '/variant-11.webp' },
    { id: 2, image_url: '/product-2.webp' },
    { id: 'var-20', originalId: 2, isVariantRow: true, variant_image_url: '' },
    { id: 'var-21', originalId: 2, isVariantRow: true, variant_image_url: '   ' },
  ];

  assert.deepEqual(
    filterStockRowsByMissingImage(rows, true).map((row) => row.id),
    [1, 'var-10', 'var-20', 'var-21']
  );
});

test('missing-image filter leaves rows unchanged when disabled', () => {
  const rows = [{ id: 1, image_url: '/product.webp' }];
  assert.equal(filterStockRowsByMissingImage(rows, false), rows);
});
