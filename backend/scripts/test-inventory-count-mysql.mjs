// Integration check on one MySQL connection. All writes use temporary tables;
// the catalogue and real counting tables remain untouched.
import assert from 'node:assert/strict';
import express from 'express';
import pool from '../db/pool.js';
import { createInventoryCountRouters } from '../routes/inventoryCounting.js';

const connection = await pool.getConnection();
let server;
try {
  const query = (sql, params) => connection.query(sql.replace(/^CREATE TABLE IF NOT EXISTS/, 'CREATE TEMPORARY TABLE IF NOT EXISTS'), params);
  const db = { query, getConnection: async () => ({
    query, beginTransaction: () => connection.beginTransaction(), commit: () => connection.commit(),
    rollback: () => connection.rollback(), release() {},
  }) };
  const routers = createInventoryCountRouters(db);
  const app = express();
  app.use(express.json());
  app.use('/public', routers.publicRouter);
  // Authentication is tested in the unit suite; this fixture targets real SQL.
  app.use('/admin', (req, _res, next) => { req.user = { id: 1, role: 'ManagerPlus', _currentUserValidated: true }; next(); }, routers.adminRouter);
  app.use((error, _req, res, _next) => res.status(500).json({ message: error.message }));
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(path, method = 'GET', body, status = 200) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
    return result;
  }
  const created = await call('/admin/sessions', 'POST', { title: 'Temporary SQL test' }, 201);
  const id = created.session.id, token = created.url.split('/').pop(), publicPath = '/public/' + token;
  const search = await call(publicPath + '/products?q=blanc');
  assert.ok(search.pagination.total > 0);
  assert.ok(search.items.every(item => ['product', 'variant'].includes(item.kind)));
  // MySQL cannot reference one temporary table twice in UNION, so search uses
  // the real catalogue read-only before these isolated write fixtures exist.
  await connection.query(`CREATE TEMPORARY TABLE products (
    id INT PRIMARY KEY, designation VARCHAR(255), reference_2 VARCHAR(255), image_url VARCHAR(255), is_deleted TINYINT DEFAULT 0
  ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`);
  await connection.query(`CREATE TEMPORARY TABLE product_variants (
    id INT PRIMARY KEY, product_id INT, variant_name VARCHAR(255), reference VARCHAR(255), image_url VARCHAR(255), is_deleted TINYINT DEFAULT 0
  ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await connection.query("INSERT INTO products VALUES (7, 'Peinture blanche', 'P7', '/p.png', 0), (8, 'Supprimé', 'P8', NULL, 1)");
  await connection.query("INSERT INTO product_variants VALUES (3, 7, 'Blanc 5 kg', 'V3', '/v.png', 0)");
  const body = { name: 'Amine Test', product_id: 7, variant_id: null, quantity: '2.5', request_key: 'sql-test-request-001' };
  const first = await call(publicPath + '/entries', 'POST', body, 201);
  const retry = await call(publicPath + '/entries', 'POST', body);
  assert.equal(retry.id, first.id);
  await call(publicPath + '/entries', 'POST', { ...body, quantity: '1,125', request_key: 'sql-test-request-002' }, 201);
  await call(publicPath + '/entries', 'POST', { ...body, name: 'Sara Test', quantity: '3', request_key: 'sql-test-request-003' }, 201);
  await call(publicPath + '/entries', 'POST', { ...body, variant_id: 3, quantity: '0', request_key: 'sql-test-request-004' }, 201);
  await call(publicPath + '/entries', 'POST', { ...body, quantity: '9' }, 409);
  const summary = await call(`/admin/sessions/${id}/summary?q=Peinture`);
  assert.equal(summary.items.length, 2);
  assert.equal(summary.items.find(item => item.variant_id == null).quantity, 6.625);
  assert.equal(summary.items.find(item => item.variant_id == null).participants.find(person => person.name === 'Amine Test').quantity, 3.625);
  assert.equal(summary.items.find(item => item.variant_id === 3).quantity, 0);
  const history = await call(`/admin/sessions/${id}/entries?entity_key=p:7`);
  assert.equal(history.pagination.total, 3);
  const sessions = await call('/admin/sessions');
  assert.equal(sessions.sessions[0].entry_count, 4);
  assert.equal(sessions.sessions[0].participant_count, 2);
  await call(`/admin/sessions/${id}`, 'PATCH', { is_closed: true });
  await call(publicPath, 'GET', null, 410);
  await call(`/admin/sessions/${id}`, 'PATCH', { is_closed: false });
  const rotated = await call(`/admin/sessions/${id}/link`, 'POST');
  await call(publicPath, 'GET', null, 404);
  await call('/public/' + rotated.url.split('/').pop());
  console.log('PASS: temporary MySQL tables, mixed collations, search, repeated counts, retry, contributor totals, history, close/reopen and link rotation.');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  connection.release();
  await pool.end();
}
