import jwt from 'jsonwebtoken';
import { requestContext } from '../db/pool.js';

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
