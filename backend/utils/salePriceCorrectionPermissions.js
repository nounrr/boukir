import pool from '../db/pool.js';
import { normalizePermissionFlag } from './clientCollaborationPermissions.js';

const ELIGIBLE_ROLES = new Set(['ManagerPlus', 'Manager', 'Employé', 'Chauffeur']);

export function canAccessSalePriceCorrections(user) {
  if (user?.type_compte != null || !user?.role) return false;
  if (user.role === 'PDG') return true;
  return ELIGIBLE_ROLES.has(user.role)
    && normalizePermissionFlag(user.acces_correction_prix_vente);
}

export function requireSalePriceCorrectionAccess(req, res, next) {
  if (!canAccessSalePriceCorrections(req.user)) {
    return res.status(403).json({ message: 'Accès à la correction des prix de vente non autorisé.' });
  }
  return next();
}

const ensureState = { done: false, inFlight: null };

export async function ensureSalePriceCorrectionPermissionSchema(db = pool) {
  if (ensureState.done) return;
  if (ensureState.inFlight) return ensureState.inFlight;
  ensureState.inFlight = (async () => {
    const [columns] = await db.query(
      "SHOW COLUMNS FROM employees LIKE 'acces_correction_prix_vente'"
    );
    if (!columns.length) {
      try {
        await db.query(
          'ALTER TABLE employees ADD COLUMN acces_correction_prix_vente TINYINT(1) NOT NULL DEFAULT 0'
        );
      } catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
      }
    }
    ensureState.done = true;
  })();
  try {
    await ensureState.inFlight;
  } finally {
    ensureState.inFlight = null;
  }
}
