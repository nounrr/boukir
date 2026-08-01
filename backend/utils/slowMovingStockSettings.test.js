import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SLOW_MOVING_STOCK_SETTINGS,
  getSlowMovingStockSettings,
  normalizeSlowMovingStockSettings,
  saveSlowMovingStockSettings,
  validateSlowMovingStockSettings,
} from './slowMovingStockSettings.js';

function fakeDb(storedValue) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes('SELECT setting_value')) {
        return [[...(storedValue === undefined ? [] : [{ setting_value: storedValue }])]];
      }
      return [[], []];
    },
  };
}

test('defaults are 4 months and 3 sales', () => {
  assert.deepEqual(DEFAULT_SLOW_MOVING_STOCK_SETTINGS, {
    lookbackMonths: 4,
    salesThreshold: 3,
  });
  assert.deepEqual(normalizeSlowMovingStockSettings({}), DEFAULT_SLOW_MOVING_STOCK_SETTINGS);
});

test('strict validation accepts inclusive bounds', () => {
  assert.deepEqual(validateSlowMovingStockSettings({ lookbackMonths: 1, salesThreshold: 0 }), {
    lookbackMonths: 1,
    salesThreshold: 0,
  });
  assert.deepEqual(validateSlowMovingStockSettings({ lookbackMonths: 60, salesThreshold: 100000 }), {
    lookbackMonths: 60,
    salesThreshold: 100000,
  });
});

test('strict validation rejects invalid values and numeric strings', () => {
  for (const input of [
    { lookbackMonths: 0, salesThreshold: 3 },
    { lookbackMonths: 61, salesThreshold: 3 },
    { lookbackMonths: 1.5, salesThreshold: 3 },
    { lookbackMonths: '4', salesThreshold: 3 },
    { lookbackMonths: 4, salesThreshold: -1 },
    { lookbackMonths: 4, salesThreshold: Infinity },
    { lookbackMonths: 4, salesThreshold: '3' },
  ]) {
    assert.throws(() => validateSlowMovingStockSettings(input), { status: 400 });
  }
});

test('invalid persisted JSON is repaired atomically with defaults', async () => {
  const db = fakeDb('{not-json');
  const settings = await getSlowMovingStockSettings(db);
  assert.deepEqual(settings, DEFAULT_SLOW_MOVING_STOCK_SETTINGS);
  const upsert = db.calls.find((call) => call.sql.includes('ON DUPLICATE KEY UPDATE'));
  assert.ok(upsert);
  assert.equal(upsert.params[1], JSON.stringify(DEFAULT_SLOW_MOVING_STOCK_SETTINGS));
});

test('save uses the slow-moving-stock key and atomic upsert', async () => {
  const db = fakeDb(undefined);
  const saved = await saveSlowMovingStockSettings({ lookbackMonths: 12, salesThreshold: 2.5 }, db);
  assert.deepEqual(saved, { lookbackMonths: 12, salesThreshold: 2.5 });
  const upsert = db.calls.find((call) => call.sql.includes('ON DUPLICATE KEY UPDATE'));
  assert.ok(upsert);
  assert.equal(upsert.params[0], 'slow_moving_stock');
});
