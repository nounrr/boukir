import pool from '../db/pool.js';
import { normalizePermissionFlag } from './clientCollaborationPermissions.js';

// Deux niveaux distincts pour le fond de caisse :
//  - ouverture : saisir uniquement le fond initial de la caisse (montant, mode,
//                date/heure) sans voir les entrées, calculs ni détails.
//  - gestion   : tout le reste (tables, mouvements, coffre, transferts,
//                suppressions, détails journaliers, autorisations).
// Seul le PDG possède `gestion` ; `ouverture` est accordée par le PDG à des
// employés choisis depuis la page Fond de caisse.
export const FOND_CAISSE_PERMISSIONS_DENIED = Object.freeze({
  ouverture: false,
  gestion: false,
});

export function normalizeFondCaissePermissions(user) {
  if (!user?.role || user?.type_compte != null) return { ...FOND_CAISSE_PERMISSIONS_DENIED };
  if (user.role === 'PDG') return { ouverture: true, gestion: true };
  return {
    ouverture: normalizePermissionFlag(user.acces_ouverture_fond_caisse),
    gestion: false,
  };
}

export function parseStrictFondCaissePermissions(body) {
  const ouverture = body?.ouverture;
  if (typeof ouverture !== 'boolean') {
    return { valid: false, error: 'La permission ouverture doit être un booléen.' };
  }
  return { valid: true, permissions: { ouverture } };
}

export function hasFondCaissePermission(user, permission) {
  return Boolean(normalizeFondCaissePermissions(user)[permission]);
}

// Guard Express : `gestion` implique aussi `ouverture`.
export function requireFondCaissePermission(permission) {
  return function fondCaissePermissionGuard(req, res, next) {
    const permissions = normalizeFondCaissePermissions(req.user);
    const allowed = permission === 'ouverture'
      ? permissions.ouverture || permissions.gestion
      : permissions[permission];
    if (!allowed) {
      return res.status(403).json({ message: 'Accès au fond de caisse insuffisant', permission });
    }
    return next();
  };
}

const ensureState = { done: false, inFlight: null };

// Ajoute la colonne d'autorisation si la migration n'a pas encore été jouée,
// afin que la requête de validation du compte (middleware auth) ne casse pas.
export async function ensureFondCaissePermissionSchema(db = pool) {
  if (ensureState.done) return;
  if (ensureState.inFlight) {
    await ensureState.inFlight;
    return;
  }
  ensureState.inFlight = (async () => {
    const [columns] = await db.query(
      "SHOW COLUMNS FROM employees LIKE 'acces_ouverture_fond_caisse'"
    );
    if (!columns || columns.length === 0) {
      await db.query(
        'ALTER TABLE employees ADD COLUMN acces_ouverture_fond_caisse TINYINT(1) NOT NULL DEFAULT 0'
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
