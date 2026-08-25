import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import pool from '../db/pool.js';
import serviceRequestReviewsRouter from './serviceRequestReviews.js';

const CLOSED_CONTEXT = Object.freeze({
  service_request_id: 44,
  request_number: 'SR-0044',
  requester_contact_id: 7,
  request_source: 'selected_service',
  request_status: 'closed',
  cancelled_at: null,
  request_deleted_at: null,
  customer_name: 'Client Test',
  intervention_id: 81,
  intervention_status: 'closed',
  closed_at: '2026-08-20 10:00:00',
  closed_by_employee_id: 5,
  completed_at: '2026-08-20 09:00:00',
  completed_by_contact_id: 19,
  executing_assignment_id: 92,
  maalem_profile_id: 13,
  maalem_contact_id: 19,
  maalem_public_name: 'Maalem Final',
});

async function withServer(options, callback) {
  const originalQuery = pool.query;
  const originalGetConnection = pool.getConnection;
  const state = { inserts: [], history: [], profileInvalidations: 0, commits: 0, rollbacks: 0 };
  const context = options.context === undefined ? CLOSED_CONTEXT : options.context;
  const existingReview = options.existingReview || null;

  const query = async (sql, params) => {
    if (sql.includes('FROM service_requests sr')) {
      assert.deepEqual(params, [44, Number(options.user?.id)]);
      return [[context].filter(Boolean)];
    }
    if (sql.includes('FROM maalem_reviews') && sql.includes('SELECT id')) {
      return [[existingReview].filter(Boolean)];
    }
    if (sql.includes('INSERT INTO maalem_reviews')) {
      if (options.duplicateOnInsert) {
        const error = new Error('Duplicate');
        error.code = 'ER_DUP_ENTRY';
        throw error;
      }
      state.inserts.push(params);
      return [{ insertId: 501 }];
    }
    if (sql.includes('INSERT INTO maalem_review_history')) {
      state.history.push(params);
      return [{ insertId: 701 }];
    }
    if (sql.includes('UPDATE maalem_profiles') && sql.includes('updated_at = NOW()')) {
      assert.deepEqual(params, [13]);
      state.profileInvalidations += 1;
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('UPDATE maalem_review_invitations')) {
      state.invitationUpdate = params;
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Requête inattendue: ${sql}`);
  };

  pool.query = query;
  pool.getConnection = async () => ({
    query,
    beginTransaction: async () => {},
    commit: async () => { state.commits += 1; },
    rollback: async () => { state.rollbacks += 1; },
    release: () => {},
  });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = options.user; next(); });
  app.use('/api/service-requests', serviceRequestReviewsRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({
    message: error.message,
    errors: error.errors,
    error_type: error.publicCode,
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`, state);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    pool.query = originalQuery;
    pool.getConnection = originalGetConnection;
  }
}

const CUSTOMER = { id: 7, role: null, type_compte: 'client' };

test('GET review expose uniquement le contexte sûr du client propriétaire', async () => {
  await withServer({ user: CUSTOMER }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/service-requests/44/review`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.eligible, true);
    assert.deepEqual(body.maalem, { id: 13, public_name: 'Maalem Final' });
    assert.deepEqual(body.request, { id: 44, request_number: 'SR-0044', status: 'closed' });
    assert.equal(JSON.stringify(body).includes('customer_name'), false);
    assert.equal(JSON.stringify(body).includes('maalem_contact_id'), false);
    assert.equal(JSON.stringify(body).includes('closed_by_employee_id'), false);
  });
});

test('POST review utilise le Maalem exécutant final, assainit le commentaire et historise', async () => {
  await withServer({ user: CUSTOMER }, async (baseUrl, state) => {
    const response = await fetch(`${baseUrl}/api/service-requests/44/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: 5, comment: '  Travail <b>très soigné</b> et ponctuel.  ', maalem_profile_id: 999 }),
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.review.rating, 5);
    assert.equal(body.review.comment, 'Travail très soigné et ponctuel.');
    assert.equal(state.inserts[0][3], 13);
    assert.equal(state.inserts[0][5], 'Travail très soigné et ponctuel.');
    assert.equal(state.history.length, 1);
    assert.equal(state.history[0][0], 501);
    assert.equal(state.profileInvalidations, 1);
    assert.equal(state.invitationUpdate[0], 501);
    assert.equal(state.commits, 1);
  });
});

test('un compte non-client ne peut ni lire ni créer un avis', async () => {
  await withServer({ user: { id: 5, role: 'admin', type_compte: null } }, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/service-requests/44/review`)).status, 403);
    assert.equal((await fetch(`${baseUrl}/api/service-requests/44/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: 5 }),
    })).status, 403);
  });
});

test('une demande absente du compte reste introuvable', async () => {
  await withServer({ user: CUSTOMER, context: null }, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/service-requests/44/review`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/api/service-requests/44/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: 5 }),
    })).status, 404);
  });
});

test('une demande non clôturée est inéligible côté lecture et refusée côté écriture', async () => {
  const context = { ...CLOSED_CONTEXT, request_status: 'in_progress' };
  await withServer({ user: CUSTOMER, context }, async (baseUrl, state) => {
    const getResponse = await fetch(`${baseUrl}/api/service-requests/44/review`);
    assert.deepEqual(await getResponse.json().then(({ eligible, reason }) => ({ eligible, reason })), {
      eligible: false,
      reason: 'REQUEST_NOT_CLOSED',
    });
    const postResponse = await fetch(`${baseUrl}/api/service-requests/44/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: 4 }),
    });
    assert.equal(postResponse.status, 409);
    assert.equal((await postResponse.json()).error_type, 'REQUEST_NOT_CLOSED');
    assert.equal(state.commits, 0);
    assert.equal(state.rollbacks, 1);
  });
});

test('un client ne peut pas s’auto-évaluer', async () => {
  const context = { ...CLOSED_CONTEXT, maalem_contact_id: 7, completed_by_contact_id: 7 };
  await withServer({ user: CUSTOMER, context }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/service-requests/44/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: 4 }),
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error_type, 'SELF_REVIEW_FORBIDDEN');
  });
});

test('un second avis est refusé, y compris en cas de collision concurrente', async () => {
  const review = { id: 1, service_request_id: 44, rating: 4, comment: null, status: 'published', submitted_at: new Date(), created_at: new Date() };
  await withServer({ user: CUSTOMER, existingReview: review }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/service-requests/44/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: 5 }),
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error_type, 'ALREADY_REVIEWED');
  });
  await withServer({ user: CUSTOMER, duplicateOnInsert: true }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/service-requests/44/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: 5 }),
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error_type, 'ALREADY_REVIEWED');
  });
});

test('la validation refuse une note hors limites avant toute transaction', async () => {
  await withServer({ user: CUSTOMER }, async (baseUrl, state) => {
    const response = await fetch(`${baseUrl}/api/service-requests/44/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: 6 }),
    });
    assert.equal(response.status, 422);
    assert.equal(Boolean((await response.json()).errors.rating), true);
    assert.equal(state.commits, 0);
  });
});
