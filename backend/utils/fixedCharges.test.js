import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateFixedCharges, fixedChargeRange, getFixedChargeDays, parseFixedCharge } from './fixedCharges.js';

const charge = { id: 1, libelle: 'Loyer', montant_mensuel: 1000, date_debut: null, date_fin: null, creation_date: '2026-01-01' };
const sumUnits = rows => rows.reduce((sum, row) => sum + Math.round(row.total * 1000), 0);

test('both dates are optional independently, and invalid amounts/ranges are rejected', () => {
  for (const dates of [{}, { date_debut: '2026-01-01' }, { date_fin: '2026-03-31' }, { date_debut: '', date_fin: '' }]) {
    assert.equal(parseFixedCharge({ libelle: ' Loyer ', montant_mensuel: '1000,125', ...dates }).montant_mensuel, 1000.125);
  }
  for (const invalid of [
    { montant_mensuel: -1 }, { montant_mensuel: 0 }, { montant_mensuel: 1.0001 }, { montant_mensuel: Infinity },
    { date_debut: '2026-02-30' }, { date_debut: '2026-04-01', date_fin: '2026-03-31' }, { libelle: '' },
  ]) assert.throws(() => parseFixedCharge({ ...charge, ...invalid }), { statusCode: 400 });
});

test('daily allocation reconciles exactly to monthly amount for 28, 29, 30 and 31 day months', () => {
  for (const [start, end, days] of [
    ['2026-02-01', '2026-02-28', 28], ['2024-02-01', '2024-02-29', 29],
    ['2026-04-01', '2026-04-30', 30], ['2026-01-01', '2026-01-31', 31],
  ]) {
    const rows = allocateFixedCharges([charge], start, end);
    assert.equal(rows.length, days);
    assert.equal(sumUnits(rows), 1000000);
    for (const row of rows) assert.equal(allocateFixedCharges([charge], row.day, row.day)[0].total, row.total);
  }
});

test('inclusive date bounds prorate partial months without reassigning rounding remainders', () => {
  const rows = allocateFixedCharges([{ ...charge, montant_mensuel: 3000, date_debut: '2026-04-11', date_fin: '2026-04-20' }], '2026-04-01', '2026-04-30', true);
  assert.equal(rows.length, 10);
  assert.equal(sumUnits(rows), 1000000);
  assert.equal(rows[0].items[0].amount, 100);
  assert.equal(rows[0].items[0].daysInMonth, 30);
  assert.deepEqual(allocateFixedCharges([{ ...charge, date_fin: '2025-12-31' }], '2026-01-01', '2026-01-31'), []);
  assert.equal(sumUnits(allocateFixedCharges([{ ...charge, montant_mensuel: 0.001 }], '2026-01-01', '2026-01-31')), 1);
});

test('unbounded charges use the report range and all-history has a finite horizon', () => {
  assert.deepEqual(fixedChargeRange({ filterType: 'month', month: '2024-02' }, [charge]), { start: '2024-02-01', end: '2024-02-29' });
  assert.deepEqual(fixedChargeRange({ filterType: 'all' }, [charge], ['2025-12-12'], '2026-11-03'), { start: '2025-12-12', end: '2026-11-03' });
});

test('deleted charges are excluded and older installations can omit the table', async () => {
  await getFixedChargeDays({ query: async sql => { assert.match(sql, /deleted_at IS NULL/); return [[]]; } }, { filterType: 'all' });
  assert.deepEqual(await getFixedChargeDays({ query: async () => { throw Object.assign(new Error(), { code: 'ER_NO_SUCH_TABLE' }); } }, { filterType: 'all' }), []);
});

test('overview, daily detail and net-profit calculations include each fixed charge once', async () => {
  const { default: pool } = await import('../db/pool.js');
  const { default: router } = await import('../routes/stats.js');
  const originalQuery = pool.query;
  const originalExecute = pool.execute;
  pool.query = async sql => [String(sql).includes('FROM charges_fixes') ? [{ ...charge, montant_mensuel: 3000 }] : []];
  pool.execute = async () => [[]];
  const invoke = async (path, query = {}, params = {}) => {
    const handler = router.stack.find(layer => layer.route?.path === path && layer.route.methods.get).route.stack[0].handle;
    let response;
    const res = { status: status => { assert.equal(status, 200); return res; }, json: body => { response = body; } };
    await handler({ query, params }, res);
    return response;
  };
  try {
    const monthly = await invoke('/chiffre-affaires', { filterType: 'month', month: '2026-04' });
    assert.equal(monthly.totalChargesFixes, 3000);
    assert.equal(monthly.totalCharges, 3000);
    assert.equal(monthly.totalChiffreAffairesSansCharges, 0);
    assert.equal(monthly.totalChiffreAffaires, -3000);
    assert.equal(monthly.totalChiffreAffairesAchat, -3000);
    assert.equal(monthly.dailyData.length, 30);
    const daily = await invoke('/chiffre-affaires', { filterType: 'day', date: '2026-04-15' });
    const detail = await invoke('/chiffre-affaires/detail/:date', {}, { date: '2026-04-15' });
    assert.equal(daily.totalChargesFixes, 100);
    assert.equal(detail.find(section => section.type === 'CA_NET').total, daily.totalChiffreAffaires);
    assert.equal(detail.find(section => section.type === 'BENEFICIAIRE').total, daily.totalChiffreAffairesAchat);
    assert.equal(detail.find(section => section.type === 'CHARGES').total, daily.totalCharges);
    assert.equal(detail.find(section => section.type === 'CHARGES').calculs[0].bonType, 'Charge fixe');
  } finally {
    pool.query = originalQuery;
    pool.execute = originalExecute;
    await pool.end();
  }
});
