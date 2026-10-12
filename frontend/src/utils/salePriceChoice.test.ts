import assert from 'node:assert/strict';
import test from 'node:test';
import { isCustomPriceChoice, salePriceCorrectionAction } from './salePriceChoice.ts';

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

test('explicit 140/140 always writes prices even when the displayed parent fallback is already 140', () => {
  for (const custom of [undefined, true] as const) {
    assert.equal(salePriceCorrectionAction({
      pv1: { kind: 'price', value: 140, custom },
      pv2: { kind: 'price', value: 140, custom },
    }), 'apply');
  }
});

test('PV and PV2 can each independently force a write; only keeping both confirms', () => {
  const keep = { kind: 'keep' } as const;
  const price = { kind: 'price', value: 140 } as const;
  assert.equal(salePriceCorrectionAction({ pv1: price, pv2: keep }), 'apply');
  assert.equal(salePriceCorrectionAction({ pv1: keep, pv2: price }), 'apply');
  assert.equal(salePriceCorrectionAction({ pv1: keep, pv2: keep }), 'confirm');
  assert.equal(salePriceCorrectionAction({ pv1: keep, pv2: keep }, true), 'apply');
});
