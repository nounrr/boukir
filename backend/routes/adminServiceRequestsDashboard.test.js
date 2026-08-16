import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pool from '../db/pool.js';
import router from './adminServiceRequests.js';

async function withServer(user, query, callback) {
  const originalQuery = pool.query;
  const calls = [];
  pool.query = async (sql, params = []) => { calls.push({ sql, params }); return query(sql, params); };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use('/api/admin/service-requests', router);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { await callback(`http://127.0.0.1:${server.address().port}`, calls); }
  finally { await new Promise((resolve) => server.close(resolve)); pool.query = originalQuery; }
}

test('le dashboard compte en une seule agrégation sans N+1', async () => {
  await withServer({ id: 3, role: 'Manager' }, async (sql) => {
    assert.match(sql, /COUNT\(\*\) AS total/);
    return [[{ new_requests: '4', confirmed_without_maalem: 2, scheduled_today: 3, overdue: 1 }]];
  }, async (url, calls) => {
    const response = await fetch(`${url}/api/admin/service-requests/dashboard`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.metrics.new_requests, 4);
    assert.equal(body.metrics.confirmed_without_maalem, 2);
    assert.equal(body.metrics.scheduled_today, 3);
    assert.equal(calls.length, 1);
  });
});

test('la liste combine recherche, filtres et pagination en exactement deux requêtes', async () => {
  await withServer({ id: 3, role: 'ManagerPlus' }, async (sql) => {
    if (sql.includes('COUNT(*) AS total')) return [[{ total: 26 }]];
    return [[{ id: 51, request_number: 'SRV-51', requester_contact_id: 501,
      status: 'processing', request_source: 'quick_request', priority: 'normal',
      current_assignment_id: null, is_overdue: 1 }]];
  }, async (url, calls) => {
    const response = await fetch(`${url}/api/admin/service-requests?q=amine&status=processing&city=Rabat&page=2&limit=10`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.page, 2);
    assert.equal(body.limit, 10);
    assert.equal(body.total, 26);
    assert.equal(body.requests[0].is_overdue, true);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.params.includes('%amine%') && call.params.includes('processing') && call.params.includes('Rabat')));
  });
});

test('un utilisateur non Back-office est refusé avant toute requête', async () => {
  await withServer({ id: 501, type_compte: 'Client' }, async () => { throw new Error('DB interdite'); }, async (url, calls) => {
    const response = await fetch(`${url}/api/admin/service-requests/dashboard`);
    assert.equal(response.status, 403);
    assert.equal(calls.length, 0);
  });
});

