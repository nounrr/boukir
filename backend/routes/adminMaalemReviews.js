import { Router } from 'express';
import pool, { requestContext } from '../db/pool.js';
import {
  REVIEW_PERMISSION,
  normalizeMaalemReviewPermissions,
  requireMaalemReviewPermission,
} from '../utils/maalemReviewPermissions.js';

const router = Router();
const STATUSES = new Set(['pending', 'published', 'hidden', 'rejected']);
const REASON_CODES = new Set([
  'INSULTS', 'HATE_SPEECH', 'PERSONAL_DATA', 'SPAM', 'OFF_TOPIC',
  'THREAT', 'SUSPECTED_FRAUD', 'ONGOING_DISPUTE', 'OTHER',
]);
const ACTIONS = Object.freeze({
  publish: { permission: REVIEW_PERMISSION.MODERATE, targets: new Set(['pending']), next: 'published', event: 'PUBLISHED' },
  hide: { permission: REVIEW_PERMISSION.MODERATE, targets: new Set(['pending', 'published']), next: 'hidden', event: 'HIDDEN', reason: true },
  reject: { permission: REVIEW_PERMISSION.MODERATE, targets: new Set(['pending', 'published', 'hidden']), next: 'rejected', event: 'REJECTED', reason: true },
  restore: { permission: REVIEW_PERMISSION.RESTORE, targets: new Set(['hidden']), next: 'published', event: 'RESTORED' },
});

function positiveInt(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function boundedInt(value, fallback, min, max) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}

function cleanText(value, max) {
  if (value == null) return null;
  const text = String(value).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function parseBooleanFilter(value) {
  if (value == null || value === '') return null;
  if (value === true || value === 'true' || value === '1' || value === 1) return true;
  if (value === false || value === 'false' || value === '0' || value === 0) return false;
  return undefined;
}

function maskReview(row, canViewPrivate) {
  return {
    id: Number(row.id),
    reference: `MR-${String(row.id).padStart(6, '0')}`,
    service_request_id: Number(row.service_request_id),
    request_number: row.request_number,
    customer_contact_id: canViewPrivate ? Number(row.customer_contact_id) : null,
    customer_name: canViewPrivate ? row.customer_name : null,
    maalem_profile_id: Number(row.maalem_profile_id),
    maalem_name: row.maalem_name,
    rating: Number(row.rating),
    comment: canViewPrivate ? row.comment : null,
    has_comment: Boolean(row.has_comment ?? row.comment),
    private_details_masked: !canViewPrivate,
    status: row.status,
    city: row.city ?? null,
    submitted_at: row.submitted_at,
    moderated_at: row.moderated_at ?? null,
    moderator_name: row.moderator_name ?? null,
    moderation_reason_code: canViewPrivate ? row.moderation_reason_code ?? null : null,
    moderation_reason: canViewPrivate ? row.moderation_reason ?? null : null,
    moderation_version: Number(row.moderation_version || 0),
    report_count: Number(row.report_count || 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

router.get('/permissions/me', (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json(normalizeMaalemReviewPermissions(req.user));
});

router.use(requireMaalemReviewPermission(REVIEW_PERMISSION.VIEW));

router.get('/filters', async (req, res, next) => {
  try {
    const permissions = normalizeMaalemReviewPermissions(req.user);
    const [maalemsResult, citiesResult, clientsResult] = await Promise.all([
      pool.query(`SELECT DISTINCT mp.id, mc.nom_complet AS name
        FROM maalem_reviews mr INNER JOIN maalem_profiles mp ON mp.id = mr.maalem_profile_id
        INNER JOIN contacts mc ON mc.id = mp.contact_id
        WHERE mr.deleted_at IS NULL ORDER BY mc.nom_complet, mp.id`),
      pool.query(`SELECT DISTINCT sr.city FROM maalem_reviews mr
        INNER JOIN service_requests sr ON sr.id = mr.service_request_id
        WHERE mr.deleted_at IS NULL AND NULLIF(TRIM(sr.city), '') IS NOT NULL ORDER BY sr.city`),
      permissions.view_private_details
        ? pool.query(`SELECT DISTINCT c.id, c.nom_complet AS name FROM maalem_reviews mr
            INNER JOIN contacts c ON c.id = mr.customer_contact_id
            WHERE mr.deleted_at IS NULL ORDER BY c.nom_complet, c.id`)
        : Promise.resolve([[]]),
    ]);
    res.set('Cache-Control', 'no-store');
    return res.json({
      statuses: [...STATUSES], ratings: [1, 2, 3, 4, 5],
      maalems: maalemsResult[0].map((row) => ({ id: Number(row.id), name: row.name })),
      cities: citiesResult[0].map((row) => row.city),
      clients: clientsResult[0].map((row) => ({ id: Number(row.id), name: row.name })),
    });
  } catch (error) { return next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    const permissions = normalizeMaalemReviewPermissions(req.user);
    const page = boundedInt(req.query.page, 1, 1, 1000000);
    const limit = boundedInt(req.query.limit, 25, 1, 100);
    const rating = req.query.rating == null || req.query.rating === '' ? null : boundedInt(req.query.rating, null, 1, 5);
    const maalemId = req.query.maalem_id ? positiveInt(req.query.maalem_id) : null;
    const clientId = req.query.client_id ? positiveInt(req.query.client_id) : null;
    const hasComment = parseBooleanFilter(req.query.has_comment);
    const reported = parseBooleanFilter(req.query.reported);
    const status = req.query.status ? String(req.query.status) : null;
    const q = cleanText(req.query.q, 150);
    const requestNumber = cleanText(req.query.request_number, 100);
    const city = cleanText(req.query.city, 100);
    const dateFrom = cleanText(req.query.date_from, 10);
    const dateTo = cleanText(req.query.date_to, 10);
    if (!page || !limit || (req.query.rating && !rating) || (req.query.maalem_id && !maalemId)
      || (req.query.client_id && !clientId) || hasComment === undefined || reported === undefined
      || (status && !STATUSES.has(status))
      || (dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom))
      || (dateTo && !/^\d{4}-\d{2}-\d{2}$/.test(dateTo))) {
      return res.status(400).json({ message: 'Filtres invalides' });
    }
    if (!permissions.view_private_details && (clientId || req.query.client_id)) {
      return res.status(403).json({ message: 'Le filtre client nécessite review.view_private_details' });
    }

    const conditions = ['mr.deleted_at IS NULL'];
    const params = [];
    if (status) { conditions.push('mr.status = ?'); params.push(status); }
    if (rating) { conditions.push('mr.rating = ?'); params.push(rating); }
    if (maalemId) { conditions.push('mr.maalem_profile_id = ?'); params.push(maalemId); }
    if (clientId) { conditions.push('mr.customer_contact_id = ?'); params.push(clientId); }
    if (requestNumber) { conditions.push('sr.request_number LIKE ?'); params.push(`%${requestNumber}%`); }
    if (city) { conditions.push('sr.city = ?'); params.push(city); }
    if (dateFrom) { conditions.push('mr.submitted_at >= ?'); params.push(`${dateFrom} 00:00:00`); }
    if (dateTo) { conditions.push('mr.submitted_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(`${dateTo} 00:00:00`); }
    if (hasComment !== null) conditions.push(hasComment ? "NULLIF(TRIM(mr.comment), '') IS NOT NULL" : "NULLIF(TRIM(mr.comment), '') IS NULL");
    if (reported !== null) conditions.push(`${reported ? '' : 'NOT '}EXISTS (SELECT 1 FROM maalem_review_cases mrc WHERE mrc.review_id = mr.id AND mrc.deleted_at IS NULL)`);
    if (q) {
      const searchable = [
        'CAST(mr.id AS CHAR) LIKE ?',
        "CONCAT('MR-', LPAD(mr.id, 6, '0')) LIKE ?",
        'sr.request_number LIKE ?',
        'mc.nom_complet LIKE ?',
      ];
      if (permissions.view_private_details) searchable.push('c.nom_complet LIKE ?', 'mr.comment LIKE ?');
      conditions.push(`(${searchable.join(' OR ')})`);
      params.push(...Array(searchable.length).fill(`%${q}%`));
    }
    const fromSql = `FROM maalem_reviews mr
      INNER JOIN service_requests sr ON sr.id = mr.service_request_id
      INNER JOIN contacts c ON c.id = mr.customer_contact_id
      INNER JOIN maalem_profiles mp ON mp.id = mr.maalem_profile_id
      INNER JOIN contacts mc ON mc.id = mp.contact_id
      LEFT JOIN employees moderator ON moderator.id = mr.moderated_by
      WHERE ${conditions.join(' AND ')}`;
    const [[countRow]] = await pool.query(`SELECT COUNT(*) AS total ${fromSql}`, params);
    const offset = (page - 1) * limit;
    const privateSelect = permissions.view_private_details
      ? 'c.nom_complet AS customer_name, mr.comment'
      : 'NULL AS customer_name, NULL AS comment';
    const [rows] = await pool.query(
      `SELECT mr.id, mr.service_request_id, sr.request_number, mr.customer_contact_id,
              ${privateSelect}, NULLIF(TRIM(mr.comment), '') IS NOT NULL AS has_comment,
              mr.maalem_profile_id, mc.nom_complet AS maalem_name,
              mr.rating, mr.status, sr.city, mr.submitted_at, mr.moderated_at,
              moderator.nom_complet AS moderator_name, mr.moderation_reason_code,
              mr.moderation_reason, mr.moderation_version, mr.created_at, mr.updated_at,
              (SELECT COUNT(*) FROM maalem_review_cases mrc
               WHERE mrc.review_id = mr.id AND mrc.deleted_at IS NULL) AS report_count
       ${fromSql} ORDER BY mr.submitted_at DESC, mr.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.set('Cache-Control', 'no-store');
    return res.json({ reviews: rows.map((row) => maskReview(row, permissions.view_private_details)), page, limit, total: Number(countRow?.total || 0) });
  } catch (error) { return next(error); }
});

router.get('/:id(\\d+)', async (req, res, next) => {
  try {
    const id = positiveInt(req.params.id);
    const permissions = normalizeMaalemReviewPermissions(req.user);
    const privateSelect = permissions.view_private_details
      ? 'c.nom_complet AS customer_name, c.telephone AS customer_phone, c.email AS customer_email, mr.comment'
      : 'NULL AS customer_name, NULL AS customer_phone, NULL AS customer_email, NULL AS comment';
    const [rows] = await pool.query(
      `SELECT mr.*, sr.request_number, sr.city, ${privateSelect},
              NULLIF(TRIM(mr.comment), '') IS NOT NULL AS has_comment,
              mc.nom_complet AS maalem_name, moderator.nom_complet AS moderator_name,
              (SELECT COUNT(*) FROM maalem_review_cases mrc WHERE mrc.review_id = mr.id AND mrc.deleted_at IS NULL) AS report_count
       FROM maalem_reviews mr
       INNER JOIN service_requests sr ON sr.id = mr.service_request_id
       INNER JOIN contacts c ON c.id = mr.customer_contact_id
       INNER JOIN maalem_profiles mp ON mp.id = mr.maalem_profile_id
       INNER JOIN contacts mc ON mc.id = mp.contact_id
       LEFT JOIN employees moderator ON moderator.id = mr.moderated_by
       WHERE mr.id = ? AND mr.deleted_at IS NULL LIMIT 1`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Avis introuvable' });
    const review = maskReview(rows[0], permissions.view_private_details);
    if (permissions.view_private_details) {
      review.customer_phone = rows[0].customer_phone ?? null;
      review.customer_email = rows[0].customer_email ?? null;
      review.moderation_internal_note = rows[0].moderation_internal_note ?? null;
    }
    res.set('Cache-Control', 'no-store');
    return res.json({ review, permissions });
  } catch (error) { return next(error); }
});

router.get('/:id(\\d+)/history', requireMaalemReviewPermission(REVIEW_PERMISSION.VIEW_PRIVATE_DETAILS), async (req, res, next) => {
  try {
    const id = positiveInt(req.params.id);
    const [reviewRows] = await pool.query('SELECT id FROM maalem_reviews WHERE id = ? AND deleted_at IS NULL LIMIT 1', [id]);
    if (!reviewRows[0]) return res.status(404).json({ message: 'Avis introuvable' });
    const [rows] = await pool.query(
      `SELECT id, event_type, old_rating, new_rating, old_comment, new_comment,
              old_status, new_status, reason, reason_code, internal_note,
              technical_metadata, actor_type, actor_employee_id, actor_name, created_at
       FROM maalem_review_history WHERE review_id = ? ORDER BY created_at DESC, id DESC`,
      [id]
    );
    res.set('Cache-Control', 'no-store');
    return res.json({ history: rows });
  } catch (error) { return next(error); }
});

function moderationHandler(actionName) {
  const action = ACTIONS[actionName];
  return async (req, res, next) => {
    const id = positiveInt(req.params.id);
    const expectedStatus = String(req.body?.expected_status || '');
    const expectedVersion = boundedInt(req.body?.expected_version, null, 0, 2147483647);
    const reasonCode = cleanText(req.body?.reason_code, 50)?.toUpperCase() || null;
    const explanation = cleanText(req.body?.explanation, 500);
    const internalNote = cleanText(req.body?.internal_note, 1000);
    if (!id || !STATUSES.has(expectedStatus) || expectedVersion == null) {
      return res.status(400).json({ message: 'État ou version de modération invalide' });
    }
    if (action.reason && (!reasonCode || !REASON_CODES.has(reasonCode))) {
      return res.status(422).json({ message: 'Un motif de modération valide est obligatoire' });
    }
    if (action.reason && reasonCode === 'OTHER' && !explanation) {
      return res.status(422).json({ message: 'Une explication est obligatoire pour le motif « autre »' });
    }
    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      const [rows] = await connection.query(
        `SELECT id, service_request_id, maalem_profile_id, rating, comment, status,
                moderation_version FROM maalem_reviews
         WHERE id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,
        [id]
      );
      const review = rows[0];
      if (!review) {
        const error = new Error('Avis introuvable'); error.status = 404; throw error;
      }
      if (review.status !== expectedStatus || Number(review.moderation_version || 0) !== expectedVersion) {
        const error = new Error('Cet avis a déjà été modéré. Rechargez les données.'); error.status = 409; error.code = 'STALE_REVIEW'; throw error;
      }
      if (!action.targets.has(review.status)) {
        const error = new Error(`Transition ${review.status} → ${action.next} interdite`); error.status = 409; error.code = 'INVALID_TRANSITION'; throw error;
      }
      const [employees] = await connection.query(
        'SELECT id, nom_complet FROM employees WHERE id = ? AND deleted_at IS NULL LIMIT 1',
        [Number(req.user.id)]
      );
      const employee = employees[0];
      if (!employee) { const error = new Error('Employé introuvable'); error.status = 403; throw error; }
      const hide = action.next === 'hidden' || action.next === 'rejected';
      await connection.query(
        `UPDATE maalem_reviews
         SET status = ?, moderated_at = NOW(), moderated_by = ?,
             moderation_reason_code = ?, moderation_reason = ?, moderation_internal_note = ?,
             hidden_at = ${hide ? 'COALESCE(hidden_at, NOW())' : 'NULL'}, hidden_by = ${hide ? '?' : 'NULL'},
             moderation_version = moderation_version + 1, updated_at = NOW()
         WHERE id = ? AND status = ? AND moderation_version = ? AND deleted_at IS NULL`,
        hide
          ? [action.next, employee.id, action.reason ? reasonCode : null, action.reason ? explanation : null, internalNote, employee.id, id, expectedStatus, expectedVersion]
          : [action.next, employee.id, null, null, internalNote, id, expectedStatus, expectedVersion]
      );
      const technicalMetadata = JSON.stringify({ request_id: requestContext.getStore()?.requestId || null });
      await connection.query(
        `INSERT INTO maalem_review_history
           (review_id, event_type, old_rating, new_rating, old_comment, new_comment,
            old_status, new_status, reason, reason_code, internal_note, technical_metadata,
            actor_type, actor_employee_id, actor_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EMPLOYEE', ?, ?)`,
        [id, action.event, review.rating, review.rating, review.comment, review.comment,
          review.status, action.next, action.reason ? explanation : null,
          action.reason ? reasonCode : null, internalNote, technicalMetadata,
          employee.id, employee.nom_complet || `Employé #${employee.id}`]
      );
      await connection.query('UPDATE maalem_profiles SET updated_at = NOW() WHERE id = ?', [Number(review.maalem_profile_id)]);
      await connection.commit();
      res.set('Cache-Control', 'no-store');
      return res.json({ review: { id, status: action.next, moderation_version: expectedVersion + 1 }, cache_invalidated: true });
    } catch (error) {
      if (connection) await connection.rollback().catch(() => {});
      return next(error);
    } finally { connection?.release(); }
  };
}

for (const [actionName, action] of Object.entries(ACTIONS)) {
  router.post(`/:id(\\d+)/${actionName}`, requireMaalemReviewPermission(action.permission), moderationHandler(actionName));
}

export default router;
