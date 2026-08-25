import { Router } from 'express';
import pool from '../db/pool.js';
import { isEcommerceRequester } from '../utils/serviceRequest.js';
import {
  MAALEM_REVIEW_LIMITS,
  MAALEM_REVIEW_STATUS,
  normalizeMaalemReview,
  validateMaalemReviewInput,
} from '../utils/maalemReview.js';
import { markReviewInvitationSubmitted } from '../utils/reviewInvitation.js';

const router = Router();

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function fail(status, message, code, errors) {
  const error = new Error(message);
  error.status = status;
  error.publicCode = code;
  if (errors) error.errors = errors;
  throw error;
}

function requireEcommerceRequester(req, res, next) {
  if (!isEcommerceRequester(req.user)) {
    return res.status(403).json({
      message: 'Compte e-commerce authentifié requis',
      error_type: 'ECOMMERCE_ACCOUNT_REQUIRED',
    });
  }
  return next();
}

async function loadOwnedReviewContext(db, requestId, contactId, forUpdate = false) {
  const [rows] = await db.query(
    `SELECT sr.id AS service_request_id, sr.request_number,
            sr.requester_contact_id, sr.request_source,
            sr.status AS request_status, sr.cancelled_at, sr.deleted_at AS request_deleted_at,
            customer.nom_complet AS customer_name,
            si.id AS intervention_id, si.status AS intervention_status,
            si.closed_at, si.closed_by_employee_id, si.completed_at,
            si.completed_by_contact_id, si.executing_assignment_id,
            sra.maalem_profile_id, mp.contact_id AS maalem_contact_id,
            maalem.nom_complet AS maalem_public_name
     FROM service_requests sr
     INNER JOIN contacts customer ON customer.id = sr.requester_contact_id
     LEFT JOIN service_interventions si ON si.service_request_id = sr.id
     LEFT JOIN service_request_assignments sra
       ON sra.id = si.executing_assignment_id
      AND sra.service_request_id = sr.id
     LEFT JOIN maalem_profiles mp ON mp.id = sra.maalem_profile_id
     LEFT JOIN contacts maalem ON maalem.id = mp.contact_id
     WHERE sr.id = ? AND sr.requester_contact_id = ?
     LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [requestId, contactId]
  );
  return rows[0] || null;
}

async function loadActiveReview(db, requestId, forUpdate = false) {
  const [rows] = await db.query(
    `SELECT id, service_request_id, rating, comment, status, submitted_at, created_at
     FROM maalem_reviews
     WHERE service_request_id = ? AND deleted_at IS NULL
     LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [requestId]
  );
  return rows[0] || null;
}

function reviewEligibility(context, existingReview) {
  if (existingReview) return { eligible: false, reason: 'ALREADY_REVIEWED' };
  if (!['selected_maalem', 'selected_service'].includes(context.request_source)) {
    return { eligible: false, reason: 'UNSUPPORTED_REQUEST_TYPE' };
  }
  if (context.request_deleted_at || context.cancelled_at || context.request_status !== 'closed') {
    return { eligible: false, reason: 'REQUEST_NOT_CLOSED' };
  }
  if (
    !context.intervention_id
    || context.intervention_status !== 'closed'
    || !context.closed_at
    || !context.closed_by_employee_id
    || !context.completed_at
  ) {
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

function publicContext(context, existingReview) {
  const eligibility = reviewEligibility(context, existingReview);
  return {
    ...eligibility,
    request: {
      id: Number(context.service_request_id),
      request_number: context.request_number,
      status: context.request_status,
    },
    maalem: context.maalem_profile_id ? {
      id: Number(context.maalem_profile_id),
      public_name: context.maalem_public_name || `Maalem #${context.maalem_profile_id}`,
    } : null,
    review: normalizeMaalemReview(existingReview),
    constraints: {
      rating_min: MAALEM_REVIEW_LIMITS.ratingMin,
      rating_max: MAALEM_REVIEW_LIMITS.ratingMax,
      comment_min: MAALEM_REVIEW_LIMITS.commentMin,
      comment_max: MAALEM_REVIEW_LIMITS.commentMax,
      comment_required: false,
      editable_after_publication: false,
    },
  };
}

router.use(requireEcommerceRequester);

router.get('/:id(\\d+)/review', async (req, res, next) => {
  try {
    const requestId = positiveId(req.params.id);
    if (!requestId) return res.status(400).json({ message: 'Demande invalide' });
    const context = await loadOwnedReviewContext(pool, requestId, Number(req.user.id));
    if (!context) return res.status(404).json({ message: 'Demande introuvable' });
    const existingReview = await loadActiveReview(pool, requestId);
    res.set('Cache-Control', 'no-store');
    return res.json(publicContext(context, existingReview));
  } catch (error) {
    return next(error);
  }
});

router.post('/:id(\\d+)/review', async (req, res, next) => {
  const requestId = positiveId(req.params.id);
  if (!requestId) return res.status(400).json({ message: 'Demande invalide' });
  const validation = validateMaalemReviewInput(req.body);
  if (!validation.valid) {
    return res.status(422).json({ message: 'Avis invalide', errors: validation.errors });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const contactId = Number(req.user.id);
    const context = await loadOwnedReviewContext(connection, requestId, contactId, true);
    if (!context) fail(404, 'Demande introuvable', 'REQUEST_NOT_FOUND');
    const existingReview = await loadActiveReview(connection, requestId, true);
    const eligibility = reviewEligibility(context, existingReview);
    if (!eligibility.eligible) {
      fail(409, 'Cette intervention ne peut pas être évaluée', eligibility.reason);
    }

    const submittedAt = new Date();
    const [insert] = await connection.query(
      `INSERT INTO maalem_reviews
         (service_request_id, intervention_id, customer_contact_id, maalem_profile_id,
          rating, comment, status, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        requestId,
        Number(context.intervention_id),
        contactId,
        Number(context.maalem_profile_id),
        validation.value.rating,
        validation.value.comment,
        MAALEM_REVIEW_STATUS.PUBLISHED,
        submittedAt,
      ]
    );
    const reviewId = Number(insert.insertId);

    await connection.query(
      `INSERT INTO maalem_review_history
         (review_id, event_type, new_rating, new_comment, new_status,
          actor_type, actor_contact_id, actor_name)
       VALUES (?, 'CREATED', ?, ?, ?, 'CONTACT', ?, ?)`,
      [
        reviewId,
        validation.value.rating,
        validation.value.comment,
        MAALEM_REVIEW_STATUS.PUBLISHED,
        contactId,
        context.customer_name || `Client #${contactId}`,
      ]
    );

    await connection.query('UPDATE maalem_profiles SET updated_at = NOW() WHERE id = ?', [Number(context.maalem_profile_id)]);

    await markReviewInvitationSubmitted(connection, {
      serviceRequestId: requestId,
      customerContactId: contactId,
      reviewId,
      submittedAt,
    });

    await connection.commit();
    res.set('Cache-Control', 'no-store');
    return res.status(201).json({
      review: {
        id: reviewId,
        service_request_id: requestId,
        rating: validation.value.rating,
        comment: validation.value.comment,
        status: MAALEM_REVIEW_STATUS.PUBLISHED,
        submitted_at: submittedAt,
        created_at: submittedAt,
      },
    });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    if (error?.code === 'ER_DUP_ENTRY') {
      error.status = 409;
      error.publicCode = 'ALREADY_REVIEWED';
      error.message = 'Un avis existe déjà pour cette intervention';
    }
    return next(error);
  } finally {
    connection?.release();
  }
});

export default router;
