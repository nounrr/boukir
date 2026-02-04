import jwt from 'jsonwebtoken';
import { requestContext } from '../db/pool.js';
import { checkUserAccess } from './accessSchedule.js';

export function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Token manquant' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
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
  const secret = process.env.JWT_SECRET || 'dev-secret';
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign(payload, secret, { expiresIn });
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
  // D'abord vérifier le token
  verifyToken(req, res, async (err) => {
    if (err) return; // L'erreur a déjà été traitée par verifyToken
    
    try {
      // Ensuite vérifier les horaires d'accès
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Utilisateur non identifié' });
      }

      const accessCheck = await checkUserAccess(userId);
      if (!accessCheck.hasAccess) {
        return res.status(403).json({
          message: 'Accès refusé - Horaire non autorisé',
          access_denied: true,
          reason: accessCheck.reason,
          error_type: 'ACCESS_SCHEDULE_RESTRICTION'
        });
      }

      // Accès autorisé
      next();
    } catch (error) {
      console.error('Erreur vérification horaires dans middleware:', error);
      // En cas d'erreur, continuer (ne pas bloquer l'accès)
      next();
    }
  });
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
