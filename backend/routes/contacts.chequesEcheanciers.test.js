import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pool from '../db/pool.js';
import router from './contacts.js';

test('future client cheques endpoint scopes requests, returns monetary totals and validates clients', async t => {
  const originalExecute = pool.execute;
  const calls = [];
  pool.execute = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT id FROM contacts')) {
      assert.match(sql, /type = 'Client' AND deleted_at IS NULL/);
      return [params[0] === 7 ? [{ id: 7 }] : []];
    }
    assert.match(sql, /p.contact_id = \?/);
    assert.match(sql, /p.mode_paiement = 'Chèque'/);
    assert.match(sql, /ORDER BY p.date_echeance ASC, p.id ASC/);
    assert.deepEqual(params, [7]);
    return [[{ id: 1, montant_total: '125.50', date_echeance: '2099-01-01' }, { id: 2, montant_total: '250.25', date_echeance: '2099-01-02' }]];
  };
  const app = express(); app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { pool.execute = originalExecute; await new Promise(resolve => server.close(resolve)); await pool.end(); });
  const get = id => fetch(`http://127.0.0.1:${server.address().port}/${id}/cheques-echeanciers`);
  const response = await get(7);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.total, 375.75);
  assert.equal(result.cheques[0].montant_total, 125.5);
  assert.match(result.from_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(calls.length, 2);
  for (const id of ['0', '-1', '7abc', '9007199254740992']) assert.equal((await get(id)).status, 400);
  assert.equal(calls.length, 2, 'invalid identifiers do not query the database');
  assert.equal((await get(99)).status, 404);
  assert.equal(calls.length, 3, 'unknown contacts do not query cheques');
});
