import assert from 'node:assert/strict';
import test from 'node:test';
import { isCustomPriceChoice } from './salePriceChoice.ts';

test('typing 140 remains in the custom field when 1, 14 or 140 is a suggestion', () => {
  const candidates = [{ price: 1 }, { price: 14 }, { price: 140 }];
  for (const value of [1, 14, 140]) {
    assert.equal(isCustomPriceChoice({ kind: 'price', value, custom: true }, candidates), true);
  }
});

test('clicking a suggested price or keeping the current price exits custom mode', () => {
  const candidates = [{ price: 140 }];
  assert.equal(isCustomPriceChoice({ kind: 'price', value: 140 }, candidates), false);
  assert.equal(isCustomPriceChoice({ kind: 'keep' }, candidates), false);
  assert.equal(isCustomPriceChoice(undefined, candidates), false);
});

test('bulk prices without a matching suggestion still appear in the custom field', () => {
  assert.equal(isCustomPriceChoice({ kind: 'price', value: 140 }, [{ price: 150 }]), true);
  assert.equal(isCustomPriceChoice({ kind: 'price', value: 0, custom: true }, []), true);
});
