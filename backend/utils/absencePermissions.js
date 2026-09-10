import { normalizePermissionFlag } from './clientCollaborationPermissions.js';

// Deux droits distincts, accordes par le PDG depuis la page des absences :
//  - gestion    : marquer, modifier et supprimer les absences
//  - statistiques : consulter la page de statistiques d'absences
export const ABSENCE_PERMISSIONS_DENIED = Object.freeze({
  gestion: false,
  statistiques: false,
});

export function normalizeAbsencePermissions(user) {
  if (!user?.role || user?.type_compte != null) return { ...ABSENCE_PERMISSIONS_DENIED };
  if (user.role === 'PDG') return { gestion: true, statistiques: true };
  return {
    gestion: normalizePermissionFlag(user.acces_gestion_absences),
    statistiques: normalizePermissionFlag(user.acces_statistiques_absences),
  };
}

export function parseStrictAbsencePermissions(body) {
  const gestion = body?.gestion;
  const statistiques = body?.statistiques;
  if (typeof gestion !== 'boolean' || typeof statistiques !== 'boolean') {
    return { valid: false, error: 'Les permissions gestion et statistiques doivent être des booléens.' };
  }
  return { valid: true, permissions: { gestion, statistiques } };
}

export function hasAbsencePermission(user, permission) {
  return Boolean(normalizeAbsencePermissions(user)[permission]);
}

// Guard Express. `gestion` implique aussi la lecture des absences ; la
// consultation de la liste est donc ouverte aux deux droits via 'any'.
export function requireAbsencePermission(permission) {
  return function absencePermissionGuard(req, res, next) {
    const permissions = normalizeAbsencePermissions(req.user);
    const allowed = permission === 'any'
      ? permissions.gestion || permissions.statistiques
      : permissions[permission];
    if (!allowed) {
      return res.status(403).json({ message: 'Permission de gestion des absences insuffisante', permission });
    }
    return next();
  };
}
