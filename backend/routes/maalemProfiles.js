import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs/promises';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import { detectBufferKind } from '../utils/uploadValidation.js';
import { canManagePendingMaalemApplication } from '../utils/maalemRegistration.js';
import { isWhtspServiceConfigured, sendWhtspText } from '../utils/whtspService.js';
import {
  MAALEM_PROFILE_ORIGINS,
  MAALEM_PROFILE_STATUSES,
  buildMaalemProfessionalPrefill,
  canAdminChangeMaalemCategory,
  canAdminTransitionMaalemStatus,
  canEditMaalemDraft,
  findMaalemProfileByContactId,
  isArtisanAccount,
  normalizeMaalemProfileRow,
  validateMaalemAdminCategoryInput,
  validateMaalemAdminStatusInput,
  validateMaalemInternalNoteInput,
  validateMaalemDraftInput,
  validateMaalemSubmission,
} from '../utils/maalemProfile.js';
import {
  buildMaalemActivationUrl,
  createMaalemActivationToken,
  normalizeMaalemIdentityEmail,
  normalizeMoroccanPhone,
  phoneIdentityCandidates,
  validateMaalemTeamCreateInput,
  validateMaalemTeamLookup,
} from '../utils/maalemTeamCreation.js';

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

async function loadBackofficeActor(connection, employeeId) {
  const [rows] = await connection.query(
    `SELECT id, nom_complet, cin
     FROM employees
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [employeeId]
  );
  const employee = rows[0];
  if (!employee) return null;
  return {
    id: Number(employee.id),
    name: String(employee.nom_complet || employee.cin || `Employé #${employee.id}`).trim(),
  };
}

async function insertMaalemHistory(connection, event) {
  await connection.query(
    `INSERT INTO maalem_profile_history
       (profile_id, event_type, old_status, new_status,
        old_category_id, new_category_id, note, actor_type,
        actor_employee_id, actor_contact_id, actor_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.profileId,
      event.eventType,
      event.oldStatus ?? null,
      event.newStatus ?? null,
      event.oldCategoryId ?? null,
      event.newCategoryId ?? null,
      event.note ?? null,
      event.actorType,
      event.actorEmployeeId ?? null,
      event.actorContactId ?? null,
      event.actorName,
    ]
  );
}

function normalizeHistoryRow(row) {
  return {
    id: Number(row.id),
    profile_id: Number(row.profile_id),
    event_type: row.event_type,
    old_status: row.old_status ?? null,
    new_status: row.new_status ?? null,
    old_category_id: row.old_category_id == null ? null : Number(row.old_category_id),
    new_category_id: row.new_category_id == null ? null : Number(row.new_category_id),
    old_category_name: row.old_category_name ?? null,
    new_category_name: row.new_category_name ?? null,
    note: row.note ?? null,
    actor_type: row.actor_type,
    actor_employee_id: row.actor_employee_id == null ? null : Number(row.actor_employee_id),
    actor_contact_id: row.actor_contact_id == null ? null : Number(row.actor_contact_id),
    actor_name: row.actor_name,
    created_at: row.created_at,
  };
}

async function listMaalemHistory(db, profileId) {
  const [rows] = await db.query(
    `SELECT mph.*,
            old_category.nom AS old_category_name,
            new_category.nom AS new_category_name
     FROM maalem_profile_history mph
     LEFT JOIN maalem_categories old_category ON old_category.id = mph.old_category_id
     LEFT JOIN maalem_categories new_category ON new_category.id = mph.new_category_id
     WHERE mph.profile_id = ?
     ORDER BY mph.created_at DESC, mph.id DESC`,
    [profileId]
  );
  return rows.map(normalizeHistoryRow);
}

function requireEcommerceUser(req, res, next) {
  if (!req.user?.id || req.user?.role || req.user?.type_compte == null) {
    return res.status(403).json({ message: 'Compte e-commerce requis' });
  }
  return next();
}

async function loadContactForUpdate(connection, contactId) {
  const [rows] = await connection.query(
    `SELECT id, nom_complet, email, type_compte, demande_artisan, artisan_approuve, auth_provider,
            telephone, shipping_city
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

async function acquireIdentityLocks(connection, identity) {
  const keys = [
    identity.email ? `maalem-email:${identity.email}` : null,
    identity.telephone ? `maalem-phone:${identity.telephone}` : null,
  ].filter(Boolean).sort();
  const acquired = [];
  for (const value of keys) {
    const lockName = `kan6:${crypto.createHash('sha256').update(value).digest('hex')}`;
    const [rows] = await connection.query('SELECT GET_LOCK(?, 10) AS acquired', [lockName]);
    if (Number(rows[0]?.acquired) !== 1) {
      for (const held of acquired.reverse()) await connection.query('SELECT RELEASE_LOCK(?)', [held]);
      throw Object.assign(new Error('Impossible de verrouiller cette identité'), { code: 'IDENTITY_LOCK_TIMEOUT' });
    }
    acquired.push(lockName);
  }
  return acquired;
}

async function releaseIdentityLocks(connection, locks) {
  for (const lockName of [...locks].reverse()) {
    await connection.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
  }
}

async function findContactsByIdentity(db, identity, { forUpdate = false } = {}) {
  const conditions = [];
  const params = [];
  if (identity.email) {
    conditions.push('LOWER(TRIM(c.email)) = ?');
    params.push(identity.email);
  }
  const phones = phoneIdentityCandidates(identity.telephone);
  if (phones.length) {
    conditions.push(`REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(c.telephone, ' ', ''), '-', ''), '(', ''), ')', ''), '.', '') IN (?, ?)`);
    params.push(phones[0], phones[1]);
  }
  if (!conditions.length) return [];
  const [rows] = await db.query(
    `SELECT c.id, c.prenom, c.nom, c.nom_complet, c.email, c.telephone,
            c.type_compte, c.artisan_approuve, c.auth_provider, c.is_active,
            c.is_blocked, c.deleted_at,
            mp.id AS maalem_profile_id, mp.status AS maalem_profile_status,
            mp.origin AS maalem_profile_origin
     FROM contacts c
     LEFT JOIN maalem_profiles mp ON mp.contact_id = c.id AND mp.deleted_at IS NULL
     WHERE ${conditions.join(' OR ')}
     ORDER BY c.id ASC
     ${forUpdate ? 'FOR UPDATE' : ''}`,
    params
  );
  return rows;
}

function resolveIdentityMatch(rows, identity) {
  const emailMatches = identity.email
    ? rows.filter((row) => normalizeMaalemIdentityEmail(row.email) === identity.email)
    : [];
  const phoneMatches = identity.telephone
    ? rows.filter((row) => normalizeMoroccanPhone(row.telephone) === identity.telephone)
    : [];
  const ids = new Set([...emailMatches, ...phoneMatches].map((row) => Number(row.id)));
  if (identity.email && identity.telephone && ((emailMatches.length === 0) !== (phoneMatches.length === 0))) {
    return { conflict: true, contact: null };
  }
  if (emailMatches.length > 1 || phoneMatches.length > 1 || ids.size > 1) {
    return { conflict: true, contact: null };
  }
  const contact = [...emailMatches, ...phoneMatches][0] || null;
  return { conflict: false, contact };
}

function existingContactState(contact) {
  if (!contact) return 'not_found';
  if (contact.deleted_at || Number(contact.is_active) !== 1 || Number(contact.is_blocked) === 1) return 'inactive_account';
  if (contact.auth_provider === 'none' || contact.type_compte == null) return 'backoffice_contact';
  if (!isArtisanAccount(contact)) return 'non_artisan_account';
  return contact.maalem_profile_id ? 'existing_maalem_profile' : 'existing_artisan';
}

async function loadAdminEditableProfile(db, profileId, { forUpdate = false } = {}) {
  const [rows] = await db.query(
    `SELECT id, status
     FROM maalem_profiles
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1
     ${forUpdate ? 'FOR UPDATE' : ''}`,
    [profileId]
  );
  const profile = rows[0] || null;
  return profile && canEditMaalemDraft(profile.status) ? profile : null;
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

// Idempotent entry point for an existing Artisan joining the Maalem program.
// It returns every existing status unchanged (including rejected/suspended)
// and creates exactly one draft only when no profile exists yet.
selfRouter.post('/me/join', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Locking the existing contact serializes concurrent clicks for the same
    // Artisan before checking/inserting the one-to-one Maalem extension.
    const contact = await loadContactForUpdate(connection, req.user.id);
    if (!contact) {
      await connection.rollback();
      return res.status(404).json({ message: 'Compte e-commerce introuvable' });
    }
    if (!isArtisanAccount(contact)) {
      await connection.rollback();
      return res.status(403).json({ message: 'Le programme Maalem est réservé aux comptes Artisan approuvés' });
    }

    const existing = await loadProfileForUpdate(connection, contact.id);
    if (existing) {
      await connection.commit();
      return res.json({
        profile: await findMaalemProfileByContactId(pool, contact.id),
        created: false,
      });
    }

    const professionalData = buildMaalemProfessionalPrefill(contact);
    await connection.query(
      `INSERT INTO maalem_profiles (contact_id, category_id, status, origin, professional_data)
       VALUES (?, NULL, 'draft', 'ARTISAN_CONVERSION', ?)`,
      [contact.id, JSON.stringify(professionalData)]
    );

    await connection.commit();
    return res.status(201).json({
      profile: await findMaalemProfileByContactId(pool, contact.id),
      created: true,
    });
  } catch (error) {
    await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') {
      // The database UNIQUE(contact_id) remains the final concurrency guard.
      const profile = await findMaalemProfileByContactId(pool, req.user.id);
      if (profile) return res.json({ profile, created: false });
      return res.status(409).json({ message: 'Un profil Maalem existe déjà pour ce compte Artisan' });
    }
    return next(error);
  } finally {
    connection.release();
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
        `INSERT INTO maalem_profiles (contact_id, category_id, status, origin, professional_data)
         VALUES (?, ?, 'draft', 'ARTISAN_CONVERSION', ?)`,
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
    await insertMaalemHistory(connection, {
      profileId: profile.id,
      eventType: 'STATUS_CHANGED',
      oldStatus: profile.status,
      newStatus: 'submitted',
      actorType: 'CANDIDATE',
      actorContactId: contact.id,
      actorName: String(contact.nom_complet || contact.email || `Candidat #${contact.id}`).trim(),
    });

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

adminRouter.post('/lookup', async (req, res, next) => {
  const validation = validateMaalemTeamLookup(req.body);
  if (!validation.valid) return res.status(400).json({ message: validation.error });
  try {
    const rows = await findContactsByIdentity(pool, validation);
    const match = resolveIdentityMatch(rows, validation);
    if (match.conflict) {
      return res.status(409).json({
        code: 'IDENTITY_CONFLICT',
        message: 'L’email et le téléphone correspondent à des comptes différents ou dupliqués',
      });
    }
    const contact = match.contact;
    return res.json({
      state: existingContactState(contact),
      contact: contact ? {
        id: Number(contact.id),
        prenom: contact.prenom,
        nom: contact.nom,
        nom_complet: contact.nom_complet,
        email: contact.email,
        telephone: contact.telephone,
        type_compte: contact.type_compte,
        maalem_profile_id: contact.maalem_profile_id == null ? null : Number(contact.maalem_profile_id),
        maalem_profile_status: contact.maalem_profile_status || null,
      } : null,
    });
  } catch (error) {
    return next(error);
  }
});

adminRouter.post('/team-create', async (req, res, next) => {
  const validation = validateMaalemTeamCreateInput(req.body);
  if (!validation.valid) return res.status(400).json({ message: validation.error });

  const connection = await pool.getConnection();
  let identityLocks = [];
  let activationToken = null;
  let contactId = null;
  let createdUser = false;
  let createdProfile = false;
  try {
    identityLocks = await acquireIdentityLocks(connection, validation);
    await connection.beginTransaction();

    const category = await loadActiveCategory(connection, validation.category_id);
    if (!category) {
      await connection.rollback();
      return res.status(400).json({ message: 'Catégorie Maalem inactive ou introuvable' });
    }

    const rows = await findContactsByIdentity(connection, validation, { forUpdate: true });
    const match = resolveIdentityMatch(rows, validation);
    if (match.conflict) {
      await connection.rollback();
      return res.status(409).json({
        code: 'IDENTITY_CONFLICT',
        message: 'L’email et le téléphone correspondent à des comptes différents ou dupliqués',
      });
    }

    const existing = match.contact;
    if (existing) {
      const state = existingContactState(existing);
      if (!['existing_artisan', 'existing_maalem_profile'].includes(state)) {
        await connection.rollback();
        return res.status(409).json({
          code: state.toUpperCase(),
          message: state === 'non_artisan_account'
            ? 'Ce compte existe mais doit devenir Artisan via le workflow existant avant d’être rattaché à Maalem'
            : 'Un contact existe déjà avec ces identifiants mais ne peut pas être utilisé comme compte Artisan actif',
        });
      }

      contactId = Number(existing.id);
      if (existing.maalem_profile_id) {
        await connection.commit();
        await releaseIdentityLocks(connection, identityLocks);
        identityLocks = [];
        return res.json({
          profile: await findMaalemProfileByContactId(pool, contactId),
          created_user: false,
          created_profile: false,
          invitation: null,
        });
      }
    } else {
      const generated = createMaalemActivationToken();
      activationToken = generated.token;
      const unusableRandomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      const [contactResult] = await connection.query(
        `INSERT INTO contacts
           (nom_complet, prenom, nom, email, telephone, type, type_compte,
            demande_artisan, artisan_approuve, artisan_approuve_par, artisan_approuve_le,
            password, auth_provider, email_verified, is_active, source,
            shipping_city, reset_token, reset_token_expires_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, 'Client', 'Artisan/Promoteur',
                 1, 1, ?, CURRENT_TIMESTAMP,
                 ?, 'local', 0, 1, 'ecommerce',
                 ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 48 HOUR), ?, ?)`,
        [
          `${validation.prenom} ${validation.nom}`,
          validation.prenom,
          validation.nom,
          validation.email,
          validation.telephone,
          req.user.id,
          unusableRandomPassword,
          validation.professional_data?.city || null,
          generated.token_hash,
          req.user.id,
          req.user.id,
        ]
      );
      contactId = Number(contactResult.insertId);
      createdUser = true;
    }

    await connection.query(
      `INSERT INTO maalem_profiles
         (contact_id, category_id, status, origin, professional_data, created_by_employee_id)
       VALUES (?, ?, 'draft', 'TEAM_CREATED', ?, ?)`,
      [contactId, validation.category_id, JSON.stringify(validation.professional_data), req.user.id]
    );
    createdProfile = true;
    await connection.commit();
    await releaseIdentityLocks(connection, identityLocks);
    identityLocks = [];

    const profile = await findMaalemProfileByContactId(pool, contactId);
    let invitation = null;
    if (createdUser && activationToken) {
      const activationUrl = buildMaalemActivationUrl(activationToken, req.body?.locale);
      invitation = { activation_url: activationUrl, expires_in_hours: 48, delivery_status: 'manual' };
      if (isWhtspServiceConfigured()) {
        try {
          await sendWhtspText({
            phone: validation.telephone,
            text: [
              `Bonjour ${validation.prenom},`,
              'Votre compte Artisan/Maalem Boukir a été créé par notre équipe.',
              'Choisissez votre mot de passe avec ce lien sécurisé valable 48 heures :',
              activationUrl,
            ].join('\n'),
          });
          invitation.delivery_status = 'sent_whatsapp';
        } catch (deliveryError) {
          console.error('[Maalem invitation] WhatsApp delivery failed:', deliveryError?.message || deliveryError);
          invitation.delivery_status = 'failed_whatsapp';
        }
      }
    }

    return res.status(createdUser || createdProfile ? 201 : 200).json({
      profile,
      created_user: createdUser,
      created_profile: createdProfile,
      invitation,
    });
  } catch (error) {
    await connection.rollback().catch(() => {});
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Un compte ou un profil Maalem existe déjà avec ces identifiants' });
    }
    if (error?.code === 'IDENTITY_LOCK_TIMEOUT') {
      return res.status(409).json({ message: 'Une création est déjà en cours pour cette personne. Réessayez.' });
    }
    return next(error);
  } finally {
    await releaseIdentityLocks(connection, identityLocks);
    connection.release();
  }
});

adminRouter.post('/:id/cv', receiveCv, async (req, res, next) => {
  const profileId = parseId(req.params.id);
  if (!profileId) return res.status(400).json({ message: 'Identifiant invalide' });
  const validation = validateMemoryFile(req.file, ['pdf']);
  if (!validation.valid) return res.status(400).json({ message: validation.error });

  let savedFile = null;
  const connection = await pool.getConnection();
  try {
    savedFile = await savePrivateDocument(profileId, 'cv', req.file, validation.kind);
    await connection.beginTransaction();
    if (!(await loadAdminEditableProfile(connection, profileId, { forUpdate: true }))) {
      await connection.rollback();
      await fs.unlink(savedFile.absolutePath).catch(() => {});
      savedFile = null;
      return res.status(409).json({ message: 'Le dossier Maalem ne peut plus être modifié' });
    }
    const [previous] = await connection.query(
      `SELECT storage_key FROM maalem_profile_documents
       WHERE profile_id = ? AND kind = 'cv' AND deleted_at IS NULL
       FOR UPDATE`,
      [profileId]
    );
    await connection.query(
      `UPDATE maalem_profile_documents
       SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE profile_id = ? AND kind = 'cv' AND deleted_at IS NULL`,
      [profileId]
    );
    const [result] = await connection.query(
      `INSERT INTO maalem_profile_documents
         (profile_id, kind, storage_key, original_name, mime_type, file_size)
       VALUES (?, 'cv', ?, ?, 'application/pdf', ?)`,
      [profileId, savedFile.storageKey, path.basename(req.file.originalname), req.file.size]
    );
    await connection.commit();
    savedFile = null;
    for (const old of previous) {
      const oldPath = resolvePrivateDocument(old.storage_key);
      if (oldPath) await fs.unlink(oldPath).catch(() => {});
    }
    const documents = await listProfileDocuments(pool, profileId);
    return res.status(201).json({ document: documents.find((item) => item.id === Number(result.insertId)) });
  } catch (error) {
    await connection.rollback().catch(() => {});
    if (savedFile?.absolutePath) await fs.unlink(savedFile.absolutePath).catch(() => {});
    return next(error);
  } finally {
    connection.release();
  }
});

adminRouter.post('/:id/realizations', receiveRealizations, async (req, res, next) => {
  const profileId = parseId(req.params.id);
  if (!profileId) return res.status(400).json({ message: 'Identifiant invalide' });
  if (!req.files?.length) return res.status(400).json({ message: 'Au moins une photo est requise' });
  for (const file of req.files) {
    const validation = validateMemoryFile(file, ['jpeg', 'png', 'webp']);
    if (!validation.valid) return res.status(400).json({ message: validation.error });
  }

  const savedFiles = [];
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (!(await loadAdminEditableProfile(connection, profileId, { forUpdate: true }))) {
      await connection.rollback();
      return res.status(409).json({ message: 'Le dossier Maalem ne peut plus être modifié' });
    }
    const [countRows] = await connection.query(
      `SELECT COUNT(*) AS total FROM maalem_profile_documents
       WHERE profile_id = ? AND kind = 'realization' AND deleted_at IS NULL`,
      [profileId]
    );
    if (Number(countRows[0]?.total || 0) + req.files.length > MAX_REALIZATIONS) {
      await connection.rollback();
      return res.status(400).json({ message: `Vous pouvez conserver au maximum ${MAX_REALIZATIONS} réalisations` });
    }
    for (const file of req.files) {
      const detectedKind = detectBufferKind(file.buffer);
      const saved = await savePrivateDocument(profileId, 'realization', file, detectedKind);
      savedFiles.push(saved);
      await connection.query(
        `INSERT INTO maalem_profile_documents
           (profile_id, kind, storage_key, original_name, mime_type, file_size)
         VALUES (?, 'realization', ?, ?, ?, ?)`,
        [profileId, saved.storageKey, path.basename(file.originalname), KIND_MIME_TYPES[detectedKind], file.size]
      );
    }
    await connection.commit();
    savedFiles.length = 0;
    return res.status(201).json({ documents: await listProfileDocuments(pool, profileId) });
  } catch (error) {
    await connection.rollback().catch(() => {});
    for (const saved of savedFiles) await fs.unlink(saved.absolutePath).catch(() => {});
    return next(error);
  } finally {
    connection.release();
  }
});

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
    const origin = String(req.query.origin || 'all').trim().toUpperCase();
    if (origin !== 'ALL' && !MAALEM_PROFILE_ORIGINS.includes(origin)) {
      return res.status(400).json({ message: 'Filtre d’origine invalide' });
    }
    const categoryId = req.query.category_id == null || req.query.category_id === ''
      ? null
      : parseId(req.query.category_id);
    if (req.query.category_id != null && req.query.category_id !== '' && !categoryId) {
      return res.status(400).json({ message: 'Filtre de catégorie invalide' });
    }
    const city = String(req.query.city || '').trim();
    if (city.length > 100) {
      return res.status(400).json({ message: 'Le filtre de ville ne peut pas dépasser 100 caractères' });
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
    if (origin !== 'ALL') {
      conditions.push('mp.origin = ?');
      params.push(origin);
    }
    if (categoryId) {
      conditions.push('mp.category_id = ?');
      params.push(categoryId);
    }
    if (city) {
      conditions.push(`(
        JSON_UNQUOTE(JSON_EXTRACT(mp.professional_data, '$.city')) LIKE ?
        OR c.shipping_city LIKE ?
      )`);
      const term = `%${city}%`;
      params.push(term, term);
    }

    const [rows] = await pool.query(
      `SELECT mp.*,
              c.nom_complet AS contact_nom_complet,
              c.prenom AS contact_prenom,
              c.nom AS contact_nom,
              c.email AS contact_email,
              c.telephone AS contact_telephone,
              c.type_compte AS contact_type_compte,
              c.shipping_city AS contact_shipping_city,
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
    const [countRows] = await pool.query(
      `SELECT mp.status, COUNT(*) AS total
       FROM maalem_profiles mp
       INNER JOIN contacts c ON c.id = mp.contact_id
       WHERE mp.deleted_at IS NULL AND c.deleted_at IS NULL
       GROUP BY mp.status`
    );
    const counts = Object.fromEntries(MAALEM_PROFILE_STATUSES.map((item) => [item, 0]));
    for (const row of countRows) counts[row.status] = Number(row.total);
    return res.json({ profiles: rows.map(normalizeMaalemProfileRow), counts });
  } catch (error) {
    return next(error);
  }
});

adminRouter.get('/:id', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Identifiant invalide' });
  try {
    const [rows] = await pool.query(
      `SELECT mp.*,
              c.nom_complet AS contact_nom_complet,
              c.prenom AS contact_prenom,
              c.nom AS contact_nom,
              c.societe AS contact_societe,
              c.email AS contact_email,
              c.telephone AS contact_telephone,
              c.type_compte AS contact_type_compte,
              c.adresse AS contact_adresse,
              c.shipping_city AS contact_shipping_city,
              mc.nom AS category_nom,
              mc.nom_ar AS category_nom_ar,
              mc.is_active AS category_is_active,
              reviewer.nom_complet AS reviewer_name,
              creator.nom_complet AS creator_name
       FROM maalem_profiles mp
       INNER JOIN contacts c ON c.id = mp.contact_id
       LEFT JOIN maalem_categories mc ON mc.id = mp.category_id
       LEFT JOIN employees reviewer ON reviewer.id = mp.reviewed_by
       LEFT JOIN employees creator ON creator.id = mp.created_by_employee_id
       WHERE mp.id = ? AND mp.deleted_at IS NULL AND c.deleted_at IS NULL
       LIMIT 1`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Profil Maalem introuvable' });
    const history = await listMaalemHistory(pool, id);
    return res.json({
      profile: normalizeMaalemProfileRow(rows[0]),
      documents: await listProfileDocuments(pool, id),
      history,
      notes: history.filter((item) => item.event_type === 'INTERNAL_NOTE'),
    });
  } catch (error) {
    return next(error);
  }
});

adminRouter.post('/:id/notes', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Identifiant invalide' });
  const validation = validateMaalemInternalNoteInput(req.body);
  if (!validation.valid) return res.status(400).json({ message: validation.error });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [profiles] = await connection.query(
      `SELECT id FROM maalem_profiles
       WHERE id = ? AND deleted_at IS NULL
       LIMIT 1 FOR UPDATE`,
      [id]
    );
    if (!profiles[0]) {
      await connection.rollback();
      return res.status(404).json({ message: 'Profil Maalem introuvable' });
    }
    const actor = await loadBackofficeActor(connection, req.user.id);
    if (!actor) {
      await connection.rollback();
      return res.status(403).json({ message: 'Utilisateur Back-office introuvable' });
    }
    await insertMaalemHistory(connection, {
      profileId: id,
      eventType: 'INTERNAL_NOTE',
      note: validation.note,
      actorType: 'BACKOFFICE',
      actorEmployeeId: actor.id,
      actorName: actor.name,
    });
    await connection.commit();
    const history = await listMaalemHistory(pool, id);
    return res.status(201).json({
      note: history.find((item) => item.event_type === 'INTERNAL_NOTE'),
    });
  } catch (error) {
    await connection.rollback().catch(() => {});
    return next(error);
  } finally {
    connection.release();
  }
});

adminRouter.patch('/:id/category', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Identifiant invalide' });
  const validation = validateMaalemAdminCategoryInput(req.body);
  if (!validation.valid) return res.status(400).json({ message: validation.error });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT id, contact_id, status, category_id
       FROM maalem_profiles
       WHERE id = ? AND deleted_at IS NULL
       LIMIT 1 FOR UPDATE`,
      [id]
    );
    const profile = rows[0];
    if (!profile) {
      await connection.rollback();
      return res.status(404).json({ message: 'Profil Maalem introuvable' });
    }
    if (!canAdminChangeMaalemCategory(profile.status)) {
      await connection.rollback();
      return res.status(409).json({ message: 'La catégorie ne peut plus être modifiée dans ce statut' });
    }
    if (!(await loadActiveCategory(connection, validation.category_id))) {
      await connection.rollback();
      return res.status(400).json({ message: 'Catégorie Maalem inactive ou introuvable' });
    }
    if (Number(profile.category_id) === validation.category_id) {
      await connection.rollback();
      return res.status(400).json({ message: 'Cette catégorie est déjà attribuée au dossier' });
    }
    const actor = await loadBackofficeActor(connection, req.user.id);
    if (!actor) {
      await connection.rollback();
      return res.status(403).json({ message: 'Utilisateur Back-office introuvable' });
    }
    await connection.query(
      `UPDATE maalem_profiles
       SET category_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND deleted_at IS NULL`,
      [validation.category_id, profile.id]
    );
    await insertMaalemHistory(connection, {
      profileId: profile.id,
      eventType: 'CATEGORY_CHANGED',
      oldCategoryId: profile.category_id,
      newCategoryId: validation.category_id,
      note: validation.note,
      actorType: 'BACKOFFICE',
      actorEmployeeId: actor.id,
      actorName: actor.name,
    });
    await connection.commit();
    return res.json({ profile: await findMaalemProfileByContactId(pool, profile.contact_id) });
  } catch (error) {
    await connection.rollback().catch(() => {});
    return next(error);
  } finally {
    connection.release();
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
      `SELECT id, contact_id, category_id, status
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
    if (validation.status === 'approved') {
      const category = profile.category_id == null
        ? null
        : await loadActiveCategory(connection, profile.category_id);
      if (!category) {
        await connection.rollback();
        return res.status(400).json({
          message: 'Une catégorie Maalem active est requise avant l’approbation',
        });
      }
    }
    const actor = await loadBackofficeActor(connection, req.user.id);
    if (!actor) {
      await connection.rollback();
      return res.status(403).json({ message: 'Utilisateur Back-office introuvable' });
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
    await insertMaalemHistory(connection, {
      profileId: profile.id,
      eventType: 'STATUS_CHANGED',
      oldStatus: profile.status,
      newStatus: validation.status,
      note: validation.reason,
      actorType: 'BACKOFFICE',
      actorEmployeeId: actor.id,
      actorName: actor.name,
    });
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
