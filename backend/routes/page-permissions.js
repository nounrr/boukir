import express from 'express';
import pool from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import {
  PAGE_PERMISSION_COLUMNS,
  ensurePagePermissionSchema,
  getPagePermissionCatalog,
  normalizePagePermissions,
  parsePagePermissionUpdate,
} from '../utils/pagePermissionsRegistry.js';

/**
 * Console d'autorisations du PDG : une seule page pour accorder ou retirer,
 * employe par employe, l'acces a chaque page protegee.
 *
 * Ce routeur n'introduit aucun nouveau stockage. Il ecrit dans les memes
 * colonnes que les ecrans d'autorisation existants, qui continuent de
 * fonctionner sans changement.
 */
const router = express.Router();

router.use(requireRole('PDG'));
router.use(async (_req, _res, next) => {
  try {
    await ensurePagePermissionSchema();
    next();
  } catch (error) { next(error); }
});

const EMPLOYEE_COLUMNS = ['id', 'nom_complet', 'cin', 'role', ...PAGE_PERMISSION_COLUMNS].join(', ');

const toRow = (employee) => ({
  id: Number(employee.id),
  nom_complet: employee.nom_complet,
  cin: employee.cin,
  role: employee.role,
  verrouille: employee.role === 'PDG',
  permissions: normalizePagePermissions(employee),
});

// Metadonnees des pages et de leurs droits. Sert a construire la grille.
router.get('/catalog', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ groups: getPagePermissionCatalog() });
});

// Matrice complete : un employe par ligne, tous les droits normalises.
router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT ${EMPLOYEE_COLUMNS}
       FROM employees
       WHERE deleted_at IS NULL
       ORDER BY FIELD(role, 'PDG', 'ManagerPlus', 'Manager'), nom_complet ASC, id ASC`
    );
    res.set('Cache-Control', 'no-store');
    res.json({ groups: getPagePermissionCatalog(), employees: rows.map(toRow) });
  } catch (err) { next(err); }
});

// Mise a jour partielle : { permissions: { "groupe.droit": booleen, ... } }.
router.put('/:id(\\d+)', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query(
      `SELECT ${EMPLOYEE_COLUMNS} FROM employees WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [id]
    );
    const employee = rows[0];
    if (!employee) return res.status(404).json({ message: 'Employe introuvable' });
    if (employee.role === 'PDG') {
      return res.status(400).json({ message: 'Le PDG est toujours autorise.' });
    }

    const parsed = parsePagePermissionUpdate(req.body, employee);
    if (!parsed.valid) return res.status(400).json({ message: parsed.error });

    const assignments = parsed.columns.map(({ column }) => `${column} = ?`).join(', ');
    const values = parsed.columns.map(({ value }) => (value ? 1 : 0));
    await pool.query(
      `UPDATE employees
       SET ${assignments}, updated_by = ?, updated_at = NOW()
       WHERE id = ? AND deleted_at IS NULL`,
      [...values, req.user.id, id]
    );

    const [updatedRows] = await pool.query(
      `SELECT ${EMPLOYEE_COLUMNS} FROM employees WHERE id = ? LIMIT 1`,
      [id]
    );
    res.set('Cache-Control', 'no-store');
    res.json(toRow(updatedRows[0]));
  } catch (err) { next(err); }
});

export default router;
