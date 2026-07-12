import pool from '../db/pool.js';

function isEmployeeToken(payload) {
  return Boolean(payload?.role) || Boolean(payload?.cin);
}

const ALLOW_WHEN_PASSWORD_CHANGE_REQUIRED = new Set([
  // Employee auth
  '/api/auth/me',
  '/api/auth/change-password',
  '/api/auth/check-access',
]);

async function ensureEmployeeWeeklyRequirement(employeeId) {
  // Use DB date/time to avoid timezone drift between Node and MySQL. The
  // obligation starts on Monday and remains active through Sunday until the
  // employee has changed their password during that week.
  const [rows] = await pool.query(
    `
    SELECT
      id,
      DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) AS week_start,
      (password_changed_at IS NULL OR DATE(password_changed_at) < DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)) AS needs_change
    FROM employees
    WHERE id = ? AND deleted_at IS NULL
    LIMIT 1
    `,
    [employeeId]
  );

  const row = rows[0];
  if (!row) return { exists: false, required: false };

  const needsChange = Boolean(row.needs_change);

  if (needsChange) {
    await pool.query(
      'UPDATE employees SET password_change_required_week_start = ? WHERE id = ? AND deleted_at IS NULL',
      [row.week_start, employeeId]
    );
    return { exists: true, required: true };
  }

  return { exists: true, required: false };
}

export function enforceWeeklyPasswordChange(req, res, next) {
  const payload = req.user;
  if (!payload?.id) return next();

  // Only enforce for employees (not for contacts/e-commerce users)
  if (!isEmployeeToken(payload)) return next();

  if (ALLOW_WHEN_PASSWORD_CHANGE_REQUIRED.has(req.path)) return next();

  (async () => {
    const userId = payload.id;

    const result = await ensureEmployeeWeeklyRequirement(userId);

    if (result.required) {
      return res.status(403).json({
        message: 'Changement de mot de passe obligatoire',
        error_type: 'PASSWORD_CHANGE_REQUIRED',
        password_change_required: true,
      });
    }

    return next();
  })().catch((err) => {
    console.error('Password policy middleware error:', err);
    return res.status(503).json({
      message: 'Vérification de sécurité temporairement indisponible',
      error_type: 'PASSWORD_POLICY_UNAVAILABLE',
    });
  });
}

export const _passwordPolicyInternals = {
  ensureEmployeeWeeklyRequirement,
};
