import { Router } from 'express';
import pool from '../db/pool.js';
import {
  canManageMaalemCategories,
  normalizeMaalemCategoryRow,
  parseMaalemCategoryStatus,
  validateMaalemCategoryInput,
} from '../utils/maalemCategory.js';

const publicRouter = Router();
const adminRouter = Router();

const SELECT_COLUMNS = `
  id, nom, nom_ar, description, is_active,
  created_by, updated_by, created_at, updated_at, deleted_at
`;

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function requireMaalemCategoryAdmin(req, res, next) {
  if (!canManageMaalemCategories(req.user)) {
    return res.status(403).json({ message: 'Rôle insuffisant' });
  }
  return next();
}

function validationResponse(res, result) {
  return res.status(400).json({
    message: 'Données de catégorie invalides',
    errors: result.errors,
  });
}

function handleDatabaseError(error, res, next) {
  if (error?.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'Une catégorie Maalem avec ce nom existe déjà' });
  }
  return next(error);
}

async function findCategoryById(id) {
  const [rows] = await pool.query(
    `SELECT ${SELECT_COLUMNS}
     FROM maalem_categories
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [id]
  );
  return rows[0] ? normalizeMaalemCategoryRow(rows[0]) : null;
}

// Future registration/candidate forms must consume this endpoint: inactive and
// soft-deleted categories are intentionally never returned.
publicRouter.get('/active', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, nom, nom_ar, description
       FROM maalem_categories
       WHERE is_active = 1 AND deleted_at IS NULL
       ORDER BY nom ASC, id ASC`
    );
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
});

// All administrative actions are explicitly restricted in addition to the
// application's global employee authentication middleware.
adminRouter.use(requireMaalemCategoryAdmin);

adminRouter.get('/', async (req, res, next) => {
  try {
    const status = String(req.query.status || 'all').trim().toLowerCase();
    if (!['all', 'active', 'inactive'].includes(status)) {
      return res.status(400).json({ message: 'Filtre de statut invalide' });
    }

    const search = String(req.query.q || '').trim();
    if (search.length > 100) {
      return res.status(400).json({ message: 'La recherche ne peut pas dépasser 100 caractères' });
    }

    const conditions = ['deleted_at IS NULL'];
    const params = [];
    if (status !== 'all') {
      conditions.push('is_active = ?');
      params.push(status === 'active' ? 1 : 0);
    }
    if (search) {
      conditions.push('(nom LIKE ? OR nom_ar LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term);
    }

    const [rows] = await pool.query(
      `SELECT ${SELECT_COLUMNS}
       FROM maalem_categories
       WHERE ${conditions.join(' AND ')}
       ORDER BY nom ASC, id ASC`,
      params
    );
    return res.json(rows.map(normalizeMaalemCategoryRow));
  } catch (error) {
    return next(error);
  }
});

adminRouter.post('/', async (req, res, next) => {
  const validation = validateMaalemCategoryInput(req.body);
  if (!validation.valid) return validationResponse(res, validation);

  try {
    const { nom, nom_ar, description, is_active } = validation.value;
    const [result] = await pool.query(
      `INSERT INTO maalem_categories
        (nom, nom_ar, description, is_active, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [nom, nom_ar, description, is_active ? 1 : 0, req.user.id, req.user.id]
    );
    const category = await findCategoryById(result.insertId);
    return res.status(201).json(category);
  } catch (error) {
    return handleDatabaseError(error, res, next);
  }
});

adminRouter.put('/:id', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Identifiant invalide' });

  const validation = validateMaalemCategoryInput(req.body);
  if (!validation.valid) return validationResponse(res, validation);

  try {
    if (!(await findCategoryById(id))) {
      return res.status(404).json({ message: 'Catégorie Maalem introuvable' });
    }

    const { nom, nom_ar, description, is_active } = validation.value;
    await pool.query(
      `UPDATE maalem_categories
       SET nom = ?, nom_ar = ?, description = ?, is_active = ?,
           updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND deleted_at IS NULL`,
      [nom, nom_ar, description, is_active ? 1 : 0, req.user.id, id]
    );
    return res.json(await findCategoryById(id));
  } catch (error) {
    return handleDatabaseError(error, res, next);
  }
});

adminRouter.patch('/:id/status', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Identifiant invalide' });

  const status = parseMaalemCategoryStatus(req.body);
  if (!status.valid) return res.status(400).json({ message: status.error });

  try {
    const [result] = await pool.query(
      `UPDATE maalem_categories
       SET is_active = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND deleted_at IS NULL`,
      [status.is_active ? 1 : 0, req.user.id, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Catégorie Maalem introuvable' });
    }
    return res.json(await findCategoryById(id));
  } catch (error) {
    return next(error);
  }
});

export { publicRouter as publicMaalemCategoriesRouter };
export default adminRouter;
