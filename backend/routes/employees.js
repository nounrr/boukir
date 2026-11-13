import { Router } from 'express';
import pool from '../db/pool.js';
import bcrypt from 'bcryptjs';
import { ensurePointageRequirementSchema } from '../utils/pointageRequirements.js';
import { verifyToken, requireRole } from '../middleware/auth.js';
import { grantClientPlafondAuthorizations } from '../utils/bonExceptionAuthorization.js';
import { normalizeEmployeePagePermissions, requireEmployeePagePermission } from '../utils/employeePagePermissions.js';
import {
  normalizeClientCollaborationPermissions,
  parseStrictClientCollaborationPermissions,
} from '../utils/clientCollaborationPermissions.js';
import {
  normalizeMaalemReviewPermissions,
  parseStrictMaalemReviewPermissions,
} from '../utils/maalemReviewPermissions.js';

const router = Router();

router.use(verifyToken);
router.use(async (_req, _res, next) => {
  try { await ensurePointageRequirementSchema(pool); next(); } catch (error) { next(error); }
});

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
  id, nom_complet, cin, date_embauche, role, salaire, pointage_obligatoire,
  bon_plafond_autorisations, bon_client_bloque_autorisations,
  created_by, updated_by, created_at, updated_at
`;

router.get('/', requireEmployeePagePermission('view'), async (req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT ${EMPLOYEE_SELECT} FROM employees WHERE deleted_at IS NULL ORDER BY id DESC`);
    if (req.user?.role !== 'PDG') {
      rows.forEach((employee) => {
        if (!normalizeEmployeePagePermissions(req.user).salary_details) employee.salaire = null;
        employee.bon_plafond_autorisations = null;
        employee.bon_client_bloque_autorisations = null;
      });
    }
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/me/bon-authorizations', async (req, res, next) => {
  try {
    if (!req.user?.role || req.user.type_compte != null) {
      return res.status(403).json({ message: 'Accès réservé aux employés' });
    }
    res.set('Cache-Control', 'no-store');
    if (req.user.role === 'PDG') {
      return res.json({
        unlimited: true,
        bon_plafond_autorisations: null,
        bon_client_bloque_autorisations: null,
        plafond_par_client: {},
      });
    }
    const [rows] = await pool.query(
      `SELECT bon_plafond_autorisations, bon_client_bloque_autorisations
       FROM employees WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [Number(req.user?.id)]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Employé introuvable' });
    const [clientQuotas] = await pool.query(
      'SELECT client_id, remaining FROM employee_client_plafond_authorizations WHERE employee_id = ? AND remaining > 0',
      [Number(req.user.id)]
    );
    res.json({
      unlimited: false,
      bon_plafond_autorisations: Number(rows[0].bon_plafond_autorisations || 0),
      bon_client_bloque_autorisations: Number(rows[0].bon_client_bloque_autorisations || 0),
      plafond_par_client: Object.fromEntries(clientQuotas.map(row => [row.client_id, Number(row.remaining)])),
    });
  } catch (err) { next(err); }
});

router.post('/:id(\\d+)/plafond-authorizations', requireRole('PDG'), async (req, res, next) => {
  const employeeId = Number(req.params.id);
  const { client_id: clientId, quantity } = req.body ?? {};
  if (
    !Number.isSafeInteger(employeeId) || employeeId < 1 ||
    !Number.isSafeInteger(clientId) || clientId < 1 ||
    !Number.isInteger(quantity) || quantity < 1 || quantity > 100000
  ) {
    return res.status(400).json({ message: 'Choisissez un client, un employé et un nombre entier de 1 à 100000.' });
  }
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const remaining = await grantClientPlafondAuthorizations(connection, {
      employeeId, clientId, quantity, performedBy: req.user.id,
    });
    await connection.commit();
    res.status(201).json({ client_id: clientId, employee_id: employeeId, remaining });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return next(error);
  } finally {
    connection?.release();
  }
});

// Permissions courantes, toujours normalisées depuis les données rechargées
// par verifyCurrentUserWithSchedule dans le middleware global.
router.get('/me/client-collaboration-permissions', (req, res) => {
  res.json(normalizeClientCollaborationPermissions(req.user));
});

// Administration PDG : seuls les rôles qui ont déjà accès aux pages clients
// sont configurables. Les PDG sont inclus pour rendre leur bypass explicite.
router.get('/client-collaboration-permissions', requireRole('PDG'), async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, nom_complet, cin, role,
              acces_commentaires_clients, acces_rappels_clients
       FROM employees
       WHERE deleted_at IS NULL
         AND role IN ('PDG', 'Manager', 'ManagerPlus')
       ORDER BY FIELD(role, 'PDG', 'ManagerPlus', 'Manager'), nom_complet ASC, id ASC`
    );
    res.json(rows.map((employee) => ({
      id: Number(employee.id),
      nom_complet: employee.nom_complet,
      cin: employee.cin,
      role: employee.role,
      ...normalizeClientCollaborationPermissions(employee),
      verrouille: employee.role === 'PDG',
    })));
  } catch (err) { next(err); }
});

router.put('/client-collaboration-permissions/:id(\\d+)', requireRole('PDG'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const parsed = parseStrictClientCollaborationPermissions(req.body);
    if (!parsed.valid) return res.status(400).json({ message: parsed.error });

    const [rows] = await pool.query(
      `SELECT id, nom_complet, cin, role
       FROM employees WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [id]
    );
    const employee = rows[0];
    if (!employee) return res.status(404).json({ message: 'Employé introuvable' });
    if (employee.role === 'PDG') {
      return res.status(400).json({ message: 'Le PDG est toujours autorisé.' });
    }
    if (!['Manager', 'ManagerPlus'].includes(employee.role)) {
      return res.status(400).json({
        message: 'Seuls les rôles Manager et ManagerPlus peuvent recevoir cet accès.',
      });
    }

    const permissions = parsed.permissions;
    await pool.query(
      `UPDATE employees
       SET acces_commentaires_clients = ?, acces_rappels_clients = ?,
           updated_by = ?, updated_at = NOW()
       WHERE id = ? AND deleted_at IS NULL`,
      [
        permissions.commentaires_clients ? 1 : 0,
        permissions.rappels_clients ? 1 : 0,
        req.user.id,
        id,
      ]
    );

    return res.json({
      ...employee,
      ...permissions,
      verrouille: false,
    });
  } catch (err) { next(err); }
});

router.get('/me/maalem-review-permissions', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(normalizeMaalemReviewPermissions(req.user));
});

router.get('/maalem-review-permissions', requireRole('PDG'), async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, nom_complet, cin, role, acces_avis_maalem, moderation_avis_maalem,
              restauration_avis_maalem, details_prives_avis_maalem
       FROM employees
       WHERE deleted_at IS NULL AND role IN ('PDG', 'Manager', 'ManagerPlus')
       ORDER BY FIELD(role, 'PDG', 'ManagerPlus', 'Manager'), nom_complet ASC, id ASC`
    );
    res.set('Cache-Control', 'no-store');
    return res.json(rows.map((employee) => ({
      id: Number(employee.id), nom_complet: employee.nom_complet, cin: employee.cin,
      role: employee.role, ...normalizeMaalemReviewPermissions(employee),
      verrouille: employee.role === 'PDG',
    })));
  } catch (error) { return next(error); }
});

router.put('/maalem-review-permissions/:id(\\d+)', requireRole('PDG'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const parsed = parseStrictMaalemReviewPermissions(req.body);
    if (!parsed.valid) return res.status(400).json({ message: parsed.error });
    const [rows] = await pool.query(
      'SELECT id, nom_complet, cin, role FROM employees WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [id]
    );
    const employee = rows[0];
    if (!employee) return res.status(404).json({ message: 'Employé introuvable' });
    if (employee.role === 'PDG') return res.status(400).json({ message: 'Le PDG est toujours autorisé.' });
    if (!['Manager', 'ManagerPlus'].includes(employee.role)) {
      return res.status(400).json({ message: 'Seuls Manager et ManagerPlus peuvent recevoir cet accès.' });
    }
    const permissions = parsed.permissions;
    await pool.query(
      `UPDATE employees SET acces_avis_maalem = ?, moderation_avis_maalem = ?,
         restauration_avis_maalem = ?, details_prives_avis_maalem = ?,
         updated_by = ?, updated_at = NOW()
       WHERE id = ? AND deleted_at IS NULL`,
      [permissions.view ? 1 : 0, permissions.moderate ? 1 : 0,
        permissions.restore ? 1 : 0, permissions.view_private_details ? 1 : 0,
        req.user.id, id]
    );
    res.set('Cache-Control', 'no-store');
    return res.json({ ...employee, ...permissions, verrouille: false });
  } catch (error) { return next(error); }
});

router.get('/:id(\\d+)', requireEmployeePagePermission('view', 'id'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query(`SELECT ${EMPLOYEE_SELECT} FROM employees WHERE id = ? AND deleted_at IS NULL`, [id]);
    const emp = rows[0];
    if (!emp) return res.status(404).json({ message: 'Employé introuvable' });
    if (req.user?.role !== 'PDG' && Number(req.user?.id) !== id) {
      if (!normalizeEmployeePagePermissions(req.user).salary_details) emp.salaire = null;
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
  let connection;
  try {
    const id = Number(req.params.id);
    const {
      nom_complet, cin, date_embauche, role, salaire, password,
      bon_plafond_autorisations, bon_client_bloque_autorisations,
    } = req.body;
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
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [[employee]] = await connection.query(
      'SELECT bon_plafond_autorisations, bon_client_bloque_autorisations FROM employees WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );
    if (!employee) {
      await connection.rollback();
      return res.status(404).json({ message: 'Employé introuvable' });
    }
    const sql = `UPDATE employees SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);
    await connection.query(sql, values);
    const authorizationChanges = [
      ['PLAFOND', plafondCount, Number(employee.bon_plafond_autorisations || 0)],
      ['CLIENT_BLOQUE', blockedCount, Number(employee.bon_client_bloque_autorisations || 0)],
    ].filter(([, nextValue, oldValue]) => nextValue !== undefined && nextValue !== oldValue);
    for (const [authorizationType, nextValue, oldValue] of authorizationChanges) {
      await connection.query(
        `INSERT INTO employee_bon_authorization_events
         (employee_id, authorization_type, action, quantity, balance_after, performed_by)
         VALUES (?, ?, 'SET', ?, ?, ?)`,
        [id, authorizationType, nextValue - oldValue, nextValue, req.user.id]
      );
    }
    const [rows] = await connection.query(`SELECT ${EMPLOYEE_SELECT} FROM employees WHERE id = ?`, [id]);
    await connection.commit();
    res.json(rows[0]);
  } catch (err) {
    if (connection) await connection.rollback();
    next(err);
  } finally {
    connection?.release();
  }
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
router.get('/deleted/list', requireEmployeePagePermission('archives'), async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, nom_complet, cin, date_embauche, role, salaire, deleted_at, updated_by FROM employees WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC'
    );
    if (!normalizeEmployeePagePermissions(req.user).salary_details) {
      rows.forEach((employee) => { employee.salaire = null; });
    }
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
