import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import pool from '../db/pool.js';
import reviewInvitationsRouter from './reviewInvitations.js';
import { signReviewInvitationToken } from '../utils/reviewInvitation.js';

const SECRET = 'kan-29-route-test-secret-with-32-characters-minimum';
const PUBLIC_KEY = 'C'.repeat(43);
const FUTURE = new Date('2099-01-01T00:00:00.000Z');
const BASE_ROW = Object.freeze({
  invitation_id: 88,
  invitation_status: 'sent',
  expires_at: FUTURE,
  service_request_id: 51,
  request_number: 'SRV-2026-000051',
  request_source: 'selected_service',
  requester_contact_id: 501,
  request_status: 'closed',
  cancelled_at: null,
  request_deleted_at: null,
  intervention_id: 91,
  intervention_status: 'closed',
  closed_at: '2026-08-21 12:00:00',
  closed_by_employee_id: 3,
  completed_at: '2026-08-21 11:00:00',
  completed_by_contact_id: 70,
  executing_assignment_id: 9,
  maalem_profile_id: 7,
  maalem_contact_id: 70,
  maalem_public_name: 'Maalem Final',
  review_id: null,
  review_submitted_at: null,
});

async function withServer({ user, row = BASE_ROW }, callback) {
  const originalQuery = pool.query;
  const previousSecret = process.env.REVIEW_INVITATION_SECRET;
  const state = { opened: 0, expired: 0, reviewed: 0, suspended: 0 };
  process.env.REVIEW_INVITATION_SECRET = SECRET;
  pool.query = async (sql, params) => {
    if (sql.includes('FROM maalem_review_invitations mri')) {
      assert.equal(params[0], PUBLIC_KEY);
      return Number(params[1]) === 501 && Number(params[2]) === 501 ? [[row].filter(Boolean)] : [[]];
    }
    if (sql.includes('SET opened_at')) { state.opened += 1; return [{ affectedRows: 1 }]; }
    if (sql.includes("SET status = 'expired'")) { state.expired += 1; return [{ affectedRows: 1 }]; }
    if (sql.includes("SET status = 'review_received'")) { state.reviewed += 1; return [{ affectedRows: 1 }]; }
    if (sql.includes("SET status = 'suspended'")) { state.suspended += 1; return [{ affectedRows: 1 }]; }
    throw new Error(`Unexpected query: ${sql}`);
  };
  const app = express();
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use('/api/review-invitations', reviewInvitationsRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`, state);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    pool.query = originalQuery;
    if (previousSecret == null) delete process.env.REVIEW_INVITATION_SECRET;
    else process.env.REVIEW_INVITATION_SECRET = previousSecret;
  }
}

function token(expiresAt = FUTURE) {
  return signReviewInvitationToken({ publicKey: PUBLIC_KEY, expiresAt }, SECRET);
}

const CUSTOMER = { id: 501, role: null, type_compte: 'Client' };

test('le propriétaire authentifié résout le lien sans recevoir de donnée privée', async () => {
  await withServer({ user: CUSTOMER }, async (baseUrl, state) => {
    const response = await fetch(`${baseUrl}/api/review-invitations/${token()}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.request, { id: 51, request_number: 'SRV-2026-000051' });
    assert.deepEqual(body.maalem, { id: 7, public_name: 'Maalem Final' });
    assert.equal(JSON.stringify(body).includes('contact_id'), false);
    assert.equal(JSON.stringify(body).includes('telephone'), false);
    assert.equal(state.opened, 1);
  });
});

test('un autre client ne peut pas utiliser le lien', async () => {
  await withServer({ user: { ...CUSTOMER, id: 502 } }, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/review-invitations/${token()}`)).status, 404);
  });
});

test('un visiteur ou un employé ne peut pas utiliser le lien', async () => {
  for (const user of [undefined, { id: 3, role: 'Manager', type_compte: null }]) {
    await withServer({ user }, async (baseUrl) => {
      assert.equal((await fetch(`${baseUrl}/api/review-invitations/${token()}`)).status, 403);
    });
  }
});

test('un token expiré appartenant au client est refusé et historisé comme expiré', async () => {
  const expiresAt = new Date(Date.now() - 60_000);
  await withServer({ user: CUSTOMER, row: { ...BASE_ROW, expires_at: expiresAt } }, async (baseUrl, state) => {
    const response = await fetch(`${baseUrl}/api/review-invitations/${token(expiresAt)}`);
    assert.equal(response.status, 410);
    assert.equal((await response.json()).error_type, 'INVITATION_EXPIRED');
    assert.equal(state.expired, 1);
  });
});

test('un avis existant redirige proprement vers la demande sans rouvrir le formulaire', async () => {
  await withServer({ user: CUSTOMER, row: { ...BASE_ROW, review_id: 700, review_submitted_at: '2026-08-22 10:00:00' } }, async (baseUrl, state) => {
    const response = await fetch(`${baseUrl}/api/review-invitations/${token()}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.already_reviewed, true);
    assert.equal(body.request.id, 51);
    assert.equal(state.reviewed, 1);
    assert.equal(state.opened, 0);
  });
});
