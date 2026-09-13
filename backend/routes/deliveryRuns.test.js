import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import mysql from 'mysql2/promise';
import express from 'express';
import pool from '../db/pool.js';
import { createDeliveryRouter } from './deliveryRuns.js';
import { parseDeliveryBons, parseDeliveryResults } from '../utils/deliveryRuns.js';

test('delivery selection validates, deduplicates and sorts typed bon identities', () => {
  assert.deepEqual(parseDeliveryBons([{ bon_type: 'Sortie', bon_id: 2 }, { bon_type: 'Sortie', bon_id: 2 }, { bon_type: 'Comptant', bon_id: 2 }]),
    [{ bon_type: 'Comptant', bon_id: 2 }, { bon_type: 'Sortie', bon_id: 2 }]);
  for (const value of [[], null, [{ bon_type: '__proto__', bon_id: 1 }], [{ bon_type: 'Sortie', bon_id: -1 }]]) {
    assert.throws(() => parseDeliveryBons(value));
  }
});
test('each departure bon must have exactly one return result and failure reason', () => {
  assert.equal(parseDeliveryResults([{ queue_id: 3, outcome: 'failed', failure_reason: 'Client absent' }], [3])[0].failure_reason, 'Client absent');
  for (const value of [[], [{ queue_id: 9, outcome: 'delivered' }], [{ queue_id: 3, outcome: 'failed' }], [{ queue_id: 3, outcome: 'unknown' }]]) {
    assert.throws(() => parseDeliveryResults(value, [3]));
  }
  assert.throws(() => parseDeliveryResults([{ queue_id: 3, outcome: 'delivered' }, { queue_id: 3, outcome: 'delivered' }], [3, 4]));
});

test('MySQL delivery workflow, permissions, race protection and statistics', { skip: process.env.DELIVERY_TEST_MYSQL !== '1' }, async t => {
  // All fixtures and mutations live in a newly created, uniquely named schema.
  const name = `delivery_runs_test_${randomBytes(10).toString('hex')}`;
  const source = pool.pool.config.connectionConfig;
  const config = { host: source.host, port: source.port, user: source.user, password: source.password };
  const admin = await mysql.createConnection(config);
  let created = false;
  let db;
  let server;
  try {
    await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4`);
    created = true;
    db = mysql.createPool({ ...config, database: name, connectionLimit: 8 });
    await db.query('CREATE TABLE employees (id INT PRIMARY KEY, role VARCHAR(50), nom_complet VARCHAR(255), deleted_at DATETIME NULL) ENGINE=InnoDB');
    await db.query("INSERT INTO employees VALUES (1, 'PDG', 'Direction', NULL), (2, 'Employé', 'Dispatch', NULL), (3, 'Chauffeur', 'Chauffeur A', NULL), (4, 'Chauffeur', 'Chauffeur B', NULL), (5, 'Employé', 'Sans accès', NULL)");
    await db.query('CREATE TABLE vehicules (id INT PRIMARY KEY, nom VARCHAR(255), deleted_at DATETIME NULL) ENGINE=InnoDB');
    await db.query("INSERT INTO vehicules VALUES (1, 'Camion A', NULL), (2, 'Camion B', NULL)");
    await db.query('CREATE TABLE contacts (id INT PRIMARY KEY, nom_complet VARCHAR(255)) ENGINE=InnoDB');
    await db.query("INSERT INTO contacts VALUES (1, 'Client Exemple')");
    for (const table of ['bons_sortie', 'bons_comptant']) {
      await db.query(`CREATE TABLE ${table} (id INT PRIMARY KEY, numero VARCHAR(100), client_id INT, statut VARCHAR(50), livre TINYINT DEFAULT 0, is_deleted TINYINT DEFAULT 0) ENGINE=InnoDB`);
      await db.query(`INSERT INTO ${table} (id, numero, client_id, statut) VALUES (1, NULL, 1, 'Validé'), (2, NULL, 1, 'Validé'), (3, NULL, 1, 'Annulé'), (4, NULL, 1, 'Validé'), (5, NULL, 1, 'Validé')`);
    }
    const app = express();
    app.use(express.json());
    app.use('/api/delivery-runs', createDeliveryRouter(db, (req, _res, next) => {
      req.user = { id: Number(req.headers['x-test-user'] || 1), role: 'Employé' };
      next();
    }));
    app.use((error, _req, res, _next) => res.status(500).json({ message: error.message, code: error.code }));
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const base = `http://127.0.0.1:${server.address().port}/api/delivery-runs`;
    const request = async (path, method = 'GET', body, user = 1) => {
      const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', 'x-test-user': String(user) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json() };
    };
    const bon = (id, type = 'Sortie') => ({ bon_type: type, bon_id: id });
    const start = (bons, driver = 3, vehicle = 1) => request('/runs', 'POST', { bons, chauffeur_id: driver, vehicule_id: vehicle, notes: 'Test' }, 2);

    await t.test('PDG grants access, regular employees cannot grant it, revocation is immediate', async () => {
      assert.equal((await request('/access', 'GET', undefined, 5)).body.allowed, false);
      assert.equal((await request('/queue', 'GET', undefined, 5)).status, 403);
      assert.equal((await request('/permissions/2', 'PUT', { allowed: true })).status, 200);
      assert.equal((await request('/access', 'GET', undefined, 2)).body.allowed, true);
      assert.equal((await request('/permissions/5', 'PUT', { allowed: true }, 2)).status, 403);
      assert.equal((await request('/permissions/2', 'PUT', { allowed: false })).status, 200);
      assert.equal((await request('/queue', 'GET', undefined, 2)).status, 403);
      await request('/permissions/2', 'PUT', { allowed: true });
    });
    await t.test('search recognizes type prefixes and filters cancelled bons', async () => {
      const result = await request('/bons?q=SOR01%20Client&type=Sortie', 'GET', undefined, 2);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.deepEqual(result.body.items.map(b => b.bon_id), [1]);
      assert.equal((await request('/queue', 'POST', { bons: [bon(3)] }, 2)).status, 409);
      assert.equal((await request('/queue', 'POST', { bons: [bon(999)] }, 2)).status, 409);
    });
    let runId;
    let queue;
    await t.test('queue is idempotent and multi-type runs start atomically with resources', async () => {
      for (let i = 0; i < 2; i++) assert.equal((await request('/queue', 'POST', { bons: [bon(1)] }, 2)).status, 201);
      assert.equal((await request('/queue')).body.length, 1);
      assert.equal((await start([bon(1)], 5)).status, 400);
      const result = await start([bon(1), bon(1, 'Comptant')]);
      assert.equal(result.status, 201, JSON.stringify(result.body));
      runId = result.body.id;
      queue = (await request('/queue')).body;
      assert.equal(queue.length, 2);
      assert.ok(queue.every(q => q.status === 'in_progress'));
      assert.equal((await start([bon(2)])).status, 409);
      assert.equal((await start([bon(1)], 4, 2)).status, 409);
      const resources = (await request('/resources')).body;
      assert.equal(Number(resources.drivers.find(d => d.id === 3).busy), 1);
      const history = (await request('/runs')).body;
      assert.equal(history.items[0].items.length, 2);
      assert.ok(history.items[0].started_at);
      assert.equal(history.items[0].ended_at, null);
    });
    await t.test('return requires all results; failed bon is requeued, delivered bon is synchronized', async () => {
      assert.equal((await request(`/runs/${runId}/finish`, 'POST', { results: [] }, 2)).status, 400);
      const results = queue.map(q => ({ queue_id: q.id, outcome: q.bon_type === 'Sortie' ? 'delivered' : 'failed', failure_reason: 'Client absent' }));
      assert.equal((await request(`/runs/${runId}/finish`, 'POST', { results }, 2)).status, 200);
      assert.equal((await request(`/runs/${runId}/finish`, 'POST', { results }, 2)).status, 409);
      const waiting = (await request('/queue')).body;
      assert.equal(waiting.length, 1);
      assert.equal(waiting[0].status, 'waiting');
      assert.equal((await request(`/queue/${waiting[0].id}`, 'DELETE', undefined, 2)).status, 409);
      const [[sourceBon]] = await db.query('SELECT livre FROM bons_sortie WHERE id = 1');
      assert.equal(sourceBon.livre, 1);
      const stats = await request('/stats');
      assert.equal(stats.status, 200, JSON.stringify(stats.body));
      assert.equal(Number(stats.body.summary.runs), 1);
      assert.equal(Number(stats.body.summary.delivered), 1);
      assert.equal(Number(stats.body.summary.failed), 1);
      assert.equal(stats.body.reasons[0].reason, 'Client absent');
      assert.equal(stats.body.daily.length, 1);
      assert.equal(Number(stats.body.drivers[0].bons), 2);
      assert.equal(Number(stats.body.vehicles[0].completed), 1);
      assert.equal(Number((await request('/stats?chauffeur_id=4')).body.summary.runs), 0);
      assert.equal((await request('/stats?from=bad')).status, 400);
    });
    await t.test('retry preserves historical attempts', async () => {
      const retry = await start([bon(1, 'Comptant')]);
      assert.equal(retry.status, 201, JSON.stringify(retry.body));
      const waiting = (await request('/queue')).body;
      const result = await request(`/runs/${retry.body.id}/finish`, 'POST', { results: [{ queue_id: waiting[0].id, outcome: 'delivered' }] }, 2);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(Number((await request('/stats')).body.summary.runs), 2);
      assert.equal(Number((await request('/stats')).body.summary.failed), 1);
    });
    await t.test('concurrent departure requests cannot allocate the same bon twice', async () => {
      const results = await Promise.all([start([bon(4)], 3, 1), start([bon(4)], 4, 2)]);
      assert.deepEqual(results.map(r => r.status).sort(), [201, 409], JSON.stringify(results));
      const [[count]] = await db.query("SELECT COUNT(*) AS n FROM delivery_queue WHERE bon_type = 'Sortie' AND bon_id = 4 AND status = 'in_progress'");
      assert.equal(Number(count.n), 1);
    });
    await t.test('a run can start without a driver while the vehicle stays exclusive', async () => {
      // A dedicated vehicle keeps this case independent from the concurrency test above.
      await db.query("INSERT INTO vehicules VALUES (3, 'Camion C', NULL)");
      for (const missing of [null, undefined, '']) {
        const departure = await request('/runs', 'POST', { bons: [bon(5)], chauffeur_id: missing, vehicule_id: 3, notes: '' }, 2);
        if (missing === null) {
          assert.equal(departure.status, 201, JSON.stringify(departure.body));
          const [[run]] = await db.query('SELECT chauffeur_id, chauffeur_nom, vehicule_nom FROM delivery_runs WHERE id = ?', [departure.body.id]);
          assert.equal(run.chauffeur_id, null);
          assert.equal(run.chauffeur_nom, null);
          assert.equal(run.vehicule_nom, 'Camion C');
        } else {
          // The vehicle is now busy, so the driverless path must still enforce exclusivity.
          assert.equal(departure.status, 409, JSON.stringify(departure.body));
          assert.equal(departure.body.message, 'Le véhicule est déjà en livraison.');
        }
      }
      const unassigned = (await request('/stats')).body.drivers.find(d => d.id === null);
      assert.equal(unassigned.name, 'Sans chauffeur');
      assert.equal(Number(unassigned.runs), 1);
      // An explicitly provided driver is still validated.
      assert.equal((await request('/runs', 'POST', { bons: [bon(2, 'Comptant')], chauffeur_id: 5, vehicule_id: 2, notes: '' }, 2)).status, 400);
    });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (db) await db.end();
    // Only the exact random schema successfully created by this test is removed.
    if (created && /^delivery_runs_test_[0-9a-f]{20}$/.test(name)) await admin.query(`DROP DATABASE \`${name}\``);
    await admin.end();
  }
});
