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

async function ensureEmployeeWeeklyRequirement(employeeId, now) {
  void now;

  // Use DB date/time to avoid timezone drift between Node and MySQL.
  // MySQL: DAYOFWEEK() => 1=Sunday, 2=Monday, 3=Tuesday, ...
  const [rows] = await pool.query(
    `
    SELECT
      id,
      (DAYOFWEEK(CURDATE()) = 2) AS is_monday,
      (password_changed_at IS NULL OR DATE(password_changed_at) < CURDATE()) AS needs_change
    FROM employees
    WHERE id = ? AND deleted_at IS NULL
    LIMIT 1
    `,
    [employeeId]
  );

  const row = rows[0];
  if (!row) return { exists: false, required: false };

  const isMonday = Boolean(row.is_monday);
  const needsChange = Boolean(row.needs_change);

  // Enforce ONLY on Monday.
  if (!isMonday) return { exists: true, required: false };

  if (needsChange) {
    // Optional tracking for admin/debug.
    await pool.query(
      'UPDATE employees SET password_change_required_week_start = CURDATE() WHERE id = ? AND deleted_at IS NULL',
      [employeeId]
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

  const now = new Date();

  (async () => {
    const userId = payload.id;

    const result = await ensureEmployeeWeeklyRequirement(userId, now);

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
    // Fail-open to avoid blocking the whole app if DB is down.
    next();
  });
}

export const _passwordPolicyInternals = {
  ensureEmployeeWeeklyRequirement,
};
