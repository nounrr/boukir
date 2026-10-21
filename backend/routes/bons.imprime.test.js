import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pool from '../db/pool.js';
import router from './bons.js';

test('print tracking persists both states and validates requests without changing payment or delivery', async (t) => {
  const originalQuery = pool.query;
  const rows = new Map([[7, { id: 7, imprime: 0 }]]);
  const writes = [];
  pool.query = async (sql, params) => {
    if (sql.startsWith('UPDATE bons_comptant SET imprime')) {
      writes.push({ sql, params });
      const row = rows.get(params[1]);
      if (row) row.imprime = params[0];
      return [{ affectedRows: row ? 1 : 0 }];
    }
    if (sql.startsWith('SELECT id, imprime FROM bons_comptant')) {
      return [rows.has(params[0]) ? [{ ...rows.get(params[0]) }] : []];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const app = express();
  app.use(express.json(), router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    pool.query = originalQuery;
    await new Promise(resolve => server.close(resolve));
    await pool.end();
  });
  const request = (id, body) => fetch(`http://127.0.0.1:${server.address().port}/Comptant/${id}/imprime`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  for (const imprime of [true, false]) {
    const response = await request(7, { imprime });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id: 7, imprime });
    assert.equal(rows.get(7).imprime, imprime ? 1 : 0);
  }
  assert.equal(writes.length, 2);
  assert.ok(writes.every(({ sql }) => sql === 'UPDATE bons_comptant SET imprime = ? WHERE id = ?'));
  for (const body of [{}, { imprime: 'true' }, { imprime: 1 }, { imprime: null }]) {
    assert.equal((await request(7, body)).status, 400);
  }
  for (const id of ['0', '-1', '7oops', '9007199254740992']) {
    assert.equal((await request(id, { imprime: true })).status, 400);
  }
  assert.equal(writes.length, 2, 'invalid requests do not write');
  assert.equal((await request(999, { imprime: true })).status, 404);
  pool.query = async () => { throw new Error('database unavailable'); };
  const previousError = console.error;
  console.error = () => {};
  try { assert.equal((await request(7, { imprime: true })).status, 500); }
  finally { console.error = previousError; }
});
