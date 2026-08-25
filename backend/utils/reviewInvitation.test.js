import test from 'node:test';
import assert from 'node:assert/strict';

import {
  processReviewInvitation,
  reviewInvitationConfig,
  reviewInvitationEligibility,
  scheduleReviewInvitation,
  signReviewInvitationToken,
  verifyReviewInvitationToken,
} from './reviewInvitation.js';

const SECRET = 'kan-29-test-secret-with-at-least-32-characters';
const NOW = new Date('2026-08-21T12:00:00.000Z');
const CLOSED_CONTEXT = Object.freeze({
  service_request_id: 51,
  request_number: 'SRV-2026-000051',
  request_source: 'selected_service',
  requester_contact_id: 501,
  request_status: 'closed',
  cancelled_at: null,
  request_deleted_at: null,
  client_phone: null,
  client_locale: 'fr',
  intervention_id: 91,
  intervention_status: 'closed',
  closed_at: '2026-08-21T12:00:00.000Z',
  closed_by_employee_id: 3,
  completed_at: '2026-08-21T11:00:00.000Z',
  completed_by_contact_id: 70,
  executing_assignment_id: 9,
  maalem_profile_id: 7,
  maalem_contact_id: 70,
  maalem_public_name: 'Maalem Final',
  review_id: null,
});

test('la configuration MVP prévoit envoi immédiat, expiration à 30 jours et une relance', () => {
  assert.deepEqual(reviewInvitationConfig({}), {
    delayMinutes: 0,
    expirationDays: 30,
    reminderDelayDays: 7,
    maxReminders: 1,
    retryDelayMinutes: 5,
    batchSize: 25,
    workerIntervalMs: 60000,
  });
});

test('le token signé ne contient aucune donnée métier et refuse altération ou expiration', () => {
  const publicKey = 'A'.repeat(43);
  const token = signReviewInvitationToken({ publicKey, expiresAt: new Date('2026-08-22T12:00:00.000Z') }, SECRET);
  assert.equal(token.includes('SRV-2026'), false);
  assert.equal(token.includes('501'), false);
  assert.equal(verifyReviewInvitationToken(token, { secret: SECRET, now: NOW }).valid, true);
  assert.equal(verifyReviewInvitationToken(`${token.slice(0, -1)}B`, { secret: SECRET, now: NOW }).reason, 'INVALID_TOKEN');
  assert.equal(verifyReviewInvitationToken(token, { secret: SECRET, now: new Date('2026-08-23T00:00:00.000Z') }).reason, 'EXPIRED_TOKEN');
});

test('l’éligibilité refuse annulation, absence de Maalem final, auto-évaluation et avis existant', () => {
  assert.equal(reviewInvitationEligibility(CLOSED_CONTEXT).eligible, true);
  assert.equal(reviewInvitationEligibility({ ...CLOSED_CONTEXT, cancelled_at: NOW }).reason, 'REQUEST_NOT_CLOSED');
  assert.equal(reviewInvitationEligibility({ ...CLOSED_CONTEXT, executing_assignment_id: null }).reason, 'FINAL_MAALEM_MISSING');
  assert.equal(reviewInvitationEligibility({ ...CLOSED_CONTEXT, requester_contact_id: 70 }).reason, 'SELF_REVIEW_FORBIDDEN');
  assert.equal(reviewInvitationEligibility({ ...CLOSED_CONTEXT, review_id: 4 }).reason, 'ALREADY_REVIEWED');
});

test('une clôture éligible programme une invitation idempotente liée au Maalem final', async () => {
  const inserts = [];
  let calls = 0;
  const connection = {
    async query(sql, params) {
      if (sql.includes('FROM service_requests sr')) return [[CLOSED_CONTEXT]];
      if (sql.includes('INSERT INTO maalem_review_invitations')) {
        inserts.push(params);
        calls += 1;
        return [{ insertId: 88, affectedRows: calls === 1 ? 1 : 2 }];
      }
      if (sql.includes("WHERE id = ? AND status = 'suspended'")) return [{ affectedRows: 0 }];
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const config = reviewInvitationConfig({});
  const first = await scheduleReviewInvitation(connection, { requestId: 51, now: NOW, config });
  const duplicate = await scheduleReviewInvitation(connection, { requestId: 51, now: NOW, config });
  assert.equal(first.scheduled, true);
  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(inserts[0][1], 51);
  assert.equal(inserts[0][2], 91);
  assert.equal(inserts[0][3], 501);
  assert.equal(inserts[0][4], 7);
});

test('une commande annulée ou sans Maalem final ne crée aucune invitation', async () => {
  for (const context of [
    { ...CLOSED_CONTEXT, cancelled_at: NOW },
    { ...CLOSED_CONTEXT, executing_assignment_id: null, maalem_profile_id: null },
  ]) {
    let inserted = false;
    const connection = { query: async (sql) => {
      if (sql.includes('FROM service_requests sr')) return [[context]];
      inserted = true;
      return [{ insertId: 1, affectedRows: 1 }];
    } };
    assert.equal((await scheduleReviewInvitation(connection, { requestId: 51, now: NOW })).scheduled, false);
    assert.equal(inserted, false);
  }
});

function workerDouble(overrides = {}) {
  const invitation = {
    id: 88,
    public_key: 'B'.repeat(43),
    status: 'scheduled',
    service_request_id: 51,
    intervention_id: 91,
    customer_contact_id: 501,
    maalem_profile_id: 7,
    review_id: null,
    request_number: 'SRV-2026-000051',
    request_source: 'selected_service',
    requester_contact_id: 501,
    request_status: 'closed',
    cancelled_at: null,
    request_deleted_at: null,
    client_phone: null,
    client_locale: 'fr',
    intervention_status: 'closed',
    closed_at: '2026-08-21T10:00:00.000Z',
    closed_by_employee_id: 3,
    completed_at: '2026-08-21T09:00:00.000Z',
    completed_by_contact_id: 70,
    executing_assignment_id: 9,
    maalem_contact_id: 70,
    maalem_public_name: 'Maalem Final',
    expires_at: '2026-09-20T12:00:00.000Z',
    scheduled_at: '2026-08-21T11:00:00.000Z',
    next_attempt_at: '2026-08-21T11:00:00.000Z',
    first_sent_at: null,
    next_reminder_at: null,
    reminder_count: 0,
    max_reminders: 1,
    ...overrides,
  };
  const state = { invitation, deliveries: [], updates: [], commits: 0, rollbacks: 0 };
  const query = async (sql, params) => {
    if (sql.includes('FROM maalem_review_invitations mri')) return [[state.invitation]];
    if (sql.includes('INSERT INTO maalem_notification_deliveries')) {
      state.deliveries.push(params);
      return [{ insertId: 300 + state.deliveries.length, affectedRows: 1 }];
    }
    if (sql.includes("SET status = 'sent'")) {
      state.invitation.status = 'sent';
      state.invitation.first_sent_at ||= params[0];
      state.invitation.reminder_count = params[2];
      state.invitation.next_reminder_at = params[3];
      state.updates.push({ sql, params });
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("SET status = 'review_received'")) { state.invitation.status = 'review_received'; return [{ affectedRows: 1 }]; }
    if (sql.includes("SET status = 'suspended'")) { state.invitation.status = 'suspended'; return [{ affectedRows: 1 }]; }
    if (sql.includes("SET status = 'expired'")) { state.invitation.status = 'expired'; return [{ affectedRows: 1 }]; }
    if (sql.includes("SET status = 'failed'")) { state.invitation.status = 'failed'; state.invitation.last_error = params[0]; return [{ affectedRows: 1 }]; }
    if (sql.includes('SET status = ?')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected query: ${sql}`);
  };
  const connection = {
    query,
    beginTransaction: async () => {},
    commit: async () => { state.commits += 1; },
    rollback: async () => { state.rollbacks += 1; },
    release() {},
  };
  return { state, db: { getConnection: async () => connection, query } };
}

test('le worker crée le lien opaque, envoie la première invitation et programme une seule relance', async () => {
  const { db, state } = workerDouble();
  const dispatched = [];
  const result = await processReviewInvitation(88, {
    db, now: NOW, secret: SECRET,
    env: { ECOMMERCE_FRONTEND_URL: 'https://shop.example.test' },
    dispatcher: async (items) => { dispatched.push(...items); },
  });
  assert.equal(result.status, 'sent');
  assert.equal(result.sequence, 0);
  assert.equal(state.deliveries.length, 1);
  const payload = JSON.parse(state.deliveries[0][13]);
  assert.match(payload.detail_url, /^https:\/\/shop\.example\.test\/fr\/profile\/review-invitations\//);
  assert.doesNotMatch(payload.detail_url, /\/requests\/51/);
  assert.equal(state.invitation.reminder_count, 0);
  assert.ok(state.invitation.next_reminder_at);
  assert.equal(dispatched.length, 1);
});

test('un avis publié arrête le worker et une réouverture suspend l’invitation', async () => {
  const reviewed = workerDouble({ active_review_id: 601, review_id: 601, active_review_submitted_at: NOW });
  assert.equal((await processReviewInvitation(88, { db: reviewed.db, now: NOW, secret: SECRET })).status, 'review_received');
  assert.equal(reviewed.state.deliveries.length, 0);

  const reopened = workerDouble({ request_status: 'processing' });
  const result = await processReviewInvitation(88, { db: reopened.db, now: NOW, secret: SECRET });
  assert.equal(result.status, 'suspended');
  assert.equal(reopened.state.deliveries.length, 0);
});

test('la relance ne dépasse jamais le maximum configuré', async () => {
  const { db, state } = workerDouble({
    status: 'sent',
    first_sent_at: '2026-08-21T10:00:00.000Z',
    next_reminder_at: '2026-08-21T11:00:00.000Z',
    reminder_count: 0,
    max_reminders: 1,
  });
  const result = await processReviewInvitation(88, { db, now: NOW, secret: SECRET, dispatcher: async () => [] });
  assert.equal(result.sequence, 1);
  assert.equal(state.invitation.reminder_count, 1);
  assert.equal(state.invitation.next_reminder_at, null);
  const second = await processReviewInvitation(88, { db, now: new Date('2026-08-30T12:00:00.000Z'), secret: SECRET });
  assert.equal(second.reason, 'NOT_DUE');
  assert.equal(state.deliveries.length, 1);
});

test('une erreur de traitement est historisée sans lever vers la clôture', async () => {
  const { db, state } = workerDouble();
  const originalQuery = db.getConnection;
  db.getConnection = async () => {
    const connection = await originalQuery();
    const baseQuery = connection.query;
    connection.query = async (sql, params) => {
      if (sql.includes('INSERT INTO maalem_notification_deliveries')) throw new Error('provider secret https://private.invalid/token');
      return baseQuery(sql, params);
    };
    return connection;
  };
  const result = await processReviewInvitation(88, { db, now: NOW, secret: SECRET });
  assert.equal(result.status, 'failed');
  assert.equal(state.invitation.status, 'failed');
  assert.doesNotMatch(state.invitation.last_error, /https:\/\//);
});
