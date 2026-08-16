import assert from 'node:assert/strict';
import test from 'node:test';
import { getVerifiedMaalemStatistics } from './maalemStatistics.js';

test('calcule uniquement les clôtures transactionnelles du Maalem exécutant', async () => {
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('MAX(si.closed_at)')) {
        return [[{ closed_interventions: '2', last_closed_intervention_at: '2026-08-12 10:00:00' }]];
      }
      if (sql.includes('INNER JOIN services')) {
        return [[{ id: '8', service_name: 'Plomberie', closed_interventions: '2' }]];
      }
      return [[{ id: '4', category_name: 'Plombier', closed_interventions: '2' }]];
    },
  };

  const stats = await getVerifiedMaalemStatistics(db, 7);
  assert.equal(stats.closed_interventions, 2);
  assert.deepEqual(stats.by_service, [{ id: 8, name: 'Plomberie', closed_interventions: 2 }]);
  assert.deepEqual(stats.by_category, [{ id: 4, name: 'Plombier', closed_interventions: 2 }]);
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.deepEqual(call.params, [7]);
    assert.match(call.sql, /si\.status = 'closed'/);
    assert.match(call.sql, /sr\.status = 'closed'/);
    assert.match(call.sql, /sr\.deleted_at IS NULL/);
    assert.match(call.sql, /sra\.id = si\.executing_assignment_id/);
    assert.doesNotMatch(call.sql, /requested_maalem/);
  }
});

test('retourne un résultat vide stable et ne fabrique aucune note', async () => {
  const db = { query: async (sql) => sql.includes('MAX(si.closed_at)')
    ? [[{ closed_interventions: 0, last_closed_intervention_at: null }]] : [[]] };
  const stats = await getVerifiedMaalemStatistics(db, 12);
  assert.deepEqual(stats, {
    closed_interventions: 0,
    last_closed_intervention_at: null,
    by_service: [],
    by_category: [],
  });
  assert.equal(Object.hasOwn(stats, 'average_rating'), false);
  assert.equal(Object.hasOwn(stats, 'reviews'), false);
});

test('refuse un identifiant Maalem invalide', async () => {
  await assert.rejects(() => getVerifiedMaalemStatistics({ query() {} }, 0), TypeError);
});
