import crypto from 'crypto';
import fs from 'fs';
import fsPromises from 'fs/promises';
import multer from 'multer';
import path from 'path';
import { Router } from 'express';
import { fileURLToPath } from 'url';
import pool from '../db/pool.js';
import { assertUploadedFileKind } from '../utils/uploadValidation.js';
import {
  canManageServices,
  normalizeServiceRow,
  parseServiceStatus,
  validateServiceInput,
} from '../utils/serviceCatalog.js';

const publicRouter = Router();
const adminRouter = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDirectory = path.resolve(__dirname, '..', 'uploads', 'services');

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    if (!fs.existsSync(uploadsDirectory)) fs.mkdirSync(uploadsDirectory, { recursive: true });
    callback(null, uploadsDirectory);
  },
  filename: (_req, file, callback) => {
    callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const validMime = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    const validExtension = ['.jpg', '.jpeg', '.png', '.webp'].includes(extension);
    if (!validMime || !validExtension) {
      const error = new Error('Seules les images JPG, PNG et WebP sont autorisées');
      error.status = 400;
      return callback(error);
    }
    return callback(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 20 },
});

function maybeUploadImage(req, res, next) {
  if (!String(req.headers['content-type'] || '').toLowerCase().includes('multipart/form-data')) {
    return next();
  }
  return upload.single('image')(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: "L'image est limitée à 10 Mo" });
    }
    return res.status(error.status || 400).json({ message: error.message || 'Image invalide' });
  });
}

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function requireServiceAdmin(req, res, next) {
  if (!canManageServices(req.user)) return res.status(403).json({ message: 'Rôle insuffisant' });
  return next();
}

async function removeUploadedFile(file) {
  if (file?.path) await fsPromises.unlink(file.path).catch(() => {});
}

function resolveStoredServiceImage(imageUrl) {
  const prefix = '/uploads/services/';
  if (!String(imageUrl || '').startsWith(prefix)) return null;
  const absolute = path.resolve(uploadsDirectory, path.basename(String(imageUrl)));
  return path.dirname(absolute) === uploadsDirectory ? absolute : null;
}

async function removeStoredServiceImage(imageUrl) {
  const absolute = resolveStoredServiceImage(imageUrl);
  if (absolute) await fsPromises.unlink(absolute).catch(() => {});
}

function validationResponse(res, result) {
  return res.status(400).json({ message: 'Données de service invalides', errors: result.errors });
}

function handleDatabaseError(error, res, next) {
  if (error?.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'Un service avec ce nom existe déjà' });
  }
  return next(error);
}

function toPublicService(service) {
  const {
    created_by: _createdBy,
    updated_by: _updatedBy,
    deleted_at: _deletedAt,
    ...publicService
  } = service;
  return {
    ...publicService,
    categories: service.categories.map(({ deleted_at: _categoryDeletedAt, ...category }) => category),
  };
}

async function loadCategoriesForServices(db, services, { publicOnly = false } = {}) {
  if (services.length === 0) return services;
  const ids = services.map((service) => Number(service.id));
  const placeholders = ids.map(() => '?').join(', ');
  const availability = publicOnly ? ' AND mc.is_active = 1 AND mc.deleted_at IS NULL' : '';
  const [rows] = await db.query(
    `SELECT smc.service_id, mc.id, mc.nom, mc.nom_ar, mc.description,
            mc.is_active, mc.deleted_at
     FROM service_maalem_categories smc
     INNER JOIN maalem_categories mc ON mc.id = smc.category_id${availability}
     WHERE smc.service_id IN (${placeholders})
     ORDER BY mc.nom ASC, mc.id ASC`,
    ids
  );
  const byService = new Map(ids.map((id) => [id, []]));
  for (const row of rows) {
    byService.get(Number(row.service_id))?.push({
      id: Number(row.id),
      nom: row.nom,
      nom_ar: row.nom_ar,
      description: row.description ?? null,
      is_active: Boolean(row.is_active),
      deleted_at: row.deleted_at ?? null,
    });
  }
  return services.map((service) => normalizeServiceRow({
    ...service,
    categories: byService.get(Number(service.id)) || [],
  }));
}

async function findServiceById(db, id, { publicOnly = false, forUpdate = false } = {}) {
  const conditions = ['id = ?', 'deleted_at IS NULL'];
  if (publicOnly) conditions.push('is_active = 1');
  const [rows] = await db.query(
    `SELECT id, nom, nom_ar, description, description_ar, image_url, is_active,
            created_by, updated_by, created_at, updated_at, deleted_at
     FROM services
     WHERE ${conditions.join(' AND ')}
     LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [id]
  );
  if (!rows[0]) return null;
  return (await loadCategoriesForServices(db, rows, { publicOnly }))[0];
}

async function validateNewCategoryAssociations(db, requestedIds, existingIds = []) {
  const existing = new Set(existingIds.map(Number));
  const newIds = requestedIds.filter((id) => !existing.has(id));
  if (newIds.length === 0) return true;
  const placeholders = newIds.map(() => '?').join(', ');
  const [rows] = await db.query(
    `SELECT id FROM maalem_categories
     WHERE id IN (${placeholders}) AND is_active = 1 AND deleted_at IS NULL
     FOR UPDATE`,
    newIds
  );
  return new Set(rows.map((row) => Number(row.id))).size === newIds.length;
}

async function hasActiveRequestedCategory(db, requestedIds) {
  const placeholders = requestedIds.map(() => '?').join(', ');
  const [rows] = await db.query(
    `SELECT id FROM maalem_categories
     WHERE id IN (${placeholders}) AND is_active = 1 AND deleted_at IS NULL
     LIMIT 1 FOR UPDATE`,
    requestedIds
  );
  return rows.length > 0;
}

async function replaceCategoryAssociations(db, serviceId, categoryIds) {
  await db.query('DELETE FROM service_maalem_categories WHERE service_id = ?', [serviceId]);
  const placeholders = categoryIds.map(() => '(?, ?)').join(', ');
  const params = categoryIds.flatMap((categoryId) => [serviceId, categoryId]);
  await db.query(
    `INSERT INTO service_maalem_categories (service_id, category_id) VALUES ${placeholders}`,
    params
  );
}

publicRouter.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, nom, nom_ar, description, description_ar, image_url, is_active,
              created_by, updated_by, created_at, updated_at, deleted_at
       FROM services
       WHERE is_active = 1 AND deleted_at IS NULL
       ORDER BY nom ASC, id ASC`
    );
    const services = await loadCategoriesForServices(pool, rows, { publicOnly: true });
    return res.json(services.map(toPublicService));
  } catch (error) {
    return next(error);
  }
});

publicRouter.get('/:id', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Identifiant invalide' });
  try {
    const service = await findServiceById(pool, id, { publicOnly: true });
    if (!service) return res.status(404).json({ message: 'Service introuvable' });
    return res.json(toPublicService(service));
  } catch (error) {
    return next(error);
  }
});

adminRouter.use(requireServiceAdmin);

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
    const categoryId = req.query.category_id == null || req.query.category_id === ''
      ? null
      : parseId(req.query.category_id);
    if (req.query.category_id != null && req.query.category_id !== '' && !categoryId) {
      return res.status(400).json({ message: 'Filtre de catégorie invalide' });
    }

    const conditions = ['s.deleted_at IS NULL'];
    const params = [];
    if (status !== 'all') {
      conditions.push('s.is_active = ?');
      params.push(status === 'active' ? 1 : 0);
    }
    if (search) {
      conditions.push('(s.nom LIKE ? OR s.nom_ar LIKE ? OR s.description LIKE ? OR s.description_ar LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }
    if (categoryId) {
      conditions.push(`EXISTS (
        SELECT 1 FROM service_maalem_categories filter_smc
        WHERE filter_smc.service_id = s.id AND filter_smc.category_id = ?
      )`);
      params.push(categoryId);
    }
    const [rows] = await pool.query(
      `SELECT s.id, s.nom, s.nom_ar, s.description, s.description_ar, s.image_url,
              s.is_active, s.created_by, s.updated_by, s.created_at, s.updated_at, s.deleted_at
       FROM services s
       WHERE ${conditions.join(' AND ')}
       ORDER BY s.nom ASC, s.id ASC`,
      params
    );
    return res.json(await loadCategoriesForServices(pool, rows));
  } catch (error) {
    return next(error);
  }
});

adminRouter.get('/:id', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Identifiant invalide' });
  try {
    const service = await findServiceById(pool, id);
    if (!service) return res.status(404).json({ message: 'Service introuvable' });
    return res.json(service);
  } catch (error) {
    return next(error);
  }
});

adminRouter.post('/', maybeUploadImage, async (req, res, next) => {
  const validation = validateServiceInput(req.body);
  if (!validation.valid) {
    await removeUploadedFile(req.file);
    return validationResponse(res, validation);
  }
  const connection = await pool.getConnection();
  let committed = false;
  try {
    if (req.file) await assertUploadedFileKind(req.file, ['jpeg', 'png', 'webp']);
    await connection.beginTransaction();
    const value = validation.value;
    if (!(await validateNewCategoryAssociations(connection, value.category_ids))) {
      await connection.rollback();
      return res.status(400).json({ message: 'Une catégorie Maalem est inactive, supprimée ou introuvable' });
    }
    const imageUrl = req.file ? `/uploads/services/${req.file.filename}` : null;
    const [result] = await connection.query(
      `INSERT INTO services
        (nom, nom_ar, description, description_ar, image_url, is_active, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [value.nom, value.nom_ar, value.description, value.description_ar, imageUrl,
        value.is_active ? 1 : 0, req.user.id, req.user.id]
    );
    await replaceCategoryAssociations(connection, result.insertId, value.category_ids);
    await connection.commit();
    committed = true;
    return res.status(201).json(await findServiceById(pool, result.insertId));
  } catch (error) {
    if (!committed) {
      await connection.rollback().catch(() => {});
      await removeUploadedFile(req.file);
    }
    return handleDatabaseError(error, res, next);
  } finally {
    connection.release();
    if (!committed) await removeUploadedFile(req.file);
  }
});

adminRouter.put('/:id', maybeUploadImage, async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) {
    await removeUploadedFile(req.file);
    return res.status(400).json({ message: 'Identifiant invalide' });
  }
  const validation = validateServiceInput(req.body);
  if (!validation.valid) {
    await removeUploadedFile(req.file);
    return validationResponse(res, validation);
  }

  const connection = await pool.getConnection();
  let committed = false;
  let previousImageUrl = null;
  try {
    if (req.file) await assertUploadedFileKind(req.file, ['jpeg', 'png', 'webp']);
    await connection.beginTransaction();
    const [serviceRows] = await connection.query(
      `SELECT id, image_url FROM services
       WHERE id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,
      [id]
    );
    if (!serviceRows[0]) {
      await connection.rollback();
      return res.status(404).json({ message: 'Service introuvable' });
    }
    previousImageUrl = serviceRows[0].image_url;
    const [categoryRows] = await connection.query(
      'SELECT category_id FROM service_maalem_categories WHERE service_id = ? FOR UPDATE',
      [id]
    );
    const existingCategoryIds = categoryRows.map((row) => Number(row.category_id));
    const value = validation.value;
    if (!(await validateNewCategoryAssociations(connection, value.category_ids, existingCategoryIds))) {
      await connection.rollback();
      return res.status(400).json({ message: 'Une nouvelle catégorie Maalem est inactive, supprimée ou introuvable' });
    }
    if (value.is_active && !(await hasActiveRequestedCategory(connection, value.category_ids))) {
      await connection.rollback();
      return res.status(400).json({ message: 'Un service actif doit conserver au moins une catégorie Maalem active' });
    }
    const nextImageUrl = req.file
      ? `/uploads/services/${req.file.filename}`
      : value.remove_image ? null : previousImageUrl;
    await connection.query(
      `UPDATE services
       SET nom = ?, nom_ar = ?, description = ?, description_ar = ?, image_url = ?,
           is_active = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND deleted_at IS NULL`,
      [value.nom, value.nom_ar, value.description, value.description_ar, nextImageUrl,
        value.is_active ? 1 : 0, req.user.id, id]
    );
    await replaceCategoryAssociations(connection, id, value.category_ids);
    await connection.commit();
    committed = true;
    if ((req.file || value.remove_image) && previousImageUrl && previousImageUrl !== nextImageUrl) {
      await removeStoredServiceImage(previousImageUrl);
    }
    return res.json(await findServiceById(pool, id));
  } catch (error) {
    if (!committed) {
      await connection.rollback().catch(() => {});
      await removeUploadedFile(req.file);
    }
    return handleDatabaseError(error, res, next);
  } finally {
    connection.release();
    if (!committed) await removeUploadedFile(req.file);
  }
});

adminRouter.patch('/:id/status', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Identifiant invalide' });
  const status = parseServiceStatus(req.body);
  if (!status.valid) return res.status(400).json({ message: status.error });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [serviceRows] = await connection.query(
      'SELECT id FROM services WHERE id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE',
      [id]
    );
    if (!serviceRows[0]) {
      await connection.rollback();
      return res.status(404).json({ message: 'Service introuvable' });
    }
    if (status.is_active) {
      const [categoryRows] = await connection.query(
        `SELECT 1
         FROM service_maalem_categories smc
         INNER JOIN maalem_categories mc ON mc.id = smc.category_id
         WHERE smc.service_id = ? AND mc.is_active = 1 AND mc.deleted_at IS NULL
         LIMIT 1 FOR UPDATE`,
        [id]
      );
      if (categoryRows.length === 0) {
        await connection.rollback();
        return res.status(409).json({ message: 'Associez au moins une catégorie Maalem active avant d\'activer ce service' });
      }
    }
    await connection.query(
      `UPDATE services
       SET is_active = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND deleted_at IS NULL`,
      [status.is_active ? 1 : 0, req.user.id, id]
    );
    await connection.commit();
    return res.json(await findServiceById(pool, id));
  } catch (error) {
    await connection.rollback().catch(() => {});
    return next(error);
  } finally {
    connection.release();
  }
});

adminRouter.delete('/:id', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Identifiant invalide' });
  try {
    const [result] = await pool.query(
      `UPDATE services
       SET is_active = 0, deleted_at = CURRENT_TIMESTAMP,
           updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND deleted_at IS NULL`,
      [req.user.id, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Service introuvable' });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export { publicRouter as publicServicesRouter };
export default adminRouter;
