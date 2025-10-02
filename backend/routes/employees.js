import { Router } from 'express';
import pool from '../db/pool.js';
import bcrypt from 'bcryptjs';

const router = Router();

// Helper: convert undefined, null, or empty/whitespace-only strings to null; trim strings
function clean(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    return t === '' ? null : t;
  }
  return value;
}

router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, nom_complet, cin, date_embauche, role, salaire, created_by, updated_by, created_at, updated_at FROM employees WHERE deleted_at IS NULL ORDER BY id DESC');
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query('SELECT id, nom_complet, cin, date_embauche, role, salaire, created_by, updated_by, created_at, updated_at FROM employees WHERE id = ? AND deleted_at IS NULL', [id]);
    const emp = rows[0];
    if (!emp) return res.status(404).json({ message: 'Employé introuvable' });
    res.json(emp);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
  const { nom_complet, cin, date_embauche, role, salaire, password, created_by } = req.body;

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
    const [result] = await pool.query(
      'INSERT INTO employees (nom_complet, cin, date_embauche, role, salaire, password, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [clean(nom_complet), cinTrim, clean(date_embauche), clean(role), clean(salaire), hashed, clean(created_by), now, now]
    );
    const id = result.insertId;
    const [rows] = await pool.query('SELECT id, nom_complet, cin, date_embauche, role, salaire, created_by, updated_by, created_at, updated_at FROM employees WHERE id = ?', [id]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// eslint-disable-next-line sonarjs/cognitive-complexity
router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { nom_complet, cin, date_embauche, role, salaire, password, updated_by } = req.body;
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
    if (password && typeof password === 'string' && password.trim()) {
      const hashed = await bcrypt.hash(password.trim(), 10);
      fields.push('password = ?'); values.push(hashed);
    }
    if (updated_by !== undefined) { fields.push('updated_by = ?'); values.push(clean(updated_by)); }
    fields.push('updated_at = ?'); values.push(now);
    if (fields.length === 0) {
      const [rows] = await pool.query('SELECT id, nom_complet, cin, date_embauche, role, salaire, created_by, updated_by, created_at, updated_at FROM employees WHERE id = ?', [id]);
      return res.json(rows[0]);
    }
    const sql = `UPDATE employees SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);
    await pool.query(sql, values);
  const [rows] = await pool.query('SELECT id, nom_complet, cin, date_embauche, role, salaire, created_by, updated_by, created_at, updated_at FROM employees WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { updated_by } = req.body;
    
    const [empRows] = await pool.query('SELECT role FROM employees WHERE id = ? AND deleted_at IS NULL', [id]);
    if (empRows.length === 0) return res.status(404).json({ message: 'Employé introuvable' });
    
    if (empRows[0].role === 'PDG') {
      const [pdgCountRows] = await pool.query("SELECT COUNT(*) as cnt FROM employees WHERE role = 'PDG' AND deleted_at IS NULL");
      if (pdgCountRows[0].cnt <= 1) return res.status(400).json({ message: 'Impossible de supprimer le dernier PDG' });
    }
    
    // Soft delete: set deleted_at timestamp
    const now = new Date();
    await pool.query('UPDATE employees SET deleted_at = ?, updated_by = ?, updated_at = ? WHERE id = ?', [now, updated_by, now, id]);
    res.status(204).send();
  } catch (err) { next(err); }
});

// Route pour récupérer les employés supprimés (pour l'administration)
router.get('/deleted/list', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, nom_complet, cin, date_embauche, role, salaire, deleted_at, updated_by FROM employees WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Route pour restaurer un employé supprimé
router.post('/:id/restore', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { updated_by } = req.body;
    
    const [empRows] = await pool.query('SELECT id FROM employees WHERE id = ? AND deleted_at IS NOT NULL', [id]);
    if (empRows.length === 0) return res.status(404).json({ message: 'Employé supprimé introuvable' });
    
    const now = new Date();
    await pool.query('UPDATE employees SET deleted_at = NULL, updated_by = ?, updated_at = ? WHERE id = ?', [updated_by, now, id]);
    
    // Retourner l'employé restauré
    const [rows] = await pool.query('SELECT id, nom_complet, cin, date_embauche, role, salaire, created_by, updated_by, created_at, updated_at FROM employees WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
