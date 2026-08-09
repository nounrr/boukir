import pool from '../db/pool.js';
import {
  MAALEM_ACCESS_ERROR_TYPE,
  buildMaalemAccessDecision,
} from '../utils/maalemAccess.js';

export async function resolveCurrentMaalemAccess(req, db = pool) {
  const contactId = Number(req.user?.id);
  const isEcommerceContact = Number.isSafeInteger(contactId)
    && contactId > 0
    && !req.user?.role
    && req.user?.type_compte != null;

  if (!isEcommerceContact) return buildMaalemAccessDecision(null);

  const [rows] = await db.query(
    `SELECT id, contact_id, status
     FROM maalem_profiles
     WHERE contact_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [contactId]
  );
  return buildMaalemAccessDecision(rows[0] || null);
}

export async function requireApprovedMaalem(req, res, next) {
  try {
    const access = await resolveCurrentMaalemAccess(req);
    req.maalemAccess = access;
    if (!access.allowed) {
      return res.status(403).json({
        message: 'Dossier Maalem validé requis pour accéder à cette fonctionnalité',
        error_type: MAALEM_ACCESS_ERROR_TYPE,
        reason: access.reason,
        maalem_status: access.status,
      });
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

