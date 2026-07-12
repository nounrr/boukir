import jwt from 'jsonwebtoken';
import pool, { requestContext } from '../db/pool.js';
import { checkUserAccess } from './accessSchedule.js';

export function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || '').trim();
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters');
  }
  return secret;
}

export function verifyToken(req, res, next) {
  if (req.user?._currentUserValidated) return next();
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Token manquant' });
  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.user = payload;
    // Met à jour le contexte d'audit si présent
    const store = requestContext.getStore();
    if (store) {
      store.userId = payload.id || payload.user_id || payload.userId || store.userId || null;
    }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token invalide' });
  }
}

export function signToken(payload) {
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign(payload, getJwtSecret(), { expiresIn });
}

function isEmployeePayload(payload) {
  return Boolean(payload?.role) && Boolean(payload?.cin) && payload?.type_compte == null;
}

// Validate that the account still exists and refresh authorization data from
// the database. Employee access schedules are enforced on every protected
// request, so an old JWT cannot preserve a deleted role or bypass work hours.
export function verifyCurrentUserWithSchedule(req, res, next) {
  verifyToken(req, res, async () => {
    try {
      const userId = Number(req.user?.id);
      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(401).json({ message: 'Utilisateur non identifié' });
      }

      if (isEmployeePayload(req.user)) {
        const [rows] = await pool.query(
          'SELECT id, cin, role FROM employees WHERE id = ? AND deleted_at IS NULL LIMIT 1',
          [userId]
        );
        const employee = rows[0];
        if (!employee) return res.status(401).json({ message: 'Compte employé inactif' });

        req.user = {
          ...req.user,
          id: employee.id,
          cin: employee.cin,
          role: employee.role,
          _currentUserValidated: true,
        };

        const scheduleExempt = new Set([
          '/api/auth/me',
          '/api/auth/change-password',
          '/api/auth/check-access',
        ]);
        if (!scheduleExempt.has(req.path)) {
          const accessCheck = await checkUserAccess(userId);
          if (!accessCheck.hasAccess) {
            return res.status(403).json({
              message: 'Accès refusé - Horaire non autorisé',
              access_denied: true,
              reason: accessCheck.reason,
              error_type: 'ACCESS_SCHEDULE_RESTRICTION',
            });
          }
        }
      } else {
        const [rows] = await pool.query(
          `SELECT id, type_compte
           FROM contacts
           WHERE id = ?
             AND deleted_at IS NULL
             AND COALESCE(is_blocked, 0) = 0
             AND (locked_until IS NULL OR locked_until <= NOW())
           LIMIT 1`,
          [userId]
        );
        const contact = rows[0];
        if (!contact) return res.status(401).json({ message: 'Compte utilisateur inactif' });
        req.user = {
          ...req.user,
          id: contact.id,
          type_compte: contact.type_compte,
          _currentUserValidated: true,
        };
      }

      const store = requestContext.getStore();
      if (store) store.userId = userId;
      return next();
    } catch (error) {
      console.error('Current user validation failed:', error);
      return res.status(503).json({
        message: 'Vérification du compte temporairement indisponible',
        error_type: 'AUTH_VALIDATION_UNAVAILABLE',
      });
    }
  });
}

// Simple role guard
export function requireRole(role) {
  return function (req, res, next) {
    const u = req.user || {};
    if (!u?.role) return res.status(403).json({ message: 'Accès refusé' });
    if (u.role !== role) return res.status(403).json({ message: 'Rôle insuffisant' });
    next();
  };
}

// Multiple roles guard
export function requireRoles(...roles) {
  return function (req, res, next) {
    const u = req.user || {};
    if (!u?.role) return res.status(403).json({ message: 'Accès refusé' });
    if (!roles.includes(u.role)) return res.status(403).json({ message: 'Rôle insuffisant' });
    next();
  };
}

// Allow an employee to access only their own record, while designated admin
// roles can access any employee record. The target employee id is read from
// the route parameter (by default `:id`), never from the request body.
export function requireSelfOrRoles(...roles) {
  return function (req, res, next) {
    const userId = Number(req.user?.id);
    const targetId = Number(req.params?.id);

    if (!Number.isInteger(userId) || !Number.isInteger(targetId)) {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    if (userId === targetId || roles.includes(req.user?.role)) {
      return next();
    }

    return res.status(403).json({ message: 'Rôle insuffisant' });
  };
}

// Forbid specific roles (useful for read-only roles)
export function forbidRoles(...roles) {
  return function (req, res, next) {
    const u = req.user || {};
    if (!u?.role) return res.status(403).json({ message: 'Accès refusé' });
    if (roles.includes(u.role)) {
      return res.status(403).json({ message: 'Accès refusé: action interdite pour ce rôle' });
    }
    next();
  };
}

// Middleware combiné: vérification token + horaires d'accès
export function verifyTokenWithSchedule(req, res, next) {
  return verifyTokenWithScheduleStrict(req, res, next);
}

// Middleware strict: vérification token + horaires (échoue en cas d'erreur)
export function verifyTokenWithScheduleStrict(req, res, next) {
  verifyToken(req, res, async (err) => {
    if (err) return;
    
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Utilisateur non identifié' });
      }

      const accessCheck = await checkUserAccess(userId);
      if (!accessCheck.hasAccess) {
        return res.status(403).json({
          message: 'Accès refusé - Horaire non autorisé',
          access_denied: true,
          reason: accessCheck.reason
        });
      }

      next();
    } catch (error) {
      console.error('Erreur vérification horaires strict:', error);
      return res.status(500).json({
        message: 'Erreur de vérification des horaires',
        access_denied: true
      });
    }
  });
}
