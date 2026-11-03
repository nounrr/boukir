import test from 'node:test';
import assert from 'node:assert/strict';
import { getVehicleConsumption, parseVehicleConsumptionQuery } from './vehicleConsumption.js';

test('validates dates and grouping before querying the database', async () => {
  for (const query of [
    { groupBy: 'week', dateFrom: '2026-01-01', dateTo: '2026-02-01' },
    { groupBy: 'day', dateFrom: '2026-02-30', dateTo: '2026-03-01' },
    { groupBy: 'month', dateFrom: '2026-03-01', dateTo: '2026-02-01' },
    { groupBy: 'year', dateFrom: '', dateTo: '2026-02-01' },
  ]) {
    await assert.rejects(getVehicleConsumption({ query: () => assert.fail('Invalid query reached database') }, query), { statusCode: 400 });
  }
});

test('includes zero-consumption days and handles leap days and year boundaries', () => {
  assert.deepEqual(parseVehicleConsumptionQuery({ groupBy: 'day', dateFrom: '2024-02-28', dateTo: '2024-03-01' }).periods,
    ['2024-02-28', '2024-02-29', '2024-03-01']);
  assert.deepEqual(parseVehicleConsumptionQuery({ groupBy: 'month', dateFrom: '2025-12-31', dateTo: '2026-02-01' }).periods,
    ['2025-12', '2026-01', '2026-02']);
  assert.deepEqual(parseVehicleConsumptionQuery({ groupBy: 'year', dateFrom: '2024-10-01', dateTo: '2026-01-01' }).periods,
    ['2024', '2025', '2026']);
});

test('total and vehicle comparison reconcile across periods without merging vehicles with identical names', async () => {
  const result = await getVehicleConsumption({ query: async (sql, params) => {
    assert.deepEqual(params, ['2026-01-01', '2026-03-31']);
    assert.match(sql, /DATE_FORMAT\(bv.date_creation, '%Y-%m'\)/);
    assert.match(sql, /DATE_ADD\(\?, INTERVAL 1 DAY\)/);
    assert.match(sql, /NOT IN \('Annulé'.*'Brouillon'/);
    assert.doesNotMatch(sql, /JOIN vehicule_items/);
    return [[
      { period: '2026-01', vehicule_id: 1, vehicule_nom: 'Camion', amount: '120.50', count: 2 },
      { period: '2026-01', vehicule_id: 2, vehicule_nom: 'Camion', amount: '80.25', count: 1 },
      { period: '2026-03', vehicule_id: 1, vehicule_nom: 'Camion', amount: '50.00', count: 1 },
      { period: '2026-03', vehicule_id: null, amount: '10.00', count: 1 },
    ]];
  } }, { groupBy: 'month', dateFrom: '2026-01-01', dateTo: '2026-03-31' });
  assert.equal(result.total, 260.75);
  assert.equal(result.count, 5);
  assert.deepEqual(result.periods.map(row => row.amount), [200.75, 0, 60]);
  assert.deepEqual(result.vehicles.map(row => [row.vehicule_id, row.amount]), [[1, 170.5], [2, 80.25], [null, 10]]);
  assert.equal(result.vehicles[2].name, 'Non affecté');
  assert.equal(result.total, result.vehicles.reduce((sum, row) => sum + row.amount, 0));
});

test('empty periods keep their zero values and overly dense daily charts are rejected', async () => {
  const result = await getVehicleConsumption({ query: async () => [[]] }, {
    groupBy: 'day', dateFrom: '2026-11-01', dateTo: '2026-11-03',
  });
  assert.equal(result.count, 0);
  assert.equal(result.periods.length, 3);
  assert.deepEqual(result.vehicles, []);
  assert.throws(() => parseVehicleConsumptionQuery({ groupBy: 'day', dateFrom: '2000-01-01', dateTo: '2026-01-01' }), { statusCode: 400 });
});
