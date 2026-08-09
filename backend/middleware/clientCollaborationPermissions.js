import {
  hasClientCommentsAccess,
  hasClientRemindersAccess,
} from '../utils/clientCollaborationPermissions.js';

function requirePermission(check, message) {
  return function clientCollaborationPermissionGuard(req, res, next) {
    if (check(req.user)) return next();
    return res.status(403).json({ message, error: message });
  };
}

export const requireClientCommentsAccess = requirePermission(
  hasClientCommentsAccess,
  'Accès aux commentaires clients non autorisé.'
);

export const requireClientRemindersAccess = requirePermission(
  hasClientRemindersAccess,
  'Accès aux rappels clients non autorisé.'
);

