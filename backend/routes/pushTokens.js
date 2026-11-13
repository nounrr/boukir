import { Router } from 'express';
import jwt from 'jsonwebtoken';

import { getJwtSecret } from '../middleware/auth.js';
import { isExpoPushToken, removeToken, saveToken } from '../utils/pushTokens.js';

const router = Router();

function customerId(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, getJwtSecret())?.id ?? null;
  } catch {
    return null;
  }
}

// POST /api/users/auth/push-token  { token, platform?, locale? }  : the signed-in customer's phone wants notifications
router.post('/push-token', async (req, res, next) => {
  try {
    const id = customerId(req);
    if (!id) return res.status(401).json({ message: 'Token manquant ou invalide' });
    const { token, platform, locale } = req.body || {};
    if (!isExpoPushToken(token)) return res.status(400).json({ message: 'Jeton de notification invalide', field: 'token' });
    await saveToken(id, { token, platform: platform ? String(platform).slice(0, 16) : null, locale: locale ? String(locale).slice(0, 8) : null });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// DELETE /api/users/auth/push-token  { token }  : sign-out on that phone
router.delete('/push-token', async (req, res, next) => {
  try {
    const id = customerId(req);
    if (!id) return res.status(401).json({ message: 'Token manquant ou invalide' });
    const { token } = req.body || {};
    if (isExpoPushToken(token)) await removeToken(token, id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
