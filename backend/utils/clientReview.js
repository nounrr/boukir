import {
  MAALEM_REVIEW_LIMITS,
  MAALEM_REVIEW_STATUS,
  REVIEWABLE_REQUEST_SOURCES,
  sanitizeMaalemReviewComment,
} from './maalemReview.js';
import { markReviewInvitationSubmitted } from './reviewInvitation.js';

// The customer's stars for the Maalem who did the work.
// Given with the verdict once the Maalem has finished: kept 'pending' (not public) until the team closes the mission,
// then published by publishPendingReviewsOnClosure. Given after the closure: published at once.
// A pending review can still be changed by its author; a published (or moderated) one cannot.

/** The review text: the customer's comment when it is long enough for a public review, else stars only. */
export function reviewCommentFrom(text) {
  const clean = sanitizeMaalemReviewComment(text);
  if (!clean || clean.length < MAALEM_REVIEW_LIMITS.commentMin) return null;
  return clean.slice(0, MAALEM_REVIEW_LIMITS.commentMax);
}

/** A whole number of stars between 1 and 5, or null when none was given. */
export function parseRating(value) {
  if (value === undefined || value === null || value === '') return { valid: true, rating: null };
  const rating = Number(value);
  const ok = Number.isInteger(rating) && rating >= MAALEM_REVIEW_LIMITS.ratingMin && rating <= MAALEM_REVIEW_LIMITS.ratingMax;
  return ok ? { valid: true, rating } : { valid: false, rating: null };
}

/** Why stars can or cannot be saved for this request (pure, for the route and the tests). */
export function customerReviewEligibility(context, contactId) {
  if (!context) return { eligible: false, reason: 'NO_MAALEM' };
  if (context.cancelled_at || context.request_status === 'cancelled') return { eligible: false, reason: 'REQUEST_CANCELLED' };
  if (!REVIEWABLE_REQUEST_SOURCES.includes(context.request_source)) return { eligible: false, reason: 'UNSUPPORTED_REQUEST_TYPE' };
  if (!['completed', 'closed'].includes(context.request_status)) return { eligible: false, reason: 'WORK_NOT_FINISHED' };
  if (Number(context.maalem_contact_id) === Number(contactId)) return { eligible: false, reason: 'SELF_REVIEW_FORBIDDEN' };
  const closed = context.request_status === 'closed' && context.intervention_status === 'closed';
  return { eligible: true, reason: null, status: closed ? MAALEM_REVIEW_STATUS.PUBLISHED : MAALEM_REVIEW_STATUS.PENDING };
}

async function loadRateableContext(db, requestId, contactId) {
  // Before the closure the Maalem is the current assignment; the closure freezes it as the executing one.
  const [rows] = await db.query(
    `SELECT sr.id AS service_request_id, sr.status AS request_status, sr.request_source, sr.cancelled_at,
            sr.requester_contact_id, si.id AS intervention_id, si.status AS intervention_status,
            sra.maalem_profile_id, mp.contact_id AS maalem_contact_id
     FROM service_requests sr
     INNER JOIN service_interventions si ON si.service_request_id = sr.id
     INNER JOIN service_request_assignments sra
       ON sra.id = COALESCE(si.executing_assignment_id, sr.current_assignment_id) AND sra.service_request_id = sr.id
     INNER JOIN maalem_profiles mp ON mp.id = sra.maalem_profile_id
     WHERE sr.id = ? AND sr.requester_contact_id = ? AND sr.deleted_at IS NULL
     LIMIT 1 FOR UPDATE`,
    [requestId, contactId]
  );
  return rows[0] || null;
}

/** Saves (or, while still pending, changes) the customer's stars. Runs inside the caller's transaction. */
export async function saveCustomerReview(db, { requestId, contactId, actorName, rating, comment }) {
  const context = await loadRateableContext(db, requestId, contactId);
  const eligibility = customerReviewEligibility(context, contactId);
  if (!eligibility.eligible) return { saved: false, reason: eligibility.reason };

  const [existingRows] = await db.query(
    `SELECT id, rating, comment, status, customer_contact_id, moderated_at
     FROM maalem_reviews WHERE service_request_id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,
    [requestId]
  );
  const existing = existingRows[0];
  const now = new Date();
  const name = actorName || `Client #${contactId}`;

  if (existing) {
    const editable = existing.status === MAALEM_REVIEW_STATUS.PENDING && !existing.moderated_at
      && Number(existing.customer_contact_id) === Number(contactId);
    if (!editable) return { saved: false, reason: 'ALREADY_REVIEWED', reviewId: Number(existing.id), status: existing.status };
    await db.query(
      `UPDATE maalem_reviews SET rating = ?, comment = ?, status = ?, maalem_profile_id = ?, intervention_id = ?, submitted_at = ?
       WHERE id = ?`,
      [rating, comment, eligibility.status, Number(context.maalem_profile_id), Number(context.intervention_id), now, existing.id]
    );
    await db.query(
      `INSERT INTO maalem_review_history
         (review_id, event_type, old_rating, new_rating, old_comment, new_comment, old_status, new_status,
          actor_type, actor_contact_id, actor_name)
       VALUES (?, 'UPDATED', ?, ?, ?, ?, ?, ?, 'CONTACT', ?, ?)`,
      [existing.id, existing.rating, rating, existing.comment, comment, existing.status, eligibility.status, contactId, name]
    );
    return { saved: true, reviewId: Number(existing.id), status: eligibility.status };
  }

  const [insert] = await db.query(
    `INSERT INTO maalem_reviews
       (service_request_id, intervention_id, customer_contact_id, maalem_profile_id, rating, comment, status, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [requestId, Number(context.intervention_id), contactId, Number(context.maalem_profile_id), rating, comment, eligibility.status, now]
  );
  const reviewId = Number(insert.insertId);
  await db.query(
    `INSERT INTO maalem_review_history
       (review_id, event_type, new_rating, new_comment, new_status, actor_type, actor_contact_id, actor_name)
     VALUES (?, 'CREATED', ?, ?, ?, 'CONTACT', ?, ?)`,
    [reviewId, rating, comment, eligibility.status, contactId, name]
  );
  if (eligibility.status === MAALEM_REVIEW_STATUS.PUBLISHED) {
    await db.query('UPDATE maalem_profiles SET updated_at = NOW() WHERE id = ?', [Number(context.maalem_profile_id)]);
  }
  // No invitation to rate is sent (or reminded) once the customer has rated.
  await markReviewInvitationSubmitted(db, { serviceRequestId: requestId, customerContactId: contactId, reviewId, submittedAt: now });
  return { saved: true, reviewId, status: eligibility.status };
}

/** At the team's closure: the customer's pending stars for the Maalem who did the work become public. */
export async function publishPendingReviewsOnClosure(db, { requestId, assignmentId }) {
  const [rows] = await db.query(
    `SELECT mr.id, mr.maalem_profile_id
     FROM maalem_reviews mr
     INNER JOIN service_request_assignments sra ON sra.id = ? AND sra.maalem_profile_id = mr.maalem_profile_id
     WHERE mr.service_request_id = ? AND mr.status = 'pending' AND mr.moderated_at IS NULL AND mr.deleted_at IS NULL
     FOR UPDATE`,
    [assignmentId, requestId]
  );
  for (const row of rows) {
    await db.query("UPDATE maalem_reviews SET status = 'published' WHERE id = ?", [row.id]);
    await db.query(
      `INSERT INTO maalem_review_history (review_id, event_type, old_status, new_status, actor_type, actor_name)
       VALUES (?, 'PUBLISHED_ON_CLOSURE', 'pending', 'published', 'SYSTEM', 'Clôture de la mission')`,
      [row.id]
    );
    await db.query('UPDATE maalem_profiles SET updated_at = NOW() WHERE id = ?', [row.maalem_profile_id]);
  }
  return rows.length;
}

/** The customer's own review of a request (any status), as their request screen shows it. */
export async function ownRequestReview(db, requestId, contactId) {
  const [rows] = await db.query(
    `SELECT id, rating, comment, status, submitted_at FROM maalem_reviews
     WHERE service_request_id = ? AND customer_contact_id = ? AND deleted_at IS NULL LIMIT 1`,
    [requestId, contactId]
  );
  const row = rows[0];
  return row ? { id: Number(row.id), rating: Number(row.rating), comment: row.comment ?? null, status: row.status, submitted_at: row.submitted_at } : null;
}
