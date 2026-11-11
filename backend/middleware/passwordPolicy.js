import pool from '../db/pool.js';
import { createHmac } from 'node:crypto';
import { getJwtSecret } from './auth.js';

const PASSWORD_CHANGE_PATHS = new Set([
  '/api/auth/me',
  '/api/auth/change-password',
  '/api/auth/check-access',
]);

export function isEmployeePasswordSession(payload) {
  return Boolean(payload?.id && payload.role && payload.cin && payload.type_compte == null);
}

export function employeePasswordVersion(passwordHash) {
  return createHmac('sha256', getJwtSecret()).update(passwordHash || '').digest('hex');
}

export async function getEmployeeWeeklyPasswordState(employeeId) {
  const [[row]] = await pool.query(
    `SELECT DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), '%Y-%m-%d') AS week_start,
            (password_changed_at IS NULL OR DATE(password_changed_at) < DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)) AS needs_change,
            UNIX_TIMESTAMP(password_changed_at) AS changed_at, password
     FROM employees WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [employeeId]
  );
  return row && {
    weekStart: row.week_start,
    required: Number(row.needs_change) === 1,
    changedAt: Number(row.changed_at || 0),
    passwordVersion: employeePasswordVersion(row.password),
  };
}

export async function enforceWeeklyPasswordChange(req, res, next) {
  const user = req.user;
  if (!isEmployeePasswordSession(user) || req.weeklyPasswordState) return next();

  try {
    const state = await getEmployeeWeeklyPasswordState(user.id);
    if (!state) return res.status(401).json({ message: 'Compte employé inactif' });
    const resetWeek = user.weekly_password_change_week;
    const hasCurrentResetSession = state.required && resetWeek === state.weekStart;
    const stalePassword = user.employee_password_version
      ? user.employee_password_version !== state.passwordVersion
      : user.iat < state.changedAt;
    const reauthRequired = stalePassword || ((state.required || resetWeek) && !hasCurrentResetSession);
    if (reauthRequired) {
      return res.status(403).json({
        message: 'Reconnectez-vous avec votre CIN et votre mot de passe actuel.',
        error_type: 'PASSWORD_REAUTH_REQUIRED',
      });
    }
    if (hasCurrentResetSession && !PASSWORD_CHANGE_PATHS.has(req.baseUrl + req.path)) {
      return res.status(403).json({
        message: 'Changement de mot de passe obligatoire',
        error_type: 'PASSWORD_CHANGE_REQUIRED',
        password_change_required: true,
      });
    }
    req.weeklyPasswordState = state;
    return next();
  } catch (error) {
    console.error('Password policy middleware error:', error);
    return res.status(503).json({
      message: 'Vérification de sécurité temporairement indisponible',
      error_type: 'PASSWORD_POLICY_UNAVAILABLE',
    });
  }
}
