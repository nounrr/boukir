import { Router } from 'express';
import pool from '../db/pool.js';
import { signToken, verifyToken } from '../middleware/auth.js';
import { employeePasswordVersion, enforceWeeklyPasswordChange, getEmployeeWeeklyPasswordState, isEmployeePasswordSession } from '../middleware/passwordPolicy.js';
import { checkUserAccess } from '../middleware/accessSchedule.js';
import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { ensureInternalPricePermissionSchema } from '../utils/internalPricePermissions.js';
import { EMPLOYEE_PAGE_COLUMNS, ensureEmployeePagePermissionSchema, normalizeEmployeePagePermissions } from '../utils/employeePagePermissions.js';

const router = Router();

const LOGIN_MAX_ATTEMPTS = 5;
let loginAttemptsTablePromise = null;

function loginAttemptKey(req, cin) {
  return createHash('sha256')
    .update(`${req.ip || 'unknown'}:${String(cin || '').trim().toUpperCase()}`)
    .digest('hex');
}

function ensureLoginAttemptsTable() {
  if (!loginAttemptsTablePromise) {
    loginAttemptsTablePromise = pool.query(`
      CREATE TABLE IF NOT EXISTS employee_login_attempts (
        attempt_key CHAR(64) PRIMARY KEY,
        attempt_count INT NOT NULL DEFAULT 0,
        reset_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_employee_login_attempts_reset (reset_at)
      ) ENGINE=InnoDB
    `).catch((error) => {
      loginAttemptsTablePromise = null;
      throw error;
    });
  }
  return loginAttemptsTablePromise;
}

async function getLoginAttempt(key) {
  await ensureLoginAttemptsTable();
  await pool.query('DELETE FROM employee_login_attempts WHERE reset_at <= NOW() LIMIT 1000');
  const [rows] = await pool.query(
    'SELECT attempt_count AS count, reset_at AS resetAt FROM employee_login_attempts WHERE attempt_key = ? AND reset_at > NOW() LIMIT 1',
    [key]
  );
  return rows[0] || null;
}

async function registerLoginFailure(key) {
  await ensureLoginAttemptsTable();
  await pool.query(
    `INSERT INTO employee_login_attempts (attempt_key, attempt_count, reset_at)
     VALUES (?, 1, DATE_ADD(NOW(), INTERVAL 15 MINUTE))
     ON DUPLICATE KEY UPDATE
       attempt_count = IF(reset_at <= NOW(), 1, attempt_count + 1),
       reset_at = IF(reset_at <= NOW(), VALUES(reset_at), reset_at)`,
    [key]
  );
}

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    await ensureInternalPricePermissionSchema();
    await ensureEmployeePagePermissionSchema();
    const { cin, password } = req.body;
    if (!cin || !password) return res.status(400).json({ message: 'CIN et mot de passe requis' });
    const attemptKey = loginAttemptKey(req, cin);
    const existingAttempt = await getLoginAttempt(attemptKey);
    if (existingAttempt?.count >= LOGIN_MAX_ATTEMPTS) {
      const retryAfterSeconds = Math.max(1, Math.ceil((new Date(existingAttempt.resetAt).getTime() - Date.now()) / 1000));
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({ message: 'Trop de tentatives. Réessayez plus tard.' });
    }
    
    const [rows] = await pool.query(
      `SELECT id, nom_complet, cin, date_embauche, role, acces_prix_internes, ${Object.values(EMPLOYEE_PAGE_COLUMNS).join(', ')}, password, password_changed_at, password_change_required_week_start FROM employees WHERE cin = ? AND deleted_at IS NULL`,
      [cin]
    );
    const row = rows[0];
    if (!row) {
      await registerLoginFailure(attemptKey);
      return res.status(401).json({ message: 'Identifiants invalides' });
    }
    
    const ok = await bcrypt.compare(password, row.password || '');
    if (!ok) {
      await registerLoginFailure(attemptKey);
      return res.status(401).json({ message: 'Identifiants invalides' });
    }

    await pool.query('DELETE FROM employee_login_attempts WHERE attempt_key = ?', [attemptKey]);

    // Vérifier les horaires d'accès après authentification réussie
    const accessCheck = await checkUserAccess(row.id);
    if (!accessCheck.hasAccess) {
      return res.status(403).json({ 
        message: 'Accès refusé - Horaire non autorisé',
        access_denied: true,
        reason: accessCheck.reason,
        error_type: 'ACCESS_SCHEDULE_RESTRICTION'
      });
    }

    // Track login
    await pool.query('UPDATE employees SET last_login_at = NOW() WHERE id = ? AND deleted_at IS NULL', [row.id]);

    // Enforce weekly Monday password change (DB-time based)
    const passwordState = await getEmployeeWeeklyPasswordState(row.id);
    if (!passwordState || passwordState.passwordVersion !== employeePasswordVersion(row.password)) {
      return res.status(401).json({ message: 'Identifiants invalides' });
    }
    const passwordChangeRequired = passwordState.required;
    if (passwordChangeRequired) {
      await pool.query(
        'UPDATE employees SET password_change_required_week_start = ? WHERE id = ? AND deleted_at IS NULL',
        [passwordState.weekStart, row.id]
      );
    }
    
    const user = { id: row.id, nom_complet: row.nom_complet, cin: row.cin, date_embauche: row.date_embauche, role: row.role, acces_prix_internes: row.acces_prix_internes };
    const identity = { id: user.id, role: user.role, cin: user.cin, employee_password_version: passwordState.passwordVersion };
    const token = passwordChangeRequired
      ? signToken({ ...identity, weekly_password_change_week: passwordState.weekStart }, '15m')
      : signToken(identity);
    
    res.json({ 
      user: { ...user, employee_page_permissions: normalizeEmployeePagePermissions(row) },
      token,
      password_change_required: passwordChangeRequired,
      access_info: {
        has_access: true,
        reason: accessCheck.reason
      }
    });
  } catch (err) { next(err); }
});

// GET /api/auth/me (requires Bearer token)
router.get('/me', verifyToken, enforceWeeklyPasswordChange, async (req, res, next) => {
  try {
    await ensureInternalPricePermissionSchema();
    await ensureEmployeePagePermissionSchema();
    const { id } = req.user || {};
    if (!isEmployeePasswordSession(req.user)) return res.status(401).json({ message: 'Non autorisé' });
    const [rows] = await pool.query(
      `SELECT id, nom_complet, cin, date_embauche, role, acces_prix_internes, ${Object.values(EMPLOYEE_PAGE_COLUMNS).join(', ')}, password_changed_at, password_change_required_week_start FROM employees WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
    const row = rows[0];
    const user = row
      ? { id: row.id, nom_complet: row.nom_complet, cin: row.cin, date_embauche: row.date_embauche, role: row.role, acces_prix_internes: row.acces_prix_internes }
      : null;
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });

    res.json({ ...user, employee_page_permissions: normalizeEmployeePagePermissions(row), password_change_required: req.weeklyPasswordState.required });
  } catch (err) { next(err); }
});

// GET /api/auth/check-access (requires Bearer token)
router.get('/check-access', verifyToken, async (req, res, next) => {
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
        reason: accessCheck.reason,
        error_type: 'ACCESS_SCHEDULE_RESTRICTION'
      });
    }

    res.json({
      hasAccess: true,
      reason: accessCheck.reason
    });
  } catch (err) { 
    next(err); 
  }
});

// POST /api/auth/change-password (requires Bearer token)
router.post('/change-password', verifyToken, enforceWeeklyPasswordChange, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!isEmployeePasswordSession(req.user)) return res.status(401).json({ message: 'Non autorisé' });

    const { old_password, new_password, confirm_password } = req.body || {};
    const weeklyChange = req.weeklyPasswordState.required;
    if (typeof new_password !== 'string' || !new_password || (!weeklyChange && (typeof old_password !== 'string' || !old_password))) {
      return res.status(400).json({ message: weeklyChange ? 'Nouveau mot de passe requis' : 'Ancien et nouveau mot de passe requis' });
    }
    if (String(new_password).length < 8) {
      return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 8 caractères' });
    }
    if (confirm_password !== undefined && new_password !== confirm_password) {
      return res.status(400).json({ message: 'Les mots de passe ne correspondent pas' });
    }

    const [rows] = await pool.query(
      'SELECT id, password FROM employees WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [userId]
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ message: 'Utilisateur introuvable' });

    if (req.weeklyPasswordState.passwordVersion !== employeePasswordVersion(row.password)) {
      return res.status(409).json({ message: 'Le mot de passe a changé. Reconnectez-vous.', error_type: 'PASSWORD_REAUTH_REQUIRED' });
    }
    if (!weeklyChange && !(await bcrypt.compare(old_password, row.password || ''))) {
      return res.status(401).json({ message: 'Ancien mot de passe incorrect' });
    }
    const sameAsOld = await bcrypt.compare(String(new_password), row.password || '');
    if (sameAsOld) {
      return res.status(400).json({ message: 'Le nouveau mot de passe doit être différent de l\'ancien' });
    }

    const hashed = await bcrypt.hash(String(new_password), 10);
    const [update] = await pool.query(
      'UPDATE employees SET password = ?, password_changed_at = NOW(), password_change_required_week_start = NULL WHERE id = ? AND deleted_at IS NULL AND BINARY password = ?',
      [hashed, userId, row.password]
    );
    if (!update.affectedRows) {
      return res.status(409).json({ message: 'Le mot de passe a changé. Reconnectez-vous.', error_type: 'PASSWORD_REAUTH_REQUIRED' });
    }

    const token = signToken({
      id: userId, role: req.user.role, cin: req.user.cin, employee_password_version: employeePasswordVersion(hashed),
    });
    res.json({ ok: true, token, message: 'Mot de passe modifié avec succès' });
  } catch (err) {
    next(err);
  }
});

export default router;
