import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs/promises';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { detectBufferKind } from '../utils/uploadValidation.js';
import { canManagePendingMaalemApplication } from '../utils/maalemRegistration.js';
import {
  MAALEM_PROFILE_STATUSES,
  canAdminTransitionMaalemStatus,
  canEditMaalemDraft,
  findMaalemProfileByContactId,
  normalizeMaalemProfileRow,
  validateMaalemAdminStatusInput,
  validateMaalemDraftInput,
  validateMaalemSubmission,
} from '../utils/maalemProfile.js';

const selfRouter = Router();
const adminRouter = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const privateDocumentsRoot = path.resolve(__dirname, '..', 'private_uploads', 'maalem_profiles');
const DOCUMENT_LIMIT = 5 * 1024 * 1024;
const MAX_REALIZATIONS = 8;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCUMENT_LIMIT, files: MAX_REALIZATIONS, fields: 10 },
});

function handleMulter(middleware) {
  return (req, res, next) => middleware(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'Chaque fichier est limité à 5 Mo' });
    }
    return res.status(400).json({ message: error.message || 'Fichier invalide' });
  });
}

const receiveCv = handleMulter(upload.single('file'));
const receiveRealizations = handleMulter(upload.array('files', MAX_REALIZATIONS));

const KIND_EXTENSIONS = Object.freeze({ pdf: '.pdf', jpeg: '.jpg', png: '.png', webp: '.webp' });
const KIND_MIME_TYPES = Object.freeze({
  pdf: 'application/pdf',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
});

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function requireEcommerceUser(req, res, next) {
  if (!req.user?.id || req.user?.role || req.user?.type_compte == null) {
    return res.status(403).json({ message: 'Compte e-commerce requis' });
  }
  return next();
}

async function loadContactForUpdate(connection, contactId) {
  const [rows] = await connection.query(
    `SELECT id, type_compte, demande_artisan, artisan_approuve, auth_provider, telephone
     FROM contacts
     WHERE id = ? AND deleted_at IS NULL AND auth_provider != 'none'
     LIMIT 1
     FOR UPDATE`,
    [contactId]
  );
  return rows[0] || null;
}

async function loadProfileForUpdate(connection, contactId) {
  const [rows] = await connection.query(
    `SELECT id, contact_id, category_id, status, professional_data
     FROM maalem_profiles
     WHERE contact_id = ? AND deleted_at IS NULL
     LIMIT 1
     FOR UPDATE`,
    [contactId]
  );
  return rows[0] || null;
}

function normalizeDocumentRow(row) {
  return {
    id: Number(row.id),
    profile_id: Number(row.profile_id),
    kind: row.kind,
    original_name: row.original_name,
    mime_type: row.mime_type,
    file_size: Number(row.file_size),
    created_at: row.created_at,
  };
}

async function listProfileDocuments(db, profileId) {
  const [rows] = await db.query(
    `SELECT id, profile_id, kind, original_name, mime_type, file_size, created_at
     FROM maalem_profile_documents
     WHERE profile_id = ? AND deleted_at IS NULL
     ORDER BY kind ASC, created_at DESC, id DESC`,
    [profileId]
  );
  return rows.map(normalizeDocumentRow);
}

function resolvePrivateDocument(storageKey) {
  const absolutePath = path.resolve(privateDocumentsRoot, String(storageKey || ''));
  const relative = path.relative(privateDocumentsRoot, absolutePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return absolutePath;
}

async function loadOwnedEditableProfile(contactId) {
  const [rows] = await pool.query(
    `SELECT mp.id, mp.contact_id, mp.status,
            c.type_compte, c.demande_artisan, c.artisan_approuve
     FROM maalem_profiles mp
     INNER JOIN contacts c ON c.id = mp.contact_id
     WHERE mp.contact_id = ? AND mp.deleted_at IS NULL AND c.deleted_at IS NULL
     LIMIT 1`,
    [contactId]
  );
  const profile = rows[0] || null;
  if (!profile) return { error: [404, 'Enregistrez d’abord votre brouillon Maalem'] };
  if (!canManagePendingMaalemApplication(profile, profile)) {
    return { error: [403, 'Le dossier Maalem est réservé aux comptes Artisan'] };
  }
  if (!canEditMaalemDraft(profile.status)) {
    return { error: [409, 'Les documents ne peuvent plus être modifiés dans ce statut'] };
  }
  return { profile };
}

async function lockOwnedEditableProfile(connection, profileId, contactId) {
  const [rows] = await connection.query(
    `SELECT mp.id, mp.status,
            c.type_compte, c.demande_artisan, c.artisan_approuve
     FROM maalem_profiles mp
     INNER JOIN contacts c ON c.id = mp.contact_id
     WHERE mp.id = ? AND mp.contact_id = ?
       AND mp.deleted_at IS NULL AND c.deleted_at IS NULL
     LIMIT 1
     FOR UPDATE`,
    [profileId, contactId]
  );
  const profile = rows[0];
  return profile
    && canManagePendingMaalemApplication(profile, profile)
    && canEditMaalemDraft(profile.status)
    ? profile
    : null;
}

function validateMemoryFile(file, allowedKinds) {
  if (!file?.buffer?.length) return { valid: false, error: 'Fichier manquant' };
  if (path.basename(String(file.originalname || '')).length > 255) {
    return { valid: false, error: 'Le nom du fichier est trop long' };
  }
  const kind = detectBufferKind(file.buffer);
  if (!kind || !allowedKinds.includes(kind)) {
    return { valid: false, error: 'Le contenu réel du fichier ne correspond pas au format autorisé' };
  }
  return { valid: true, kind };
}

async function savePrivateDocument(profileId, kind, file, detectedKind) {
  const directory = path.join(privateDocumentsRoot, String(profileId));
  await fs.mkdir(directory, { recursive: true });
  const filename = `${crypto.randomUUID()}${KIND_EXTENSIONS[detectedKind]}`;
  const storageKey = `${profileId}/${filename}`;
  const absolutePath = resolvePrivateDocument(storageKey);
  await fs.writeFile(absolutePath, file.buffer, { flag: 'wx' });
  return { storageKey, absolutePath };
}

async function loadActiveCategory(connection, categoryId) {
  if (categoryId == null) return null;
  const [rows] = await connection.query(
    `SELECT id, is_active, deleted_at
     FROM maalem_categories
     WHERE id = ? AND is_active = 1 AND deleted_at IS NULL
     LIMIT 1`,
    [categoryId]
  );
  return rows[0] || null;
}

selfRouter.use(requireEcommerceUser);

// A Client receives null; creating or submitting a profile remains restricted
// to the existing Artisan account state.
selfRouter.get('/me', async (req, res, next) => {
  try {
    const profile = await findMaalemProfileByContactId(pool, req.user.id);
    if (profile) profile.documents = await listProfileDocuments(pool, profile.id);
    return res.json({ profile });
  } catch (error) {
    return next(error);
  }
});

// Idempotently creates or updates the current Artisan's draft. This never
// inserts or updates a contact/user record.
selfRouter.put('/me', async (req, res, next) => {
  const validation = validateMaalemDraftInput(req.body);
  if (!validation.valid) return res.status(400).json({ message: validation.error });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const contact = await loadContactForUpdate(connection, req.user.id);
    if (!contact) {
      await connection.rollback();
      return res.status(404).json({ message: 'Compte e-commerce introuvable' });
    }
    const existing = await loadProfileForUpdate(connection, contact.id);
    if (!canManagePendingMaalemApplication(contact, existing)) {
      await connection.rollback();
      return res.status(403).json({ message: 'Le profil Maalem est réservé aux comptes Artisan' });
    }

    if (validation.category_id != null && !(await loadActiveCategory(connection, validation.category_id))) {
      await connection.rollback();
      return res.status(400).json({ message: 'Catégorie Maalem inactive ou introuvable' });
    }

    if (existing && !canEditMaalemDraft(existing.status)) {
      await connection.rollback();
      return res.status(409).json({ message: 'Ce profil ne peut plus être modifié dans son statut actuel' });
    }

    if (existing) {
      if (validation.professional_data === undefined) {
        await connection.query(
          `UPDATE maalem_profiles
           SET category_id = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND deleted_at IS NULL`,
          [validation.category_id, existing.id]
        );
      } else {
        await connection.query(
          `UPDATE maalem_profiles
           SET category_id = ?, professional_data = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND deleted_at IS NULL`,
          [validation.category_id, JSON.stringify(validation.professional_data), existing.id]
        );
      }
    } else {
      await connection.query(
        `INSERT INTO maalem_profiles (contact_id, category_id, status, professional_data)
         VALUES (?, ?, 'draft', ?)`,
        [
          contact.id,
          validation.category_id,
          validation.professional_data === undefined ? null : JSON.stringify(validation.professional_data),
        ]
      );
    }

    await connection.commit();
    return res.json({ profile: await findMaalemProfileByContactId(pool, contact.id) });
  } catch (error) {
    await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Un profil Maalem existe déjà pour ce compte Artisan' });
    }
    return next(error);
  } finally {
    connection.release();
  }
});

selfRouter.post('/me/submit', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const contact = await loadContactForUpdate(connection, req.user.id);
    if (!contact) {
      await connection.rollback();
      return res.status(404).json({ message: 'Compte e-commerce introuvable' });
    }
    const profile = await loadProfileForUpdate(connection, contact.id);
    if (!canManagePendingMaalemApplication(contact, profile)) {
      await connection.rollback();
      return res.status(403).json({ message: 'Le profil Maalem est réservé aux comptes Artisan' });
    }

    const category = profile?.category_id == null
      ? null
      : await loadActiveCategory(connection, profile.category_id);
    const validation = validateMaalemSubmission(profile, category, contact.telephone);
    if (!validation.valid) {
      await connection.rollback();
      return res.status(400).json({ message: validation.error });
    }

    await connection.query(
      `UPDATE maalem_profiles
       SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP,
           status_reason = NULL, reviewed_at = NULL, reviewed_by = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND deleted_at IS NULL`,
      [profile.id]
    );

    await connection.commit();
    return res.json({ profile: await findMaalemProfileByContactId(pool, contact.id) });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

selfRouter.post('/me/cv', receiveCv, async (req, res, next) => {
  let savedFile = null;
  try {
    const owned = await loadOwnedEditableProfile(req.user.id);
    if (owned.error) return res.status(owned.error[0]).json({ message: owned.error[1] });
    const validation = validateMemoryFile(req.file, ['pdf']);
    if (!validation.valid) return res.status(400).json({ message: validation.error });

    savedFile = await savePrivateDocument(owned.profile.id, 'cv', req.file, validation.kind);
    const connection = await pool.getConnection();
    let previous = [];
    try {
      await connection.beginTransaction();
      if (!(await lockOwnedEditableProfile(connection, owned.profile.id, req.user.id))) {
        await connection.rollback();
        await fs.unlink(savedFile.absolutePath).catch(() => {});
        savedFile = null;
        return res.status(409).json({ message: 'Le dossier ne peut plus être modifié' });
      }
      [previous] = await connection.query(
        `SELECT storage_key FROM maalem_profile_documents
         WHERE profile_id = ? AND kind = 'cv' AND deleted_at IS NULL
         FOR UPDATE`,
        [owned.profile.id]
      );
      await connection.query(
        `UPDATE maalem_profile_documents SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE profile_id = ? AND kind = 'cv' AND deleted_at IS NULL`,
        [owned.profile.id]
      );
      const [result] = await connection.query(
        `INSERT INTO maalem_profile_documents
           (profile_id, kind, storage_key, original_name, mime_type, file_size)
         VALUES (?, 'cv', ?, ?, ?, ?)`,
        [owned.profile.id, savedFile.storageKey, path.basename(req.file.originalname), 'application/pdf', req.file.size]
      );
      await connection.commit();
      savedFile = null;
      for (const old of previous) {
        const oldPath = resolvePrivateDocument(old.storage_key);
        if (oldPath) await fs.unlink(oldPath).catch(() => {});
      }
      const documents = await listProfileDocuments(pool, owned.profile.id);
      return res.status(201).json({ document: documents.find((item) => item.id === Number(result.insertId)) });
    } catch (error) {
      await connection.rollback();
      if (savedFile?.absolutePath) await fs.unlink(savedFile.absolutePath).catch(() => {});
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (savedFile?.absolutePath) await fs.unlink(savedFile.absolutePath).catch(() => {});
    return next(error);
  }
});

selfRouter.post('/me/realizations', receiveRealizations, async (req, res, next) => {
  const savedFiles = [];
  try {
    const owned = await loadOwnedEditableProfile(req.user.id);
    if (owned.error) return res.status(owned.error[0]).json({ message: owned.error[1] });
    if (!req.files?.length) return res.status(400).json({ message: 'Au moins une photo est requise' });

    for (const file of req.files) {
      const validation = validateMemoryFile(file, ['jpeg', 'png', 'webp']);
      if (!validation.valid) return res.status(400).json({ message: validation.error });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      if (!(await lockOwnedEditableProfile(connection, owned.profile.id, req.user.id))) {
        await connection.rollback();
        return res.status(409).json({ message: 'Le dossier ne peut plus être modifié' });
      }
      const [countRows] = await connection.query(
        `SELECT COUNT(*) AS total FROM maalem_profile_documents
         WHERE profile_id = ? AND kind = 'realization' AND deleted_at IS NULL`,
        [owned.profile.id]
      );
      if (Number(countRows[0]?.total || 0) + req.files.length > MAX_REALIZATIONS) {
        await connection.rollback();
        return res.status(400).json({ message: `Vous pouvez conserver au maximum ${MAX_REALIZATIONS} réalisations` });
      }
      for (const file of req.files) {
        const detectedKind = detectBufferKind(file.buffer);
        const saved = await savePrivateDocument(owned.profile.id, 'realization', file, detectedKind);
        savedFiles.push(saved);
        await connection.query(
          `INSERT INTO maalem_profile_documents
             (profile_id, kind, storage_key, original_name, mime_type, file_size)
           VALUES (?, 'realization', ?, ?, ?, ?)`,
          [
            owned.profile.id,
            saved.storageKey,
            path.basename(file.originalname),
            KIND_MIME_TYPES[detectedKind],
            file.size,
          ]
        );
      }
      await connection.commit();
      savedFiles.length = 0;
      return res.status(201).json({ documents: await listProfileDocuments(pool, owned.profile.id) });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    for (const saved of savedFiles) await fs.unlink(saved.absolutePath).catch(() => {});
    return next(error);
  }
});

selfRouter.get('/me/documents/:id/download', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Identifiant invalide' });
  try {
    const [rows] = await pool.query(
      `SELECT mpd.storage_key, mpd.original_name, mpd.mime_type
       FROM maalem_profile_documents mpd
       INNER JOIN maalem_profiles mp ON mp.id = mpd.profile_id
       WHERE mpd.id = ? AND mp.contact_id = ?
         AND mpd.deleted_at IS NULL AND mp.deleted_at IS NULL
       LIMIT 1`,
      [id, req.user.id]
    );
    const document = rows[0];
    if (!document) return res.status(404).json({ message: 'Document introuvable' });
    const absolutePath = resolvePrivateDocument(document.storage_key);
    if (!absolutePath) return res.status(400).json({ message: 'Chemin de document invalide' });
    res.setHeader('Cache-Control', 'private, no-store');
    return res.download(absolutePath, document.original_name);
  } catch (error) {
    return next(error);
  }
});

selfRouter.delete('/me/documents/:id', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Identifiant invalide' });
  try {
    const owned = await loadOwnedEditableProfile(req.user.id);
    if (owned.error) return res.status(owned.error[0]).json({ message: owned.error[1] });
    const [result] = await pool.query(
      `UPDATE maalem_profile_documents mpd
       INNER JOIN maalem_profiles mp ON mp.id = mpd.profile_id
       INNER JOIN contacts c ON c.id = mp.contact_id
       SET mpd.deleted_at = CURRENT_TIMESTAMP, mpd.updated_at = CURRENT_TIMESTAMP
       WHERE mpd.id = ? AND mpd.profile_id = ? AND mpd.deleted_at IS NULL
         AND mp.deleted_at IS NULL AND mp.status IN ('draft', 'rejected')
         AND mp.contact_id = ? AND c.deleted_at IS NULL
         AND (c.type_compte = 'Artisan/Promoteur' OR c.artisan_approuve = 1 OR c.demande_artisan = 1)`,
      [id, owned.profile.id, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Document introuvable' });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

adminRouter.use(requireRole('PDG'));

adminRouter.get('/', async (req, res, next) => {
  try {
    const status = String(req.query.status || 'all').trim().toLowerCase();
    if (status !== 'all' && !MAALEM_PROFILE_STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Filtre de statut invalide' });
    }
    const search = String(req.query.q || '').trim();
    if (search.length > 100) {
      return res.status(400).json({ message: 'La recherche ne peut pas dépasser 100 caractères' });
    }

    const conditions = ['mp.deleted_at IS NULL', 'c.deleted_at IS NULL'];
    const params = [];
    if (status !== 'all') {
      conditions.push('mp.status = ?');
      params.push(status);
    }
    if (search) {
      conditions.push('(c.nom_complet LIKE ? OR c.email LIKE ? OR c.telephone LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    const [rows] = await pool.query(
      `SELECT mp.*,
              c.nom_complet AS contact_nom_complet,
              c.email AS contact_email,
              c.telephone AS contact_telephone,
              c.type_compte AS contact_type_compte,
              mc.nom AS category_nom,
              mc.nom_ar AS category_nom_ar,
              mc.is_active AS category_is_active
       FROM maalem_profiles mp
       INNER JOIN contacts c ON c.id = mp.contact_id
       LEFT JOIN maalem_categories mc ON mc.id = mp.category_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY mp.updated_at DESC, mp.id DESC
       LIMIT 200`,
      params
    );
    return res.json({ profiles: rows.map(normalizeMaalemProfileRow) });
  } catch (error) {
    return next(error);
  }
});

adminRouter.get('/:id/documents', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Identifiant invalide' });
  try {
    const [profiles] = await pool.query(
      'SELECT id FROM maalem_profiles WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [id]
    );
    if (!profiles[0]) return res.status(404).json({ message: 'Profil Maalem introuvable' });
    return res.json({ documents: await listProfileDocuments(pool, id) });
  } catch (error) {
    return next(error);
  }
});

adminRouter.get('/:id/documents/:documentId/download', async (req, res, next) => {
  const profileId = parseId(req.params.id);
  const documentId = parseId(req.params.documentId);
  if (!profileId || !documentId) return res.status(400).json({ message: 'Identifiant invalide' });
  try {
    const [rows] = await pool.query(
      `SELECT storage_key, original_name
       FROM maalem_profile_documents
       WHERE id = ? AND profile_id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [documentId, profileId]
    );
    const document = rows[0];
    if (!document) return res.status(404).json({ message: 'Document introuvable' });
    const absolutePath = resolvePrivateDocument(document.storage_key);
    if (!absolutePath) return res.status(400).json({ message: 'Chemin de document invalide' });
    res.setHeader('Cache-Control', 'private, no-store');
    return res.download(absolutePath, document.original_name);
  } catch (error) {
    return next(error);
  }
});

adminRouter.patch('/:id/status', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Identifiant invalide' });

  const validation = validateMaalemAdminStatusInput(req.body);
  if (!validation.valid) return res.status(400).json({ message: validation.error });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT id, contact_id, status
       FROM maalem_profiles
       WHERE id = ? AND deleted_at IS NULL
       LIMIT 1
       FOR UPDATE`,
      [id]
    );
    const profile = rows[0];
    if (!profile) {
      await connection.rollback();
      return res.status(404).json({ message: 'Profil Maalem introuvable' });
    }
    if (!canAdminTransitionMaalemStatus(profile.status, validation.status)) {
      await connection.rollback();
      return res.status(409).json({
        message: `Transition Maalem interdite de ${profile.status} vers ${validation.status}`,
      });
    }

    // Deliberately updates only maalem_profiles. The Artisan account, its
    // type_compte, discounts, carts and orders remain untouched.
    await connection.query(
      `UPDATE maalem_profiles
       SET status = ?, status_reason = ?, reviewed_at = CURRENT_TIMESTAMP,
           reviewed_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND deleted_at IS NULL`,
      [validation.status, validation.reason, req.user.id, profile.id]
    );
    await connection.commit();
    return res.json({ profile: await findMaalemProfileByContactId(pool, profile.contact_id) });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

export { adminRouter as adminMaalemProfilesRouter };
export default selfRouter;
