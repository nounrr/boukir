export const MAALEM_REVIEW_STATUS = Object.freeze({
  PENDING: 'pending',
  PUBLISHED: 'published',
  HIDDEN: 'hidden',
  REJECTED: 'rejected',
});

export const MAALEM_REVIEW_LIMITS = Object.freeze({
  ratingMin: 1,
  ratingMax: 5,
  commentMin: 10,
  commentMax: 1500,
});

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export const PUBLIC_MAALEM_REVIEW_AGGREGATE_SQL = `LEFT JOIN (
  SELECT mr.maalem_profile_id,
         COUNT(*) AS review_count,
         ROUND(AVG(mr.rating), 2) AS average_rating,
         SUM(mr.rating = 1) AS rating_1,
         SUM(mr.rating = 2) AS rating_2,
         SUM(mr.rating = 3) AS rating_3,
         SUM(mr.rating = 4) AS rating_4,
         SUM(mr.rating = 5) AS rating_5
  FROM maalem_reviews mr
  INNER JOIN service_requests sr
    ON sr.id = mr.service_request_id AND sr.requester_contact_id = mr.customer_contact_id
  INNER JOIN service_interventions si
    ON si.id = mr.intervention_id AND si.service_request_id = sr.id
  INNER JOIN service_request_assignments sra
    ON sra.id = si.executing_assignment_id
   AND sra.service_request_id = sr.id
   AND sra.maalem_profile_id = mr.maalem_profile_id
  INNER JOIN maalem_profiles review_mp ON review_mp.id = mr.maalem_profile_id
  WHERE mr.status = 'published' AND mr.hidden_at IS NULL AND mr.deleted_at IS NULL
    AND sr.request_source IN ('selected_maalem', 'selected_service')
    AND sr.status = 'closed' AND sr.cancelled_at IS NULL AND sr.deleted_at IS NULL
    AND si.status = 'closed' AND si.closed_at IS NOT NULL
    AND si.closed_by_employee_id IS NOT NULL AND si.completed_at IS NOT NULL
    AND si.completed_by_contact_id = review_mp.contact_id
    AND si.executing_assignment_id IS NOT NULL
  GROUP BY mr.maalem_profile_id
) review_stats ON review_stats.maalem_profile_id = mp.id`;

export function anonymizePublicReviewAuthor(firstName, fullName) {
  const clean = (value) => String(value || '')
    .normalize('NFC')
    .replace(/[<>\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const rawFirstName = String(firstName || '');
  const preferred = /[<>]/.test(rawFirstName) ? '' : clean(rawFirstName).split(' ')[0];
  if (preferred) return preferred.slice(0, 40);
  const fallback = clean(fullName);
  const initial = Array.from(fallback)[0]?.toLocaleUpperCase();
  return initial ? `${initial}.` : null;
}

export async function getPublishedMaalemReviews(db, maalemProfileId, { page = 1, perPage = 6 } = {}) {
  const profileId = positiveId(maalemProfileId);
  if (!profileId) throw new TypeError('Identifiant Maalem invalide');
  const currentPage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const pageSize = Number.isSafeInteger(perPage) && perPage >= 1 && perPage <= 20 ? perPage : 6;
  const joins = `FROM maalem_reviews mr
    INNER JOIN service_requests sr
      ON sr.id = mr.service_request_id AND sr.requester_contact_id = mr.customer_contact_id
    INNER JOIN service_interventions si
      ON si.id = mr.intervention_id AND si.service_request_id = sr.id
    INNER JOIN service_request_assignments sra
      ON sra.id = si.executing_assignment_id
     AND sra.service_request_id = sr.id
     AND sra.maalem_profile_id = mr.maalem_profile_id
    INNER JOIN maalem_profiles mp ON mp.id = mr.maalem_profile_id
    INNER JOIN contacts provider ON provider.id = mp.contact_id
    INNER JOIN maalem_categories mc ON mc.id = mp.category_id
    INNER JOIN contacts customer ON customer.id = mr.customer_contact_id`;
  const where = `WHERE mr.maalem_profile_id = ?
    AND mr.status = 'published' AND mr.hidden_at IS NULL AND mr.deleted_at IS NULL
    AND sr.request_source IN ('selected_maalem', 'selected_service')
    AND sr.status = 'closed' AND sr.cancelled_at IS NULL AND sr.deleted_at IS NULL
    AND si.status = 'closed' AND si.closed_at IS NOT NULL
    AND si.closed_by_employee_id IS NOT NULL AND si.completed_at IS NOT NULL
    AND si.completed_by_contact_id = mp.contact_id AND si.executing_assignment_id IS NOT NULL
    AND mp.is_public = 1 AND mp.status = 'approved' AND mp.deleted_at IS NULL
    AND provider.deleted_at IS NULL AND provider.is_active = 1 AND COALESCE(provider.is_blocked, 0) = 0
    AND mc.is_active = 1 AND mc.deleted_at IS NULL`;
  const [[countRow]] = await db.query(`SELECT COUNT(*) AS total ${joins} ${where}`, [profileId]);
  const totalItems = Number(countRow?.total || 0);
  const totalPages = totalItems ? Math.ceil(totalItems / pageSize) : 0;
  const resolvedPage = totalPages ? Math.min(currentPage, totalPages) : 1;
  const offset = (resolvedPage - 1) * pageSize;
  const [rows] = await db.query(
    `SELECT mr.rating, mr.comment, mr.submitted_at,
            customer.prenom AS author_first_name, customer.nom_complet AS author_full_name
     ${joins} ${where}
     ORDER BY mr.submitted_at DESC, mr.id DESC LIMIT ? OFFSET ?`,
    [profileId, pageSize, offset]
  );
  return {
    reviews: rows.map((row) => ({
      rating: Number(row.rating),
      comment: row.comment ?? null,
      submitted_at: row.submitted_at,
      author_name: anonymizePublicReviewAuthor(row.author_first_name, row.author_full_name),
      verified_intervention: true,
    })),
    pagination: {
      current_page: resolvedPage, per_page: pageSize, total_items: totalItems,
      total_pages: totalPages, has_previous: resolvedPage > 1,
      has_next: resolvedPage < totalPages,
      from: totalItems ? offset + 1 : 0,
      to: totalItems ? Math.min(offset + rows.length, totalItems) : 0,
    },
  };
}

/**
 * Reviews are plain text. Remove HTML-looking fragments, angle brackets and
 * unsafe control characters before the value is validated and persisted.
 */
export function sanitizeMaalemReviewComment(value) {
  if (value == null) return null;
  const normalized = String(value)
    .normalize('NFC')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return normalized || null;
}

export function validateMaalemReviewInput(source = {}) {
  const rating = Number(source?.rating);
  const errors = {};
  if (!Number.isInteger(rating) || rating < MAALEM_REVIEW_LIMITS.ratingMin || rating > MAALEM_REVIEW_LIMITS.ratingMax) {
    errors.rating = 'La note doit être un entier entre 1 et 5';
  }

  const comment = sanitizeMaalemReviewComment(source?.comment);
  if (comment && comment.length < MAALEM_REVIEW_LIMITS.commentMin) {
    errors.comment = `Le commentaire doit contenir au moins ${MAALEM_REVIEW_LIMITS.commentMin} caractères`;
  } else if (comment && comment.length > MAALEM_REVIEW_LIMITS.commentMax) {
    errors.comment = `Le commentaire ne peut pas dépasser ${MAALEM_REVIEW_LIMITS.commentMax} caractères`;
  }

  if (Object.keys(errors).length) return { valid: false, errors };
  return { valid: true, value: { rating, comment } };
}

export function normalizeMaalemReview(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    service_request_id: Number(row.service_request_id),
    rating: Number(row.rating),
    comment: row.comment ?? null,
    status: row.status,
    submitted_at: row.submitted_at,
    created_at: row.created_at,
  };
}

/**
 * Public KAN-28 aggregate. Every counted row is revalidated through the
 * immutable executing assignment and the transactional KAN-19 closure.
 */
export async function getPublishedMaalemReviewStatistics(db, maalemProfileId) {
  const profileId = positiveId(maalemProfileId);
  if (!profileId) throw new TypeError('Identifiant Maalem invalide');

  const [rows] = await db.query(
    `SELECT COUNT(*) AS review_count,
            ROUND(AVG(mr.rating), 2) AS average_rating,
            SUM(mr.rating = 1) AS rating_1,
            SUM(mr.rating = 2) AS rating_2,
            SUM(mr.rating = 3) AS rating_3,
            SUM(mr.rating = 4) AS rating_4,
            SUM(mr.rating = 5) AS rating_5
     FROM maalem_reviews mr
     INNER JOIN service_requests sr
       ON sr.id = mr.service_request_id
      AND sr.requester_contact_id = mr.customer_contact_id
     INNER JOIN service_interventions si
       ON si.id = mr.intervention_id
      AND si.service_request_id = sr.id
     INNER JOIN service_request_assignments sra
       ON sra.id = si.executing_assignment_id
      AND sra.service_request_id = sr.id
      AND sra.maalem_profile_id = mr.maalem_profile_id
     INNER JOIN maalem_profiles mp ON mp.id = mr.maalem_profile_id
     WHERE mr.maalem_profile_id = ?
       AND mr.status = 'published'
       AND mr.hidden_at IS NULL
       AND mr.deleted_at IS NULL
       AND sr.request_source IN ('selected_maalem', 'selected_service')
       AND sr.status = 'closed'
       AND sr.cancelled_at IS NULL
       AND sr.deleted_at IS NULL
       AND si.status = 'closed'
       AND si.closed_at IS NOT NULL
       AND si.closed_by_employee_id IS NOT NULL
       AND si.completed_at IS NOT NULL
       AND si.completed_by_contact_id = mp.contact_id
       AND si.executing_assignment_id IS NOT NULL`,
    [profileId]
  );

  const row = rows[0] || {};
  const reviewCount = Number(row.review_count || 0);
  return {
    average_rating: reviewCount ? Number(row.average_rating || 0) : null,
    review_count: reviewCount,
    rating_distribution: {
      1: Number(row.rating_1 || 0),
      2: Number(row.rating_2 || 0),
      3: Number(row.rating_3 || 0),
      4: Number(row.rating_4 || 0),
      5: Number(row.rating_5 || 0),
    },
  };
}
