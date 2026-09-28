import assert from 'node:assert/strict';
import test from 'node:test';
import { adaptHistoricalUnitPrice } from './comptantUnitPrice.ts';

const units = [{ id: 10, conversion_factor: 12 }, { id: 20, conversion_factor: 6 }];

test('converts a historical pack price to the base unit on initial selection', () => {
  assert.equal(adaptHistoricalUnitPrice(1200, 10, 12, '', units), 100);
});

test('converts the latest price when the selected unit changes', () => {
  assert.equal(adaptHistoricalUnitPrice(100, null, null, 10, units), 1200);
  assert.equal(adaptHistoricalUnitPrice(1200, 10, 12, 20, units), 600);
});

test('keeps the exact unit price and skips unknown conversions', () => {
  assert.equal(adaptHistoricalUnitPrice(1200, 10, 8, 10, units), 1200);
  assert.equal(adaptHistoricalUnitPrice(1200, 99, null, '', units), null);
});
