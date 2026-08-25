import { normalizePermissionFlag } from './clientCollaborationPermissions.js';

export const REVIEW_PERMISSION = Object.freeze({
  VIEW: 'review.view',
  MODERATE: 'review.moderate',
  RESTORE: 'review.restore',
  VIEW_PRIVATE_DETAILS: 'review.view_private_details',
});

export const REVIEW_PERMISSIONS_DENIED = Object.freeze({
  view: false,
  moderate: false,
  restore: false,
  view_private_details: false,
});

export function normalizeMaalemReviewPermissions(user) {
  if (!user?.role || user?.type_compte != null) return { ...REVIEW_PERMISSIONS_DENIED };
  if (user.role === 'PDG') {
    return { view: true, moderate: true, restore: true, view_private_details: true };
  }
  if (!['Manager', 'ManagerPlus'].includes(user.role)) return { ...REVIEW_PERMISSIONS_DENIED };
  return {
    view: normalizePermissionFlag(user.acces_avis_maalem),
    moderate: normalizePermissionFlag(user.moderation_avis_maalem),
    restore: normalizePermissionFlag(user.restauration_avis_maalem),
    view_private_details: normalizePermissionFlag(user.details_prives_avis_maalem),
  };
}

export function parseStrictMaalemReviewPermissions(body) {
  const values = {
    view: body?.view,
    moderate: body?.moderate,
    restore: body?.restore,
    view_private_details: body?.view_private_details,
  };
  if (Object.values(values).some((value) => typeof value !== 'boolean')) {
    return { valid: false, error: 'Les quatre permissions d’avis Maalem doivent être des booléens.' };
  }
  if ((values.moderate || values.restore || values.view_private_details) && !values.view) {
    return { valid: false, error: 'La consultation des avis est requise pour les autres permissions.' };
  }
  return { valid: true, permissions: values };
}

export function hasMaalemReviewPermission(user, permission) {
  const permissions = normalizeMaalemReviewPermissions(user);
  const key = Object.entries(REVIEW_PERMISSION).find(([, value]) => value === permission)?.[0];
  const normalizedKey = key === 'VIEW_PRIVATE_DETAILS' ? 'view_private_details' : key?.toLowerCase();
  return Boolean(normalizedKey && permissions[normalizedKey]);
}

export function requireMaalemReviewPermission(permission) {
  return function reviewPermissionGuard(req, res, next) {
    if (!hasMaalemReviewPermission(req.user, permission)) {
      return res.status(403).json({ message: 'Permission de gestion des avis insuffisante', permission });
    }
    return next();
  };
}
