import { Router } from 'express';
import pool from '../db/pool.js';
import { signToken, verifyToken } from '../middleware/auth.js';
import { checkUserAccess } from '../middleware/accessSchedule.js';
import bcrypt from 'bcryptjs';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { cin, password } = req.body;
    if (!cin || !password) return res.status(400).json({ message: 'CIN et mot de passe requis' });
    
    const [rows] = await pool.query('SELECT id, nom_complet, cin, date_embauche, role, password FROM employees WHERE cin = ? AND deleted_at IS NULL', [cin]);
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
    
    const user = { id: row.id, nom_complet: row.nom_complet, cin: row.cin, date_embauche: row.date_embauche, role: row.role };
    const token = signToken({ id: user.id, role: user.role, cin: user.cin });
    
    res.json({ 
      user, 
      token,
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
    const [rows] = await pool.query('SELECT id, nom_complet, cin, date_embauche, role FROM employees WHERE id = ? AND deleted_at IS NULL', [id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });
    res.json(user);
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

export default router;
