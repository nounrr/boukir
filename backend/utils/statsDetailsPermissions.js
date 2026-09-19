import pool from '../db/pool.js';
import { normalizePermissionFlag } from './clientCollaborationPermissions.js';

// Deux niveaux pour les statistiques détaillées (/reports/details) :
//  - consultation : ouvrir la page et lire les matrices produits / clients.
//  - gestion      : en plus, accorder ou retirer l'autorisation aux employés.
// Seul le PDG possède `gestion` ; `consultation` est accordée par le PDG à des
// employés choisis depuis la page Statistiques détaillées.
export const STATS_DETAILS_PERMISSIONS_DENIED = Object.freeze({
  consultation: false,
  gestion: false,
});

export function normalizeStatsDetailsPermissions(user) {
  if (!user?.role || user?.type_compte != null) return { ...STATS_DETAILS_PERMISSIONS_DENIED };
  if (user.role === 'PDG') return { consultation: true, gestion: true };
  return {
    consultation: normalizePermissionFlag(user.acces_statistiques_details),
    gestion: false,
  };
}

export function parseStrictStatsDetailsPermissions(body) {
  const consultation = body?.consultation;
  if (typeof consultation !== 'boolean') {
    return { valid: false, error: 'La permission consultation doit être un booléen.' };
  }
  return { valid: true, permissions: { consultation } };
}

export function hasStatsDetailsPermission(user, permission) {
  return Boolean(normalizeStatsDetailsPermissions(user)[permission]);
}

// Guard Express : `gestion` implique aussi `consultation`.
export function requireStatsDetailsPermission(permission) {
  return function statsDetailsPermissionGuard(req, res, next) {
    const permissions = normalizeStatsDetailsPermissions(req.user);
    const allowed = permission === 'consultation'
      ? permissions.consultation || permissions.gestion
      : permissions[permission];
    if (!allowed) {
      return res.status(403).json({
        message: 'Accès aux statistiques détaillées réservé au PDG et aux employés autorisés.',
        permission,
      });
    }
    return next();
  };
}

const ensureState = { done: false, inFlight: null };

// Ajoute la colonne d'autorisation si la migration n'a pas encore été jouée,
// afin que la requête de validation du compte (middleware auth) ne casse pas.
export async function ensureStatsDetailsPermissionSchema(db = pool) {
  if (ensureState.done) return;
  if (ensureState.inFlight) {
    await ensureState.inFlight;
    return;
  }
  ensureState.inFlight = (async () => {
    const [columns] = await db.query(
      "SHOW COLUMNS FROM employees LIKE 'acces_statistiques_details'"
    );
    if (!columns || columns.length === 0) {
      await db.query(
        'ALTER TABLE employees ADD COLUMN acces_statistiques_details TINYINT(1) NOT NULL DEFAULT 0'
      );
    }
    ensureState.done = true;
  })();
  try {
    await ensureState.inFlight;
  } finally {
    ensureState.inFlight = null;
  }
}
