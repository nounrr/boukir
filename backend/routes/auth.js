import { Router } from 'express';
import pool from '../db/pool.js';
import { signToken, verifyToken } from '../middleware/auth.js';
import { checkUserAccess } from '../middleware/accessSchedule.js';
import bcrypt from 'bcryptjs';

const router = Router();

async function getEmployeePasswordChangeRequired(employeeId) {
  const [rows] = await pool.query(
    `
    SELECT
      (DAYOFWEEK(CURDATE()) = 2) AS is_monday,
      (password_changed_at IS NULL OR DATE(password_changed_at) < CURDATE()) AS needs_change
    FROM employees
    WHERE id = ? AND deleted_at IS NULL
    LIMIT 1
    `,
    [employeeId]
  );
  const r = rows[0];
  if (!r) return false;
  return Boolean(r.is_monday) && Boolean(r.needs_change);
}

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { cin, password } = req.body;
    if (!cin || !password) return res.status(400).json({ message: 'CIN et mot de passe requis' });
    
    const [rows] = await pool.query(
      'SELECT id, nom_complet, cin, date_embauche, role, password, password_changed_at, password_change_required_week_start FROM employees WHERE cin = ? AND deleted_at IS NULL',
      [cin]
    );
    const row = rows[0];
    if (!row) return res.status(401).json({ message: 'Identifiants invalides' });
    
    const ok = await bcrypt.compare(password, row.password || '');
    if (!ok) return res.status(401).json({ message: 'Identifiants invalides' });

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
    const passwordChangeRequired = await getEmployeePasswordChangeRequired(row.id);
    if (passwordChangeRequired) {
      await pool.query(
        'UPDATE employees SET password_change_required_week_start = CURDATE() WHERE id = ? AND deleted_at IS NULL',
        [row.id]
      );
    }
    
    const user = { id: row.id, nom_complet: row.nom_complet, cin: row.cin, date_embauche: row.date_embauche, role: row.role };
    const token = signToken({ id: user.id, role: user.role, cin: user.cin });
    
    res.json({ 
      user, 
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
router.get('/me', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.user || {};
    if (!id) return res.status(401).json({ message: 'Non autorisé' });
    const [rows] = await pool.query(
      'SELECT id, nom_complet, cin, date_embauche, role, password_changed_at, password_change_required_week_start FROM employees WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    const row = rows[0];
    const user = row
      ? { id: row.id, nom_complet: row.nom_complet, cin: row.cin, date_embauche: row.date_embauche, role: row.role }
      : null;
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });

    const passwordChangeRequired = await getEmployeePasswordChangeRequired(id);
    if (passwordChangeRequired) {
      await pool.query(
        'UPDATE employees SET password_change_required_week_start = CURDATE() WHERE id = ? AND deleted_at IS NULL',
        [id]
      );
    }

    res.json({ ...user, password_change_required: passwordChangeRequired });
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
router.post('/change-password', verifyToken, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Non autorisé' });

    const { old_password, new_password, confirm_password } = req.body || {};
    if (!old_password || !new_password) {
      return res.status(400).json({ message: 'Ancien et nouveau mot de passe requis' });
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

    const ok = await bcrypt.compare(String(old_password), row.password || '');
    if (!ok) return res.status(401).json({ message: 'Ancien mot de passe incorrect' });

    // New password must be different from the old one
    if (String(new_password) === String(old_password)) {
      return res.status(400).json({ message: 'Le nouveau mot de passe doit être différent de l\'ancien' });
    }
    const sameAsOld = await bcrypt.compare(String(new_password), row.password || '');
    if (sameAsOld) {
      return res.status(400).json({ message: 'Le nouveau mot de passe doit être différent de l\'ancien' });
    }

    const hashed = await bcrypt.hash(String(new_password), 10);
    await pool.query(
      'UPDATE employees SET password = ?, password_changed_at = NOW(), password_change_required_week_start = NULL WHERE id = ? AND deleted_at IS NULL',
      [hashed, userId]
    );

    res.json({ ok: true, message: 'Mot de passe modifié avec succès' });
  } catch (err) {
    next(err);
  }
});

export default router;
