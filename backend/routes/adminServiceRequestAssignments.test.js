import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pool from '../db/pool.js';
import assignmentRouter from './adminServiceRequestAssignments.js';

function createDatabaseDouble(options = {}) {
  const state = {
    request: {
      id: 51,
      request_number: 'SRV-2026-000051',
      requester_contact_id: 501,
      title: 'Plomberie',
      status: options.requestStatus || 'confirmed',
      service_id: 8,
      qualified_service_id: null,
      qualified_category_id: 4,
      requested_maalem_profile_id: 99,
      current_assignment_id: null,
    },
    profiles: new Map([
      [7, { id: 7, contact_id: 70, category_id: 4, status: 'approved', deleted_at: null, contact_is_active: 1, contact_is_blocked: 0, contact_deleted_at: null, service_compatible: 1, nom_complet: 'Maalem A', telephone: null, locale: 'fr' }],
      [8, { id: 8, contact_id: 80, category_id: 4, status: 'approved', deleted_at: null, contact_is_active: 1, contact_is_blocked: 0, contact_deleted_at: null, service_compatible: 1, nom_complet: 'Maalem B', telephone: null, locale: 'fr' }],
      [9, { id: 9, contact_id: 90, category_id: 4, status: options.maalemStatus || 'suspended', deleted_at: null, contact_is_active: 1, contact_is_blocked: 0, contact_deleted_at: null, service_compatible: 1, nom_complet: 'Maalem refusé' }],
    ]),
    assignments: [],
    histories: [],
    nextAssignmentId: 1,
    commits: 0,
    rollbacks: 0,
    tail: Promise.resolve(),
    failHistory: Boolean(options.failHistory),
  };

  function makeConnection() {
    let releaseLock = null;
    let workingRequest = null;
    let workingAssignments = null;
    let workingHistories = null;
    async function lock() {
      let release;
      const previous = state.tail;
      state.tail = new Promise((resolve) => { release = resolve; });
      await previous;
      releaseLock = release;
      workingRequest = structuredClone(state.request);
      workingAssignments = structuredClone(state.assignments);
      workingHistories = structuredClone(state.histories);
    }
    function release() { if (releaseLock) { releaseLock(); releaseLock = null; } }
    return {
      async beginTransaction() {},
      async commit() {
        state.request = workingRequest;
        state.assignments = workingAssignments;
        state.histories = workingHistories;
        state.commits += 1;
        release();
      },
      async rollback() { state.rollbacks += 1; release(); },
      release,
      async query(sql, params = []) {
        if (sql.includes('FROM employees')) return [[{ id: Number(params[0]), nom_complet: 'Opérateur Test' }]];
        if (sql.includes('FROM service_requests') && sql.includes('FOR UPDATE')) {
          await lock();
          return [[workingRequest.id === Number(params[0]) ? structuredClone(workingRequest) : null].filter(Boolean)];
        }
        if (sql.includes('FROM service_request_assignments') && sql.includes('unassigned_at IS NULL') && sql.includes('FOR UPDATE')) {
          return [[workingAssignments.find((item) => item.service_request_id === Number(params[0]) && item.unassigned_at == null)].filter(Boolean)];
        }
        if (sql.includes('FROM maalem_profiles') && sql.includes('FOR UPDATE')) {
          const profile = state.profiles.get(Number(params[2]));
          return [[profile ? structuredClone(profile) : null].filter(Boolean)];
        }
        if (sql.includes('UPDATE service_request_assignments')) {
          const item = workingAssignments.find((assignment) => assignment.id === Number(params[3]) && assignment.unassigned_at == null);
          if (!item) return [{ affectedRows: 0 }];
          item.unassigned_at = params[0];
          item.unassigned_by_employee_id = params[1];
          item.unassignment_reason = params[2];
          return [{ affectedRows: 1 }];
        }
        if (sql.includes('INSERT INTO service_request_assignments')) {
          if (workingAssignments.some((item) => item.service_request_id === Number(params[0]) && item.unassigned_at == null)) {
            throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
          }
          const id = state.nextAssignmentId++;
          workingAssignments.push({
            id, service_request_id: Number(params[0]), maalem_profile_id: Number(params[1]),
            assigned_by_employee_id: Number(params[2]), assigned_at: params[3], assignment_reason: params[4],
            compatibility_override: Number(params[5]), compatibility_override_reason: params[6],
            unassigned_at: null, unassigned_by_employee_id: null, unassignment_reason: null,
          });
          return [{ insertId: id }];
        }
        if (sql.includes("SET current_assignment_id = ?, status = 'assigned'")) {
          workingRequest.current_assignment_id = Number(params[0]);
          workingRequest.status = 'assigned';
          return [{ affectedRows: 1 }];
        }
        if (sql.includes("SET current_assignment_id = NULL, status = 'confirmed'")) {
          workingRequest.current_assignment_id = null;
          workingRequest.status = 'confirmed';
          return [{ affectedRows: 1 }];
        }
        if (sql.includes('INSERT INTO service_request_history')) {
          if (state.failHistory) throw new Error('history failed');
          workingHistories.push({ params, event_type: params[1], actor_employee_id: params[7], actor_name: params[8], created_at: new Date() });
          return [{ insertId: workingHistories.length }];
        }
        if (sql.includes('INSERT INTO maalem_notification_deliveries')) {
          return [{ insertId: 100 + workingHistories.length, affectedRows: 1 }];
        }
        throw new Error(`Unexpected query: ${sql}`);
      },
    };
  }
  return { state, makeConnection };
}

async function withServer(database, callback, user = { id: 3, role: 'Manager' }) {
  const original = pool.getConnection;
  pool.getConnection = async () => database.makeConnection();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use('/api/admin/service-requests', assignmentRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message, errors: error.errors }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { await callback(`http://127.0.0.1:${server.address().port}`); }
  finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    pool.getConnection = original;
  }
}

function post(body) {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

test('affecte un Maalem approved compatible, conserve le Maalem souhaité et historise auteur/date', async () => {
  const database = createDatabaseDouble();
  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/service-requests/51/assign`, post({
      maalem_profile_id: 7, expected_current_assignment_id: null, reason: 'Compétence adaptée',
    }));
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.requested_maalem_profile_id, 99);
    assert.equal(body.assigned_maalem_profile_id, 7);
  });
  assert.equal(database.state.request.status, 'assigned');
  assert.equal(database.state.assignments.filter((item) => item.unassigned_at == null).length, 1);
  assert.equal(database.state.histories[0].event_type, 'MaalemAssigned');
  assert.equal(database.state.histories[0].actor_employee_id, 3);
  assert.ok(database.state.histories[0].created_at instanceof Date);
});

test('refuse un Maalem suspended et une demande non confirmée', async () => {
  const suspended = createDatabaseDouble();
  await withServer(suspended, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/service-requests/51/assign`, post({ maalem_profile_id: 9, expected_current_assignment_id: null, reason: 'Test' }));
    assert.equal(response.status, 422);
  });
  const processing = createDatabaseDouble({ requestStatus: 'processing' });
  await withServer(processing, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/service-requests/51/assign`, post({ maalem_profile_id: 7, expected_current_assignment_id: null, reason: 'Test' }));
    assert.equal(response.status, 422);
  });
});

test('réaffecte avec motif, clôture et conserve l’ancienne affectation', async () => {
  const database = createDatabaseDouble();
  await withServer(database, async (baseUrl) => {
    const first = await fetch(`${baseUrl}/api/admin/service-requests/51/assign`, post({ maalem_profile_id: 7, expected_current_assignment_id: null, reason: 'Initiale' }));
    const firstBody = await first.json();
    const second = await fetch(`${baseUrl}/api/admin/service-requests/51/assign`, post({ maalem_profile_id: 8, expected_current_assignment_id: firstBody.assignment_id, reason: 'Maalem indisponible' }));
    assert.equal(second.status, 200);
  });
  assert.equal(database.state.assignments.length, 2);
  assert.ok(database.state.assignments[0].unassigned_at);
  assert.equal(database.state.assignments[0].unassignment_reason, 'Maalem indisponible');
  assert.equal(database.state.assignments.filter((item) => item.unassigned_at == null).length, 1);
  assert.deepEqual(database.state.histories.map((item) => item.event_type), ['MaalemAssigned', 'MaalemReassigned']);
});

test('rollback complet si l’historique échoue', async () => {
  const database = createDatabaseDouble({ failHistory: true });
  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/service-requests/51/assign`, post({ maalem_profile_id: 7, expected_current_assignment_id: null, reason: 'Initiale' }));
    assert.equal(response.status, 500);
  });
  assert.equal(database.state.request.status, 'confirmed');
  assert.equal(database.state.assignments.length, 0);
  assert.equal(database.state.commits, 0);
  assert.equal(database.state.rollbacks, 1);
});

test('rollback de réaffectation restaure l’ancienne affectation courante', async () => {
  const database = createDatabaseDouble();
  await withServer(database, async (baseUrl) => {
    const first = await fetch(`${baseUrl}/api/admin/service-requests/51/assign`, post({ maalem_profile_id: 7, expected_current_assignment_id: null, reason: 'Initiale' }));
    const firstBody = await first.json();
    database.state.failHistory = true;
    const second = await fetch(`${baseUrl}/api/admin/service-requests/51/assign`, post({ maalem_profile_id: 8, expected_current_assignment_id: firstBody.assignment_id, reason: 'Changement' }));
    assert.equal(second.status, 500);
  });
  assert.equal(database.state.assignments.length, 1);
  assert.equal(database.state.assignments[0].maalem_profile_id, 7);
  assert.equal(database.state.assignments[0].unassigned_at, null);
  assert.equal(database.state.request.current_assignment_id, database.state.assignments[0].id);
});

test('détecte deux affectations initiales simultanées et n’en conserve qu’une', async () => {
  const database = createDatabaseDouble();
  await withServer(database, async (baseUrl) => {
    const [one, two] = await Promise.all([
      fetch(`${baseUrl}/api/admin/service-requests/51/assign`, post({ maalem_profile_id: 7, expected_current_assignment_id: null, reason: 'Opérateur A' })),
      fetch(`${baseUrl}/api/admin/service-requests/51/assign`, post({ maalem_profile_id: 8, expected_current_assignment_id: null, reason: 'Opérateur B' })),
    ]);
    assert.deepEqual([one.status, two.status].sort(), [201, 409]);
  });
  assert.equal(database.state.assignments.filter((item) => item.unassigned_at == null).length, 1);
});

test('refuse l’auto-affectation ou l’affectation par un client côté serveur', async () => {
  const database = createDatabaseDouble();
  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/service-requests/51/assign`, post({ maalem_profile_id: 7, expected_current_assignment_id: null, reason: 'Auto-affectation' }));
    assert.equal(response.status, 403);
  }, { id: 70, type_compte: 'Artisan/Promoteur' });
  assert.equal(database.state.assignments.length, 0);
});
