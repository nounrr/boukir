import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pool from '../db/pool.js';
import router from './contacts.js';

test('a client editor can create, update and clear plafond échéance without changing the credit plafond', async t => {
  const originalExecute = pool.execute;
  const originalQuery = pool.query;
  const writes = [];
  let amount = null;
  let reference = null;
  pool.execute = async (sql, params = []) => {
    if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) return [[{ cnt: 0 }]];
    if (sql.startsWith('SELECT id FROM contacts')) return [[{ id: 7 }]];
    if (sql.includes('INSERT INTO contacts')) {
      assert.equal((sql.match(/\?/g) || []).length, params.length, 'each inserted value has its SQL placeholder');
      amount = params[34];
      writes.push(sql);
      return [{ insertId: 7 }];
    }
    if (sql.startsWith('UPDATE contacts SET')) {
      writes.push(sql);
      if (sql.startsWith('UPDATE contacts SET plafond_echeance_reference = ?')) reference = params[0];
      else if (sql.includes('plafond_echeance = ?')) { amount = params[0]; reference = null; }
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM contacts')) return [[{ id: 7, type: 'Client', plafond: 999, plafond_echeance: amount, plafond_echeance_reference: reference, total_cumule: 10000, cheques_echeanciers: '400.00' }]];
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  pool.query = pool.execute;
  const app = express();
  app.use(express.json(), (req, res, next) => { req.user = { id: 5, role: 'Manager' }; next(); }, router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { pool.execute = originalExecute; pool.query = originalQuery; await new Promise(resolve => server.close(resolve)); await pool.end(); });
  const request = (path, method, body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const created = await request('/', 'POST', { type: 'Client', nom_complet: 'Client test', plafond_echeance: 12000 });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).plafond_echeance, 12000);
  for (const value of [25000, 0, null]) {
    const response = await request('/7', 'PUT', { plafond_echeance: value });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.plafond_echeance, value === 0 ? 10400 : value);
    assert.equal(body.plafond, 999);
    assert.equal(body.cheques_echeanciers, 400);
  }
  const automatic = await request('/', 'POST', { type: 'Client', nom_complet: 'Client automatique', plafond_echeance: 0 });
  assert.equal(automatic.status, 201);
  assert.equal((await automatic.json()).plafond_echeance, 10400);
  const count = writes.length;
  for (const value of [-1, 'abc', true, []]) {
    assert.equal((await request('/7', 'PUT', { plafond_echeance: value })).status, 400);
    assert.equal((await request('/', 'POST', { type: 'Client', nom_complet: 'Client', plafond_echeance: value })).status, 400);
  }
  assert.equal(writes.length, count, 'invalid ceilings cause no database writes');
  assert.ok(writes.slice(1).every(sql => !sql.includes('plafond = ?')));
});
