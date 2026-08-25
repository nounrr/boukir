import crypto from 'node:crypto';

import pool from '../db/pool.js';
import {
  OPERATIONAL_NOTIFICATION_EVENTS,
  dispatchOperationalNotificationsSafely,
  enqueueOperationalNotifications,
} from './operationalNotification.js';
import { sanitizeNotificationError } from './notificationDelivery.js';

const PUBLIC_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function integerSetting(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export function reviewInvitationConfig(env = process.env) {
  return {
    delayMinutes: integerSetting(env.REVIEW_INVITATION_DELAY_MINUTES, 0, 0, 10080),
    expirationDays: integerSetting(env.REVIEW_INVITATION_EXPIRATION_DAYS, 30, 1, 365),
    reminderDelayDays: integerSetting(env.REVIEW_INVITATION_REMINDER_DELAY_DAYS, 7, 1, 90),
    maxReminders: integerSetting(env.REVIEW_INVITATION_MAX_REMINDERS, 1, 0, 5),
    retryDelayMinutes: integerSetting(env.REVIEW_INVITATION_RETRY_DELAY_MINUTES, 5, 1, 1440),
    batchSize: integerSetting(env.REVIEW_INVITATION_WORKER_BATCH_SIZE, 25, 1, 200),
    workerIntervalMs: integerSetting(env.REVIEW_INVITATION_WORKER_INTERVAL_MS, 60000, 5000, 3600000),
  };
}

export function getReviewInvitationSecret(env = process.env) {
  const secret = String(env.REVIEW_INVITATION_SECRET || env.JWT_SECRET || '').trim();
  if (secret.length < 32) throw new Error('REVIEW_INVITATION_SECRET or JWT_SECRET must contain at least 32 characters');
  return secret;
}

export function createReviewInvitationPublicKey() {
  return crypto.randomBytes(32).toString('base64url');
}

export function signReviewInvitationToken({ publicKey, expiresAt }, secret = getReviewInvitationSecret()) {
  if (!PUBLIC_KEY_PATTERN.test(String(publicKey || ''))) throw new TypeError('Invalid review invitation public key');
  const expires = Math.floor(new Date(expiresAt).getTime() / 1000);
  if (!Number.isSafeInteger(expires) || expires <= 0) throw new TypeError('Invalid review invitation expiration');
  const value = `${publicKey}.${expires}`;
  const signature = crypto.createHmac('sha256', secret).update(value).digest('base64url');
  return `${value}.${signature}`;
}

export function verifyReviewInvitationToken(token, { secret = getReviewInvitationSecret(), now = new Date() } = {}) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || !PUBLIC_KEY_PATTERN.test(parts[0]) || !/^\d{10,12}$/.test(parts[1]) || !SIGNATURE_PATTERN.test(parts[2])) {
    return { valid: false, reason: 'INVALID_TOKEN' };
  }
  const value = `${parts[0]}.${parts[1]}`;
  const expected = crypto.createHmac('sha256', secret).update(value).digest();
  const received = Buffer.from(parts[2], 'base64url');
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return { valid: false, reason: 'INVALID_TOKEN' };
  }
  const expiresAt = new Date(Number(parts[1]) * 1000);
  if (expiresAt.getTime() <= new Date(now).getTime()) {
    return { valid: false, reason: 'EXPIRED_TOKEN', publicKey: parts[0], expiresAt };
  }
  return { valid: true, publicKey: parts[0], expiresAt };
}

function addMinutes(value, minutes) {
  return new Date(new Date(value).getTime() + minutes * 60 * 1000);
}

function addDays(value, days) {
  return addMinutes(value, days * 24 * 60);
}

export function reviewInvitationEligibility(context) {
  if (!context) return { eligible: false, reason: 'REQUEST_NOT_FOUND' };
  if (context.review_id) return { eligible: false, reason: 'ALREADY_REVIEWED' };
  if (!['selected_maalem', 'selected_service'].includes(context.request_source)) {
    return { eligible: false, reason: 'UNSUPPORTED_REQUEST_TYPE' };
  }
  if (context.request_deleted_at || context.cancelled_at || context.request_status !== 'closed') {
    return { eligible: false, reason: 'REQUEST_NOT_CLOSED' };
  }
  if (context.intervention_status !== 'closed' || !context.closed_at || !context.closed_by_employee_id || !context.completed_at) {
    return { eligible: false, reason: 'INTERVENTION_NOT_CLOSED' };
  }
  if (!context.executing_assignment_id || !context.maalem_profile_id || !context.maalem_contact_id) {
    return { eligible: false, reason: 'FINAL_MAALEM_MISSING' };
  }
  if (Number(context.completed_by_contact_id) !== Number(context.maalem_contact_id)) {
    return { eligible: false, reason: 'COMPLETION_MISMATCH' };
  }
  if (Number(context.requester_contact_id) === Number(context.maalem_contact_id)) {
    return { eligible: false, reason: 'SELF_REVIEW_FORBIDDEN' };
  }
  return { eligible: true, reason: null };
}

async function loadClosedRequestContext(connection, requestId, forUpdate = false) {
  const [rows] = await connection.query(
    `SELECT sr.id AS service_request_id, sr.request_number, sr.request_source,
            sr.requester_contact_id, sr.status AS request_status, sr.cancelled_at,
            sr.deleted_at AS request_deleted_at,
            requester.telephone AS client_phone, requester.locale AS client_locale,
            si.id AS intervention_id, si.status AS intervention_status, si.closed_at,
            si.closed_by_employee_id, si.completed_at, si.completed_by_contact_id,
            si.executing_assignment_id, sra.maalem_profile_id,
            mp.contact_id AS maalem_contact_id, maalem.nom_complet AS maalem_public_name,
            mr.id AS review_id, mr.submitted_at AS review_submitted_at
     FROM service_requests sr
     INNER JOIN contacts requester ON requester.id = sr.requester_contact_id
     LEFT JOIN service_interventions si ON si.service_request_id = sr.id
     LEFT JOIN service_request_assignments sra
       ON sra.id = si.executing_assignment_id AND sra.service_request_id = sr.id
     LEFT JOIN maalem_profiles mp ON mp.id = sra.maalem_profile_id
     LEFT JOIN contacts maalem ON maalem.id = mp.contact_id
     LEFT JOIN maalem_reviews mr ON mr.service_request_id = sr.id AND mr.deleted_at IS NULL
     WHERE sr.id = ? LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [requestId]
  );
  return rows[0] || null;
}

export async function scheduleReviewInvitation(connection, {
  requestId,
  now = new Date(),
  config = reviewInvitationConfig(),
} = {}) {
  const context = await loadClosedRequestContext(connection, Number(requestId), true);
  const eligibility = reviewInvitationEligibility(context);
  if (!eligibility.eligible) return { scheduled: false, reason: eligibility.reason };

  const closedAt = new Date(context.closed_at || now);
  const scheduledAt = addMinutes(closedAt, config.delayMinutes);
  const expiresAt = addDays(scheduledAt, config.expirationDays);
  const publicKey = createReviewInvitationPublicKey();
  const [result] = await connection.query(
    `INSERT INTO maalem_review_invitations
       (public_key, service_request_id, intervention_id, customer_contact_id, maalem_profile_id,
        status, scheduled_at, next_attempt_at, expires_at, max_reminders)
     VALUES (?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [publicKey, Number(context.service_request_id), Number(context.intervention_id),
      Number(context.requester_contact_id), Number(context.maalem_profile_id),
      scheduledAt, scheduledAt, expiresAt, config.maxReminders]
  );
  const id = Number(result.insertId);
  const duplicate = Number(result.affectedRows) !== 1;
  if (duplicate && id) {
    await connection.query(
      `UPDATE maalem_review_invitations
       SET status = IF(first_sent_at IS NULL, 'scheduled', 'sent'),
           next_attempt_at = IF(first_sent_at IS NULL, scheduled_at, next_reminder_at),
           last_error = NULL
       WHERE id = ? AND status = 'suspended'`,
      [id]
    );
  }
  return { scheduled: true, duplicate, id, context };
}

export async function scheduleReviewInvitationSafely({
  db = pool,
  requestId,
  now = new Date(),
  config = reviewInvitationConfig(),
} = {}) {
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const result = await scheduleReviewInvitation(connection, { requestId, now, config });
    await connection.commit();
    return result;
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    console.error('[Review invitation] scheduling failed:', sanitizeNotificationError(error));
    return { scheduled: false, reason: 'SCHEDULING_FAILED', error: sanitizeNotificationError(error) };
  } finally {
    connection?.release();
  }
}

async function loadInvitationForUpdate(connection, invitationId) {
  const [rows] = await connection.query(
    `SELECT mri.*, sr.request_number, sr.request_source, sr.requester_contact_id,
            sr.status AS request_status, sr.cancelled_at, sr.deleted_at AS request_deleted_at,
            requester.telephone AS client_phone, requester.locale AS client_locale,
            si.status AS intervention_status, si.closed_at, si.closed_by_employee_id,
            si.completed_at, si.completed_by_contact_id, si.executing_assignment_id,
            sra.maalem_profile_id, mp.contact_id AS maalem_contact_id,
            maalem.nom_complet AS maalem_public_name,
            mr.id AS active_review_id, mr.submitted_at AS active_review_submitted_at
     FROM maalem_review_invitations mri
     INNER JOIN service_requests sr ON sr.id = mri.service_request_id
     INNER JOIN contacts requester ON requester.id = mri.customer_contact_id
     INNER JOIN service_interventions si ON si.id = mri.intervention_id AND si.service_request_id = sr.id
     LEFT JOIN service_request_assignments sra
       ON sra.id = si.executing_assignment_id AND sra.service_request_id = sr.id
     LEFT JOIN maalem_profiles mp ON mp.id = sra.maalem_profile_id
     LEFT JOIN contacts maalem ON maalem.id = mp.contact_id
     LEFT JOIN maalem_reviews mr ON mr.service_request_id = sr.id AND mr.deleted_at IS NULL
     WHERE mri.id = ? LIMIT 1 FOR UPDATE`,
    [invitationId]
  );
  const row = rows[0] || null;
  if (row) row.review_id = row.active_review_id || row.review_id;
  return row;
}

function ecommerceBase(env = process.env) {
  return String(env.ECOMMERCE_FRONTEND_URL || 'http://localhost:3002').trim().replace(/\/+$/, '');
}

export async function processReviewInvitation(invitationId, {
  db = pool,
  now = new Date(),
  config = reviewInvitationConfig(),
  secret = getReviewInvitationSecret(),
  env = process.env,
  dispatcher = dispatchOperationalNotificationsSafely,
} = {}) {
  let connection;
  let deliveries = [];
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const invitation = await loadInvitationForUpdate(connection, Number(invitationId));
    if (!invitation) {
      await connection.commit();
      return { processed: false, reason: 'INVITATION_NOT_FOUND' };
    }
    if (invitation.review_id) {
      await connection.query(
        `UPDATE maalem_review_invitations
         SET status = 'review_received', review_id = ?, submitted_at = COALESCE(submitted_at, ?),
             next_attempt_at = NULL, next_reminder_at = NULL, last_error = NULL
         WHERE id = ?`,
        [Number(invitation.review_id), invitation.active_review_submitted_at || now, invitation.id]
      );
      await connection.commit();
      return { processed: true, status: 'review_received' };
    }
    if (new Date(invitation.expires_at).getTime() <= new Date(now).getTime()) {
      await connection.query(
        `UPDATE maalem_review_invitations
         SET status = 'expired', next_attempt_at = NULL, next_reminder_at = NULL WHERE id = ?`,
        [invitation.id]
      );
      await connection.commit();
      return { processed: true, status: 'expired' };
    }
    const eligibility = reviewInvitationEligibility(invitation);
    if (!eligibility.eligible) {
      await connection.query(
        `UPDATE maalem_review_invitations
         SET status = 'suspended', next_attempt_at = NULL, last_error = ? WHERE id = ?`,
        [eligibility.reason, invitation.id]
      );
      await connection.commit();
      return { processed: true, status: 'suspended', reason: eligibility.reason };
    }

    const firstSend = !invitation.first_sent_at;
    const sequence = firstSend ? 0 : Number(invitation.reminder_count) + 1;
    const dueAt = firstSend ? invitation.scheduled_at : invitation.next_reminder_at;
    if (!dueAt || new Date(dueAt).getTime() > new Date(now).getTime()
      || (!firstSend && Number(invitation.reminder_count) >= Number(invitation.max_reminders))) {
      if (invitation.status === 'suspended') {
        await connection.query(
          `UPDATE maalem_review_invitations SET status = ?, next_attempt_at = ? WHERE id = ?`,
          [firstSend ? 'scheduled' : 'sent', dueAt || null, invitation.id]
        );
      }
      await connection.commit();
      return { processed: false, reason: 'NOT_DUE' };
    }

    const token = signReviewInvitationToken({ publicKey: invitation.public_key, expiresAt: invitation.expires_at }, secret);
    const locale = String(invitation.client_locale || '').toLowerCase().startsWith('ar') ? 'ar' : 'fr';
    const detailUrl = `${ecommerceBase(env)}/${locale}/profile/review-invitations/${encodeURIComponent(token)}`;
    const event = firstSend ? OPERATIONAL_NOTIFICATION_EVENTS.REVIEW_INVITATION : OPERATIONAL_NOTIFICATION_EVENTS.REVIEW_REMINDER;
    deliveries = await enqueueOperationalNotifications(connection, {
      serviceRequestId: Number(invitation.service_request_id),
      interventionId: Number(invitation.intervention_id),
      event,
      sourceEvent: OPERATIONAL_NOTIFICATION_EVENTS.CLOSED,
      audiences: ['CLIENT'],
      context: {
        id: Number(invitation.service_request_id),
        request_number: invitation.request_number,
        requester_contact_id: Number(invitation.customer_contact_id),
        client_phone: invitation.client_phone,
        client_locale: locale,
        current_maalem_profile_id: Number(invitation.maalem_profile_id),
        current_maalem_contact_id: Number(invitation.maalem_contact_id),
        intervention_id: Number(invitation.intervention_id),
      },
      maalemName: invitation.maalem_public_name,
      detailUrl,
      versionKey: `review-invitation:${sequence}`,
    });

    const nextReminder = sequence < Number(invitation.max_reminders)
      ? addDays(now, config.reminderDelayDays)
      : null;
    await connection.query(
      `UPDATE maalem_review_invitations
       SET status = 'sent', first_sent_at = COALESCE(first_sent_at, ?), last_sent_at = ?,
           reminder_count = ?, next_reminder_at = ?, next_attempt_at = ?,
           processing_attempts = processing_attempts + 1, last_error = NULL
       WHERE id = ?`,
      [now, now, firstSend ? Number(invitation.reminder_count) : sequence,
        nextReminder, nextReminder, invitation.id]
    );
    await connection.commit();
    await dispatcher(deliveries);
    return { processed: true, status: 'sent', sequence, deliveries };
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    const safeError = sanitizeNotificationError(error);
    await db.query(
      `UPDATE maalem_review_invitations
       SET status = 'failed', processing_attempts = processing_attempts + 1,
           last_error = ?, next_attempt_at = ? WHERE id = ? AND status NOT IN ('expired', 'review_received')`,
      [safeError, addMinutes(now, config.retryDelayMinutes), Number(invitationId)]
    ).catch(() => {});
    return { processed: false, status: 'failed', error: safeError };
  } finally {
    connection?.release();
  }
}

export async function markReviewInvitationSubmitted(connection, {
  serviceRequestId,
  customerContactId,
  reviewId,
  submittedAt = new Date(),
}) {
  await connection.query(
    `UPDATE maalem_review_invitations
     SET status = 'review_received', review_id = ?, submitted_at = ?,
         next_attempt_at = NULL, next_reminder_at = NULL, last_error = NULL
     WHERE service_request_id = ? AND customer_contact_id = ?`,
    [reviewId, submittedAt, serviceRequestId, customerContactId]
  );
}

export async function suspendReviewInvitationsForRequest(connection, requestId, reason = 'REQUEST_NOT_CLOSED') {
  await connection.query(
    `UPDATE maalem_review_invitations
     SET status = 'suspended', next_attempt_at = NULL, last_error = ?
     WHERE service_request_id = ? AND status NOT IN ('expired', 'review_received')`,
    [String(reason).slice(0, 500), Number(requestId)]
  );
}

export async function findClosedRequestsWithoutInvitation(db = pool, limit = 25) {
  const [rows] = await db.query(
    `SELECT sr.id
     FROM service_requests sr
     INNER JOIN service_interventions si ON si.service_request_id = sr.id
     INNER JOIN service_request_assignments sra
       ON sra.id = si.executing_assignment_id AND sra.service_request_id = sr.id
     INNER JOIN maalem_profiles mp ON mp.id = sra.maalem_profile_id
     LEFT JOIN maalem_reviews mr ON mr.service_request_id = sr.id AND mr.deleted_at IS NULL
     LEFT JOIN maalem_review_invitations mri ON mri.service_request_id = sr.id
     WHERE sr.request_source IN ('selected_maalem', 'selected_service')
       AND sr.status = 'closed' AND sr.cancelled_at IS NULL AND sr.deleted_at IS NULL
       AND si.status = 'closed' AND si.closed_at IS NOT NULL AND si.closed_by_employee_id IS NOT NULL
       AND si.completed_at IS NOT NULL AND si.completed_by_contact_id = mp.contact_id
       AND si.executing_assignment_id IS NOT NULL
       AND mr.id IS NULL AND mri.id IS NULL
     ORDER BY si.closed_at, sr.id LIMIT ?`,
    [Number(limit)]
  );
  return rows.map((row) => Number(row.id));
}

export async function runReviewInvitationWorkerOnce({
  db = pool,
  requestIds = [],
  now = new Date(),
  config = reviewInvitationConfig(),
  ...options
} = {}) {
  const recovered = new Set(requestIds.map(Number).filter(Number.isSafeInteger));
  for (const id of await findClosedRequestsWithoutInvitation(db, config.batchSize)) recovered.add(id);
  const scheduled = [];
  for (const requestId of recovered) {
    scheduled.push(await scheduleReviewInvitationSafely({ db, requestId, now, config }));
  }
  const [dueRows] = await db.query(
    `SELECT id FROM maalem_review_invitations
     WHERE status NOT IN ('expired', 'review_received')
       AND (expires_at <= ? OR (next_attempt_at IS NOT NULL AND next_attempt_at <= ?))
     ORDER BY COALESCE(next_attempt_at, expires_at), id LIMIT ?`,
    [now, now, config.batchSize]
  );
  const processed = [];
  for (const row of dueRows) {
    processed.push(await processReviewInvitation(Number(row.id), { db, now, config, ...options }));
  }
  return { recovered: recovered.size, scheduled, processed };
}
