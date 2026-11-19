import { Router } from 'express';

import { isExpoPushToken } from '../utils/pushTokens.js';
import { removeStaffToken, saveStaffToken } from '../utils/staffNotify.js';

/** The team's phones: the signed-in employee's app asks for (or gives up) notifications. */
export function createStaffPushTokensRouter(deps = {}) {
  const save = deps.save ?? saveStaffToken;
  const remove = deps.remove ?? removeStaffToken;
  const router = Router();

  // Employees only: a customer's token belongs to /api/users/auth/push-token.
  const employeeId = (req) => (req.user?.role && req.user?.type_compte == null ? Number(req.user.id) || null : null);

  // POST /api/staff/push-token  { token, platform?, locale? }
  router.post('/push-token', async (req, res, next) => {
    try {
      const id = employeeId(req);
      if (!id) return res.status(403).json({ message: 'Accès refusé' });
      const { token, platform, locale } = req.body || {};
      if (!isExpoPushToken(token)) return res.status(400).json({ message: 'Jeton de notification invalide', field: 'token' });
      await save(id, { token, platform: platform ? String(platform).slice(0, 16) : null, locale: locale ? String(locale).slice(0, 8) : null });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  // DELETE /api/staff/push-token  { token }  : sign-out on that phone
  router.delete('/push-token', async (req, res, next) => {
    try {
      const id = employeeId(req);
      if (!id) return res.status(403).json({ message: 'Accès refusé' });
      const { token } = req.body || {};
      if (isExpoPushToken(token)) await remove(token, id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export default createStaffPushTokensRouter();
