import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import pool from '../db/pool.js';
import ecommerceClientsRouter from './ecommerceClients.js';
import notificationsRouter from './notifications.js';

test('ecommerce accounts are scoped, paginated, and requests require PDG confirmation', async t => {
  let contact;
  let writes = 0;
  let rollbacks = 0;
  let commits = 0;
  let listQueries = [];
  t.mock.method(pool, 'query', async (sql, params = []) => {
    listQueries.push({ sql, params });
    assert.match(sql, /source = 'ecommerce'/);
    assert.match(sql, /type = 'Client'/);
    assert.match(sql, /deleted_at IS NULL AND archived_at IS NULL/);
    if (sql.includes('AS all_count')) return [[{ all_count: 3, artisan: 1, promoteur: 1 }]];
    if (sql.includes('AS total')) return [[{ total: 1 }]];
    assert.doesNotMatch(sql, /SELECT\s+\*|password|access_token|refresh_token/);
    return [[{ id: 17, nom_complet: 'Client web', type_compte: 'Client', type_compte_demande: 'Promoteur', remise_balance: '12.50' }]];
  });
  t.mock.method(pool, 'getConnection', async () => ({
    async beginTransaction() {},
    async commit() { commits++; },
    async rollback() { rollbacks++; },
    release() {},
    async query(sql, params) {
      if (sql.includes('SELECT')) {
        assert.match(sql, /FOR UPDATE/);
        assert.match(sql, /archived_at IS NULL/);
        return [contact ? [{ ...contact }] : []];
      }
      writes++;
      if (sql.includes('SET artisan_approuve = TRUE')) {
        assert.match(sql, /artisan_approuve_par = \?/);
        assert.match(sql, /type_compte_demande = NULL/);
        assert.equal(params[0], 9);
        contact.type_compte = params[2];
        contact.artisan_approuve = 1;
        contact.demande_artisan = 0;
        contact.type_compte_demande = null;
      } else {
        assert.match(sql, /SET demande_artisan = FALSE/);
        assert.match(sql, /type_compte_demande = NULL/);
        contact.demande_artisan = 0;
        contact.type_compte_demande = null;
      }
      return [{ affectedRows: 1 }];
    },
  }));
  const app = express();
  app.use(express.json(), (req, _res, next) => {
    req.user = { id: 9, role: req.headers['x-role'] || 'PDG' };
    next();
  });
  app.use('/clients', ecommerceClientsRouter);
  app.use('/notifications', notificationsRouter);
  app.use((err, _req, res, _next) => res.status(500).json({ message: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await pool.end(); });
  const request = (path, { role = 'PDG', method = 'GET' } = {}) => fetch(
    `http://127.0.0.1:${server.address().port}${path}`,
    { method, headers: { 'x-role': role, 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify({ note: 'Vérifié' }) : undefined }
  );
  const resetContact = target => { contact = { id: 17, nom_complet: 'Client web', type_compte: 'Client', demande_artisan: 1, artisan_approuve: 0, type_compte_demande: target }; };
  const approve = () => request('/notifications/artisan-requests/17/approve', { method: 'POST' });
  const reject = () => request('/notifications/artisan-requests/17/reject', { method: 'POST' });

  for (const path of ['/clients', '/notifications/count', '/notifications/artisan-requests']) {
    assert.equal((await request(path, { role: 'Manager' })).status, 403);
  }
  for (const action of ['approve', 'reject']) {
    assert.equal((await request(`/notifications/artisan-requests/17/${action}`, { role: 'Employé', method: 'POST' })).status, 403);
  }
  assert.equal(listQueries.length, 0);
  assert.equal(writes, 0);

  let response = await request('/clients?tab=promoteur&search=test%40example.com&page=2&limit=10');
  assert.equal(response.status, 200);
  let data = await response.json();
  assert.equal(data.data[0].remise_balance, 12.5);
  assert.deepEqual(data.counts, { all: 3, artisan: 1, promoteur: 1 });
  assert.equal(data.pagination.page, 2);
  const query = listQueries.at(-1);
  assert.match(query.sql, /= 'Promoteur'/);
  assert.match(query.sql, /demande_artisan = 1/);
  assert.match(query.sql, /email LIKE \?/);
  assert.deepEqual(query.params, [...Array(5).fill('%test@example.com%'), 10, 10]);
  listQueries = [];
  assert.equal((await request('/clients?tab=artisan')).status, 200);
  assert.match(listQueries.at(-1).sql, /IN \('Artisan', 'Artisan\/Promoteur'\)/);
  listQueries = [];
  assert.equal((await request('/clients')).status, 200);
  assert.doesNotMatch(listQueries.at(-1).sql, /demande_artisan = 1/);
  assert.equal((await request('/clients?tab=invalid')).status, 400);

  for (const target of ['Artisan', 'Promoteur', null]) {
    resetContact(target);
    response = await approve();
    assert.equal(response.status, 200, JSON.stringify(await response.json()));
    assert.equal(contact.type_compte, target || 'Artisan');
    const previousWrites = writes;
    assert.equal((await approve()).status, 400);
    assert.equal((await reject()).status, 400);
    assert.equal(writes, previousWrites, 'processed requests cannot be approved or rejected again');
  }
  resetContact('Promoteur');
  assert.equal((await reject()).status, 200);
  assert.equal(contact.type_compte, 'Client', 'rejection retains client privileges');
  assert.equal(contact.type_compte_demande, null);
  resetContact('PDG');
  assert.equal((await approve()).status, 400);
  assert.equal(contact.type_compte, 'Client');
  contact = null;
  assert.equal((await approve()).status, 404);
  assert.equal((await reject()).status, 404);
  assert.equal(commits, 4);
  assert.equal(rollbacks, 9, 'all early transaction exits roll back');
});
