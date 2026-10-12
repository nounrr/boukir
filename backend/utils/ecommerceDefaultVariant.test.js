import assert from 'node:assert/strict';
import test from 'node:test';
import { prioritizeDefaultVariant } from './ecommerceDefaultVariant.js';

test('KERAKOLL defaults to a priced in-stock variant instead of 04 at zero', () => {
  const variants = [
    { id: 307, variant_name: '04', prix_vente: 0, available: false },
    { id: 98, variant_name: '37', prix_vente: 0, available: true },
    { id: 93, variant_name: 'KK129', prix_vente: 140, available: true },
  ];
  const result = prioritizeDefaultVariant(variants, true);
  assert.deepEqual(result.map(v => v.id), [93, 307, 98]);
  assert.equal(result[0].prix_vente, 140);
  assert.equal(result[0].available, true);
  assert.equal(variants[0].id, 307);
});

test('available priced variants precede sold-out prices and retain their own price', () => {
  const variants = [
    { id: 1, prix_vente: 120, stock_quantity: 0 },
    { id: 2, prix_vente: '140.00', stock_quantity: '1.000' },
    { id: 3, prix_vente: 150, stock_quantity: 10 },
  ];
  assert.deepEqual(prioritizeDefaultVariant(variants, 1).map(v => v.id), [2, 1, 3]);
});

test('sold-out catalogues retain a real price without claiming availability', () => {
  const result = prioritizeDefaultVariant([
    { id: 1, prix_vente: 0, available: false },
    { id: 2, prix_vente: 140, available: false },
  ], 1);
  assert.equal(result[0].id, 2);
  assert.equal(result[0].available, false);
});

test('optional variants, no prices and empty lists preserve their existing default', () => {
  const variants = [{ id: 1, prix_vente: 0 }, { id: 2, prix_vente: 140, available: true }];
  assert.equal(prioritizeDefaultVariant(variants, 0), variants);
  const unpriced = [{ id: 1, prix_vente: null }, { id: 2, prix_vente: 'invalid' }];
  assert.equal(prioritizeDefaultVariant(unpriced, 1), unpriced);
  assert.deepEqual(prioritizeDefaultVariant([], 1), []);
});
