import { Router } from 'express';
import pool from '../db/pool.js';
import bcrypt from 'bcryptjs';
import { verifyToken, requireRole, requireRoles, requireSelfOrRoles } from '../middleware/auth.js';

const router = Router();

router.use(verifyToken);

// Helper: convert undefined, null, or empty/whitespace-only strings to null; trim strings
function clean(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    return t === '' ? null : t;
  }
  return value;
}

function parseAuthorizationCount(value, fieldName) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 100000) {
    const error = new Error(`${fieldName} doit être un entier entre 0 et 100000`);
    error.status = 400;
    error.statusCode = 400;
    throw error;
  }
  return number;
}

const EMPLOYEE_SELECT = `
  id, nom_complet, cin, date_embauche, role, salaire,
  bon_plafond_autorisations, bon_client_bloque_autorisations,
  created_by, updated_by, created_at, updated_at
`;

router.get('/', requireRoles('PDG', 'ManagerPlus'), async (req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT ${EMPLOYEE_SELECT} FROM employees WHERE deleted_at IS NULL ORDER BY id DESC`);
    if (req.user?.role !== 'PDG') {
      rows.forEach((employee) => {
        employee.salaire = null;
        employee.bon_plafond_autorisations = null;
        employee.bon_client_bloque_autorisations = null;
      });
    }
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/me/bon-authorizations', async (req, res, next) => {
  try {
    if (!req.user?.role) {
      return res.status(403).json({ message: 'Accès réservé aux employés' });
    }
    if (req.user?.role === 'PDG') {
      return res.json({
        unlimited: true,
        bon_plafond_autorisations: null,
        bon_client_bloque_autorisations: null,
      });
    }
    const [rows] = await pool.query(
      `SELECT bon_plafond_autorisations, bon_client_bloque_autorisations
       FROM employees WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [Number(req.user?.id)]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Employé introuvable' });
    res.json({
      unlimited: false,
      bon_plafond_autorisations: Number(rows[0].bon_plafond_autorisations || 0),
      bon_client_bloque_autorisations: Number(rows[0].bon_client_bloque_autorisations || 0),
    });
  } catch (err) { next(err); }
});

router.get('/:id(\\d+)', requireSelfOrRoles('PDG', 'ManagerPlus'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query(`SELECT ${EMPLOYEE_SELECT} FROM employees WHERE id = ? AND deleted_at IS NULL`, [id]);
    const emp = rows[0];
    if (!emp) return res.status(404).json({ message: 'Employé introuvable' });
    if (req.user?.role !== 'PDG' && Number(req.user?.id) !== id) {
      emp.salaire = null;
      emp.bon_plafond_autorisations = null;
      emp.bon_client_bloque_autorisations = null;
    }
    res.json(emp);
  } catch (err) { next(err); }
});

router.post('/', requireRole('PDG'), async (req, res, next) => {
  try {
  const {
    nom_complet, cin, date_embauche, role, salaire, password,
    bon_plafond_autorisations, bon_client_bloque_autorisations,
  } = req.body;

    // Required: CIN and password
    const cinTrim = typeof cin === 'string' ? cin.trim() : cin;
    if (!cinTrim) {
      return res.status(400).json({ message: 'CIN requis' });
    }
    if (!password || typeof password !== 'string' || !password.trim()) {
      return res.status(400).json({ message: 'Mot de passe requis' });
    }

    // Uniqueness check for CIN (only for non-deleted employees)
    const [exists] = await pool.query('SELECT id FROM employees WHERE cin = ? AND deleted_at IS NULL', [cinTrim]);
    if (exists.length > 0) return res.status(400).json({ message: 'Ce CIN existe déjà' });

    const now = new Date();
    const hashed = await bcrypt.hash(password.trim(), 10);
    const plafondCount = parseAuthorizationCount(bon_plafond_autorisations ?? 0, 'Autorisations plafond');
    const blockedCount = parseAuthorizationCount(bon_client_bloque_autorisations ?? 0, 'Autorisations client bloqué');
    const [result] = await pool.query(
      `INSERT INTO employees
       (nom_complet, cin, date_embauche, role, salaire, password,
        bon_plafond_autorisations, bon_client_bloque_autorisations,
        created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [clean(nom_complet), cinTrim, clean(date_embauche), clean(role), clean(salaire), hashed,
        plafondCount, blockedCount, req.user.id, now, now]
    );
    const id = result.insertId;
    const [rows] = await pool.query(`SELECT ${EMPLOYEE_SELECT} FROM employees WHERE id = ?`, [id]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', requireRole('PDG'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const {
      nom_complet, cin, date_embauche, role, salaire, password,
      bon_plafond_autorisations, bon_client_bloque_autorisations,
    } = req.body;
    const [rows0] = await pool.query('SELECT * FROM employees WHERE id = ? AND deleted_at IS NULL', [id]);
    if (rows0.length === 0) return res.status(404).json({ message: 'Employé introuvable' });
    if (cin !== undefined) {
      const cinTrim = typeof cin === 'string' ? cin.trim() : cin;
      if (!cinTrim) return res.status(400).json({ message: 'CIN requis' });
      const [dups] = await pool.query('SELECT id FROM employees WHERE cin = ? AND id <> ? AND deleted_at IS NULL', [cinTrim, id]);
      if (dups.length > 0) return res.status(400).json({ message: 'Ce CIN existe déjà' });
    }
    const now = new Date();
    const fields = [];
    const values = [];
    if (nom_complet !== undefined) { fields.push('nom_complet = ?'); values.push(clean(nom_complet)); }
    if (cin !== undefined) { fields.push('cin = ?'); values.push(typeof cin === 'string' ? cin.trim() : cin); }
    if (date_embauche !== undefined) { fields.push('date_embauche = ?'); values.push(clean(date_embauche)); }
    if (role !== undefined) { fields.push('role = ?'); values.push(clean(role)); }
  if (salaire !== undefined) { fields.push('salaire = ?'); values.push(clean(salaire)); }
    const plafondCount = parseAuthorizationCount(bon_plafond_autorisations, 'Autorisations plafond');
    const blockedCount = parseAuthorizationCount(bon_client_bloque_autorisations, 'Autorisations client bloqué');
    if (plafondCount !== undefined) {
      fields.push('bon_plafond_autorisations = ?');
      values.push(plafondCount);
    }
    if (blockedCount !== undefined) {
      fields.push('bon_client_bloque_autorisations = ?');
      values.push(blockedCount);
    }
    if (password && typeof password === 'string' && password.trim()) {
      const hashed = await bcrypt.hash(password.trim(), 10);
      fields.push('password = ?'); values.push(hashed);
    }
    fields.push('updated_by = ?'); values.push(req.user.id);
    fields.push('updated_at = ?'); values.push(now);
    if (fields.length === 0) {
      const [rows] = await pool.query('SELECT id, nom_complet, cin, date_embauche, role, salaire, created_by, updated_by, created_at, updated_at FROM employees WHERE id = ?', [id]);
      return res.json(rows[0]);
    }
    const sql = `UPDATE employees SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);
    await pool.query(sql, values);
    const authorizationChanges = [
      ['PLAFOND', plafondCount, Number(rows0[0].bon_plafond_autorisations || 0)],
      ['CLIENT_BLOQUE', blockedCount, Number(rows0[0].bon_client_bloque_autorisations || 0)],
    ].filter(([, nextValue, oldValue]) => nextValue !== undefined && nextValue !== oldValue);
    for (const [authorizationType, nextValue, oldValue] of authorizationChanges) {
      await pool.query(
        `INSERT INTO employee_bon_authorization_events
         (employee_id, authorization_type, action, quantity, balance_after, performed_by)
         VALUES (?, ?, 'SET', ?, ?, ?)`,
        [id, authorizationType, nextValue - oldValue, nextValue, req.user.id]
      );
    }
  const [rows] = await pool.query(`SELECT ${EMPLOYEE_SELECT} FROM employees WHERE id = ?`, [id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole('PDG'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [empRows] = await pool.query('SELECT role FROM employees WHERE id = ? AND deleted_at IS NULL', [id]);
    if (empRows.length === 0) return res.status(404).json({ message: 'Employé introuvable' });
    
    if (empRows[0].role === 'PDG') {
      const [pdgCountRows] = await pool.query("SELECT COUNT(*) as cnt FROM employees WHERE role = 'PDG' AND deleted_at IS NULL");
      if (pdgCountRows[0].cnt <= 1) return res.status(400).json({ message: 'Impossible de supprimer le dernier PDG' });
    }
    
    // Soft delete: set deleted_at timestamp
    const now = new Date();
    await pool.query('UPDATE employees SET deleted_at = ?, updated_by = ?, updated_at = ? WHERE id = ?', [now, req.user.id, now, id]);
    res.status(204).send();
  } catch (err) { next(err); }
});

// Route pour récupérer les employés supprimés (pour l'administration)
router.get('/deleted/list', requireRole('PDG'), async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, nom_complet, cin, date_embauche, role, salaire, deleted_at, updated_by FROM employees WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Route pour restaurer un employé supprimé
router.post('/:id/restore', requireRole('PDG'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [empRows] = await pool.query('SELECT id FROM employees WHERE id = ? AND deleted_at IS NOT NULL', [id]);
    if (empRows.length === 0) return res.status(404).json({ message: 'Employé supprimé introuvable' });
    
    const now = new Date();
    await pool.query('UPDATE employees SET deleted_at = NULL, updated_by = ?, updated_at = ? WHERE id = ?', [req.user.id, now, id]);
    
    // Retourner l'employé restauré
    const [rows] = await pool.query('SELECT id, nom_complet, cin, date_embauche, role, salaire, created_by, updated_by, created_at, updated_at FROM employees WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
