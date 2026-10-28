import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pool from '../db/pool.js';
import router from './bons.js';
import { SAISIE_TABLES } from '../utils/bonSaisie.js';

test('saisie persists both states for every document without changing status or financial values', async t => {
  const originalQuery = pool.query;
  const saved = new Map();
  const writes = [];
  pool.query = async (sql, params) => {
    const table = sql.match(/`([^`]+)`/)[1];
    if (sql.startsWith('UPDATE')) {
      writes.push(sql);
      if (params[1] !== 7) return [{ affectedRows: 0 }];
      saved.set(table, params[0]);
      return [{ affectedRows: 1 }];
    }
    return [params[0] === 7 ? [{ id: 7, is_saisise: saved.get(table) ?? 0 }] : []];
  };
  const app = express();
  app.use(express.json(), (req, res, next) => { req.user = { role: req.headers['x-role'] || 'Manager' }; next(); }, router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { pool.query = originalQuery; await new Promise(resolve => server.close(resolve)); await pool.end(); });
  const request = (type, id, is_saisise, role = 'Manager') => fetch(`http://127.0.0.1:${server.address().port}/${type}/${id}/saisie`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-role': role }, body: JSON.stringify({ is_saisise }),
  });
  for (const type of Object.keys(SAISIE_TABLES)) {
    for (const value of [true, false]) {
      const response = await request(type, 7, value);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { id: 7, type, is_saisise: value });
    }
  }
  assert.ok(writes.every(sql => /^UPDATE `[a-z_]+` SET is_saisise = \? WHERE id = \?$/.test(sql)));
  const count = writes.length;
  for (const value of [1, 'true', null, undefined]) assert.equal((await request('Sortie', 7, value)).status, 400);
  for (const id of ['0', '-7', '7oops', '9007199254740992']) assert.equal((await request('Sortie', id, true)).status, 400);
  for (const type of ['unknown', 'constructor', '__proto__']) assert.equal((await request(type, 7, true)).status, 400);
  assert.equal((await request('Sortie', 7, true, 'ChefChauffeur')).status, 403);
  assert.equal(writes.length, count);
  assert.equal((await request('Sortie', 99, true)).status, 404);
});
