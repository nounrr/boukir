import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Router } from 'express';
import multer from 'multer';
import pool from '../db/pool.js';
import { canReceiveServiceAssignments } from '../utils/maalemAccess.js';
import { detectBufferKind } from '../utils/uploadValidation.js';
import {
  SERVICE_REQUEST_CHANNEL,
  SERVICE_REQUEST_INITIAL_STATUS,
  formatServiceRequestNumber,
  isEcommerceRequester,
  normalizeServiceRequestRow,
  validateServiceRequestInput,
} from '../utils/serviceRequest.js';
import {
  OPERATIONAL_NOTIFICATION_EVENTS,
  dispatchOperationalNotificationsSafely,
  enqueueOperationalNotifications,
  normalizeOperationalNotificationRow,
} from '../utils/operationalNotification.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const privateFilesRoot = path.resolve(__dirname, '..', 'private_uploads', 'service_requests');
const MAX_ATTACHMENTS = 8;
const MAX_ATTACHMENT_SIZE = 8 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_SIZE, files: MAX_ATTACHMENTS, fields: 30 },
});

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

function requireEcommerceRequester(req, res, next) {
  if (!isEcommerceRequester(req.user)) {
    return res.status(403).json({
      message: 'Compte e-commerce authentifié requis',
      error_type: 'ECOMMERCE_ACCOUNT_REQUIRED',
    });
  }
  return next();
}

function handleAttachments(req, res, next) {
  upload.array('attachments', MAX_ATTACHMENTS)(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'Chaque pièce jointe est limitée à 8 Mo' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(413).json({ message: `Maximum ${MAX_ATTACHMENTS} pièces jointes` });
    }
    return res.status(400).json({ message: error.message || 'Pièce jointe invalide' });
  });
}

function validateAttachments(files = [], { photosOnly = false } = {}) {
  const values = [];
  for (const file of files) {
    const detectedKind = detectBufferKind(file.buffer);
    if (!detectedKind || !KIND_EXTENSIONS[detectedKind]) {
      return { valid: false, message: 'Formats autorisés : PDF, JPG, PNG et WEBP' };
    }
    if (photosOnly && detectedKind === 'pdf') {
      return { valid: false, message: 'Formats photo autorisés : JPG, PNG et WEBP' };
    }
    values.push({
      file,
      detectedKind,
      kind: detectedKind === 'pdf' ? 'DOCUMENT' : 'PHOTO',
      extension: KIND_EXTENSIONS[detectedKind],
      mimeType: KIND_MIME_TYPES[detectedKind],
    });
  }
  return { valid: true, value: values };
}

async function loadRequesterForUpdate(connection, contactId) {
  const [rows] = await connection.query(
    `SELECT id, nom_complet, prenom, nom, email, telephone, locale, type_compte,
            shipping_city, shipping_address_line1, shipping_address_line2
     FROM contacts
     WHERE id = ? AND deleted_at IS NULL
       AND COALESCE(is_active, 1) = 1
       AND COALESCE(is_blocked, 0) = 0
     LIMIT 1
     FOR UPDATE`,
    [contactId]
  );
  return rows[0] || null;
}

async function loadServiceForRequest(connection, serviceId) {
  if (!serviceId) return null;
  const [rows] = await connection.query(
    `SELECT s.id, s.nom, s.nom_ar, s.is_active, s.deleted_at,
            EXISTS (
              SELECT 1
              FROM service_maalem_categories smc
              INNER JOIN maalem_categories mc ON mc.id = smc.category_id
              WHERE smc.service_id = s.id
                AND mc.is_active = 1
                AND mc.deleted_at IS NULL
            ) AS has_active_category
     FROM services s
     WHERE s.id = ?
     LIMIT 1
     FOR UPDATE`,
    [serviceId]
  );
  return rows[0] || null;
}

function assertServiceAvailable(service) {
  if (!service) {
    const error = new Error('Le service sélectionné est introuvable');
    error.status = 422;
    error.publicCode = 'SERVICE_NOT_FOUND';
    throw error;
  }
  if (service.deleted_at) {
    const error = new Error('Le service sélectionné a été supprimé et n’est plus disponible');
    error.status = 422;
    error.publicCode = 'SERVICE_DELETED';
    throw error;
  }
  if (!Number(service.is_active)) {
    const error = new Error('Le service sélectionné est inactif');
    error.status = 422;
    error.publicCode = 'SERVICE_INACTIVE';
    throw error;
  }
  if (!Number(service.has_active_category)) {
    const error = new Error('Le service sélectionné n’est pas disponible pour une nouvelle demande');
    error.status = 422;
    error.publicCode = 'SERVICE_UNAVAILABLE';
    throw error;
  }
}

async function loadOrderableMaalem(connection, profileId) {
  if (!profileId) return null;
  const [rows] = await connection.query(
    `SELECT mp.id, mp.contact_id, mp.category_id, mp.status,
            c.nom_complet, c.is_active, c.is_blocked
     FROM maalem_profiles mp
     INNER JOIN contacts c ON c.id = mp.contact_id
     WHERE mp.id = ? AND mp.deleted_at IS NULL AND c.deleted_at IS NULL
       AND COALESCE(c.is_active, 1) = 1
       AND COALESCE(c.is_blocked, 0) = 0
     LIMIT 1`,
    [profileId]
  );
  const profile = rows[0] || null;
  return profile && canReceiveServiceAssignments(profile) ? profile : null;
}

async function loadActiveCategory(connection, categoryId) {
  if (!categoryId) return null;
  const [rows] = await connection.query(
    `SELECT id, nom, nom_ar
     FROM maalem_categories
     WHERE id = ? AND is_active = 1 AND deleted_at IS NULL
     LIMIT 1`,
    [categoryId]
  );
  return rows[0] || null;
}

async function nextRequestNumber(connection) {
  const [update] = await connection.query(
    `UPDATE service_request_sequences
     SET current_value = LAST_INSERT_ID(current_value + 1)
     WHERE sequence_name = 'service_request'`
  );
  if (Number(update.affectedRows) !== 1) throw new Error('Compteur de demandes indisponible');
  const [rows] = await connection.query('SELECT LAST_INSERT_ID() AS sequence_value');
  return formatServiceRequestNumber(rows[0]?.sequence_value);
}

async function writeAttachment(requestId, attachment) {
  const directory = path.join(privateFilesRoot, String(requestId));
  await fs.mkdir(directory, { recursive: true });
  const filename = `${crypto.randomUUID()}${attachment.extension}`;
  const storageKey = path.posix.join(String(requestId), filename);
  const absolutePath = path.join(directory, filename);
  await fs.writeFile(absolutePath, attachment.file.buffer, { flag: 'wx' });
  return { ...attachment, storageKey, absolutePath };
}

function resolvePrivateAttachment(storageKey) {
  const absolutePath = path.resolve(privateFilesRoot, String(storageKey || ''));
  const relativePath = path.relative(privateFilesRoot, absolutePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) return null;
  return absolutePath;
}

async function cleanupFiles(files) {
  await Promise.all(files.map((file) => fs.unlink(file.absolutePath).catch(() => {})));
}

function contactDisplayName(contact) {
  return String(
    contact.nom_complet
    || [contact.prenom, contact.nom].filter(Boolean).join(' ')
    || contact.email
    || contact.telephone
    || `Contact #${contact.id}`
  ).trim();
}

function normalizeAttachmentRow(row) {
  return {
    id: Number(row.id),
    request_id: Number(row.request_id),
    kind: row.kind,
    original_name: row.original_name,
    mime_type: row.mime_type,
    file_size: Number(row.file_size),
    created_at: row.created_at,
  };
}

async function loadOwnedRequest(db, requestId, contactId) {
  const [rows] = await db.query(
    `SELECT sr.*,
            s.nom AS service_name, s.nom_ar AS service_name_ar,
            mc.nom AS category_name, mc.nom_ar AS category_name_ar,
            maalem_contact.nom_complet AS maalem_name
     FROM service_requests sr
     LEFT JOIN services s ON s.id = sr.service_id
     LEFT JOIN maalem_categories mc ON mc.id = sr.qualified_category_id
     LEFT JOIN maalem_profiles requested_maalem
       ON requested_maalem.id = sr.requested_maalem_profile_id
       AND requested_maalem.deleted_at IS NULL
     LEFT JOIN contacts maalem_contact
       ON maalem_contact.id = requested_maalem.contact_id
       AND maalem_contact.deleted_at IS NULL
     WHERE sr.id = ? AND sr.requester_contact_id = ? AND sr.deleted_at IS NULL
     LIMIT 1`,
    [requestId, contactId]
  );
  return normalizeServiceRequestRow(rows[0]);
}

async function listOwnedRequestDetails(db, requestId, contactId) {
  const request = await loadOwnedRequest(db, requestId, contactId);
  if (!request) return null;
  const [[attachments], [sharedNotes]] = await Promise.all([
    db.query(
      `SELECT id, request_id, kind, original_name, mime_type, file_size, created_at
       FROM service_request_attachments
       WHERE request_id = ? AND deleted_at IS NULL
       ORDER BY created_at ASC, id ASC`,
      [requestId]
    ),
    db.query(
      `SELECT id, request_id, body, actor_type, actor_name, created_at
       FROM service_request_notes
       WHERE request_id = ? AND visibility = 'SHARED'
       ORDER BY created_at ASC, id ASC`,
      [requestId]
    ),
  ]);
  return {
    request,
    attachments: attachments.map(normalizeAttachmentRow),
    shared_notes: sharedNotes.map((row) => ({ ...row, id: Number(row.id), request_id: Number(row.request_id) })),
  };
}

router.use(requireEcommerceRequester);

function createServiceRequest({
  forceQuickRequest = false,
  forceSelectedMaalem = false,
  forceSelectedService = false,
  photosOnly = false,
} = {}) {
  return async (req, res, next) => {
  const input = forceQuickRequest
    ? {
        ...req.body,
        request_source: 'quick_request',
        service_id: null,
        requested_maalem_id: null,
        category_id: null,
      }
    : forceSelectedMaalem
      ? {
          ...req.body,
          request_source: 'selected_maalem',
          category_id: null,
        }
      : forceSelectedService
        ? {
            ...req.body,
            request_source: 'selected_service',
            requested_maalem_id: null,
            category_id: null,
          }
        : req.body;
  const validation = validateServiceRequestInput(input);
  if (!validation.valid) return res.status(422).json({ message: 'Demande invalide', errors: validation.errors });
  const isSelectedMaalemRequest = validation.value.request_source === 'selected_maalem';
  const isSelectedServiceRequest = validation.value.request_source === 'selected_service';
  if (isSelectedMaalemRequest && !validation.value.problem_description) {
    return res.status(422).json({ message: 'Demande invalide', errors: { problem_description: 'La description du besoin est requise' } });
  }
  if (isSelectedMaalemRequest && !validation.value.client_submission_id) {
    return res.status(422).json({ message: 'Demande invalide', errors: { client_submission_id: 'Identifiant de soumission requis' } });
  }
  if (isSelectedServiceRequest && !validation.value.client_submission_id) {
    return res.status(422).json({ message: 'Demande invalide', errors: { client_submission_id: 'Identifiant de soumission requis' } });
  }
  const attachments = validateAttachments(req.files, {
    photosOnly: photosOnly || isSelectedMaalemRequest || isSelectedServiceRequest,
  });
  if (!attachments.valid) return res.status(415).json({ message: attachments.message });

  const connection = await pool.getConnection();
  const writtenFiles = [];
  let committed = false;
  let deliveries = [];
  try {
    await connection.beginTransaction();
    const contactId = Number(req.user.id);
    const contact = await loadRequesterForUpdate(connection, contactId);
    if (!contact) {
      const error = new Error('Compte demandeur indisponible');
      error.status = 403;
      throw error;
    }

    if (validation.value.client_submission_id) {
      const [existingRows] = await connection.query(
        `SELECT * FROM service_requests
         WHERE requester_contact_id = ? AND client_submission_id = ? AND deleted_at IS NULL
         LIMIT 1 FOR UPDATE`,
        [contactId, validation.value.client_submission_id]
      );
      if (existingRows[0]) {
        await connection.commit();
        committed = true;
        return res.status(200).json({
          request: normalizeServiceRequestRow(existingRows[0]),
          attachments: [],
          duplicate_submission: true,
        });
      }
    }

    const service = await loadServiceForRequest(connection, validation.value.service_id);
    if (validation.value.service_id) assertServiceAvailable(service);
    const requestedMaalem = await loadOrderableMaalem(connection, validation.value.requested_maalem_id);
    const explicitCategory = await loadActiveCategory(connection, validation.value.category_id);
    if (validation.value.requested_maalem_id && !requestedMaalem) {
      const error = new Error('Le Maalem sélectionné n’est pas validé ou disponible');
      error.status = 422;
      throw error;
    }
    if (service && requestedMaalem) {
      const [compatibilityRows] = await connection.query(
        `SELECT 1 FROM service_maalem_categories smc
         INNER JOIN maalem_categories mc ON mc.id = smc.category_id
         WHERE smc.service_id = ? AND smc.category_id = ?
           AND mc.is_active = 1 AND mc.deleted_at IS NULL LIMIT 1`,
        [service.id, requestedMaalem.category_id]
      );
      if (compatibilityRows.length === 0) {
        const error = new Error('Ce Maalem n’est pas compatible avec le service sélectionné');
        error.status = 422;
        throw error;
      }
    }
    if (validation.value.category_id && !explicitCategory) {
      const error = new Error('La catégorie sélectionnée est inactive ou indisponible');
      error.status = 422;
      throw error;
    }

    const qualifiedCategoryId = explicitCategory?.id || requestedMaalem?.category_id || null;
    if (qualifiedCategoryId && !explicitCategory && requestedMaalem) {
      const inheritedCategory = await loadActiveCategory(connection, qualifiedCategoryId);
      if (!inheritedCategory) {
        const error = new Error('La catégorie du Maalem sélectionné est inactive ou indisponible');
        error.status = 422;
        throw error;
      }
    }

    const requestNumber = await nextRequestNumber(connection);
    const actorName = contactDisplayName(contact);
    const requesterName = validation.value.contact_name || actorName;
    const requesterPhone = validation.value.contact_phone || contact.telephone || null;
    const requesterEmail = validation.value.contact_email || contact.email || null;
    const city = validation.value.city || contact.shipping_city || null;
    const address = validation.value.address
      || [contact.shipping_address_line1, contact.shipping_address_line2].filter(Boolean).join(', ')
      || null;
    if (forceQuickRequest && !requesterPhone) {
      const error = new Error('Un numéro de téléphone utilisable est requis');
      error.status = 422;
      error.field = 'contact_phone';
      throw error;
    }
    if (forceQuickRequest && !city) {
      const error = new Error('La ville est requise pour traiter la demande');
      error.status = 422;
      error.field = 'city';
      throw error;
    }
    if (isSelectedMaalemRequest && !requesterPhone) {
      const error = new Error('Un numéro de téléphone utilisable est requis');
      error.status = 422;
      error.field = 'contact_phone';
      throw error;
    }
    if (isSelectedMaalemRequest && !city) {
      const error = new Error('La ville est requise pour traiter la demande');
      error.status = 422;
      error.field = 'city';
      throw error;
    }
    if (isSelectedMaalemRequest && !address) {
      const error = new Error('L’adresse d’intervention est requise');
      error.status = 422;
      error.field = 'address';
      throw error;
    }
    if (isSelectedServiceRequest && !requesterPhone) {
      const error = new Error('Un numéro de téléphone utilisable est requis');
      error.status = 422;
      error.field = 'contact_phone';
      throw error;
    }
    if (isSelectedServiceRequest && !city) {
      const error = new Error('La ville est requise pour traiter la demande');
      error.status = 422;
      error.field = 'city';
      throw error;
    }
    if (isSelectedServiceRequest && !address) {
      const error = new Error('L’adresse d’intervention est requise');
      error.status = 422;
      error.field = 'address';
      throw error;
    }
    const [insert] = await connection.query(
      `INSERT INTO service_requests
         (request_number, requester_contact_id, request_source, service_id,
          requested_maalem_profile_id, qualified_category_id, title, problem_description,
          requester_name, requester_phone, requester_email, city, intervention_address,
          latitude, longitude, desired_date, desired_time_slot, status, request_channel,
          client_submission_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        requestNumber, contactId, validation.value.request_source, service?.id || null,
        requestedMaalem?.id || null, qualifiedCategoryId, validation.value.title,
        validation.value.problem_description, requesterName, requesterPhone, requesterEmail,
        city, address, validation.value.latitude, validation.value.longitude,
        validation.value.desired_date, validation.value.desired_time_slot,
        SERVICE_REQUEST_INITIAL_STATUS, SERVICE_REQUEST_CHANNEL,
        validation.value.client_submission_id,
      ]
    );
    const requestId = Number(insert.insertId);

    for (const attachment of attachments.value) {
      const written = await writeAttachment(requestId, attachment);
      writtenFiles.push(written);
      const [attachmentInsert] = await connection.query(
        `INSERT INTO service_request_attachments
           (request_id, kind, storage_key, original_name, mime_type, file_size, uploaded_by_contact_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [requestId, written.kind, written.storageKey, written.file.originalname, written.mimeType, written.file.size, contactId]
      );
      written.id = Number(attachmentInsert.insertId);
    }

    if (validation.value.shared_note) {
      await connection.query(
        `INSERT INTO service_request_notes
           (request_id, visibility, body, actor_type, created_by_contact_id, actor_name)
         VALUES (?, 'SHARED', ?, 'CONTACT', ?, ?)`,
        [requestId, validation.value.shared_note, contactId, actorName]
      );
    }

    await connection.query(
      `INSERT INTO service_request_history
         (request_id, event_type, new_status, new_value, metadata,
          actor_type, actor_contact_id, actor_name)
       VALUES (?, 'CREATED', ?, ?, ?, 'CONTACT', ?, ?)`,
      [
        requestId,
        SERVICE_REQUEST_INITIAL_STATUS,
        JSON.stringify({ request_number: requestNumber, source: validation.value.request_source }),
        JSON.stringify({ channel: SERVICE_REQUEST_CHANNEL, attachment_count: writtenFiles.length }),
        contactId,
        actorName,
      ]
    );
    deliveries = await enqueueOperationalNotifications(connection, {
      serviceRequestId: requestId,
      event: OPERATIONAL_NOTIFICATION_EVENTS.CREATED,
      audiences: ['CLIENT'],
      versionKey: `created:${requestId}`,
      context: {
        id: requestId,
        request_number: requestNumber,
        requester_contact_id: contactId,
        client_phone: contact.telephone,
        client_locale: contact.locale,
        service_name: service?.nom || explicitCategory?.nom || validation.value.title,
        service_name_ar: service?.nom_ar || explicitCategory?.nom_ar || validation.value.title,
      },
    });
    await connection.commit();
    committed = true;
    await dispatchOperationalNotificationsSafely(deliveries);

    return res.status(201).json({
      request: normalizeServiceRequestRow({
        id: requestId,
        request_number: requestNumber,
        requester_contact_id: contactId,
        request_source: validation.value.request_source,
        service_id: service?.id || null,
        requested_maalem_profile_id: requestedMaalem?.id || null,
        qualified_category_id: qualifiedCategoryId,
        title: validation.value.title,
        problem_description: validation.value.problem_description,
        requester_name: requesterName,
        requester_phone: requesterPhone,
        requester_email: requesterEmail,
        city,
        intervention_address: address,
        latitude: validation.value.latitude,
        longitude: validation.value.longitude,
        desired_date: validation.value.desired_date,
        desired_time_slot: validation.value.desired_time_slot,
        status: SERVICE_REQUEST_INITIAL_STATUS,
        request_channel: SERVICE_REQUEST_CHANNEL,
        client_submission_id: validation.value.client_submission_id,
      }),
      attachments: writtenFiles.map((file) => ({
        id: file.id,
        request_id: requestId,
        kind: file.kind,
        original_name: file.file.originalname,
        mime_type: file.mimeType,
        file_size: file.file.size,
      })),
    });
  } catch (error) {
    if (!committed) {
      await connection.rollback().catch(() => {});
      await cleanupFiles(writtenFiles);
    }
    if (error?.code === 'ER_DUP_ENTRY' && validation.value.client_submission_id) {
      try {
        const [rows] = await pool.query(
          `SELECT * FROM service_requests
           WHERE requester_contact_id = ? AND client_submission_id = ? AND deleted_at IS NULL
           LIMIT 1`,
          [Number(req.user.id), validation.value.client_submission_id]
        );
        if (rows[0]) {
          return res.status(200).json({
            request: normalizeServiceRequestRow(rows[0]),
            attachments: [],
            duplicate_submission: true,
          });
        }
      } catch {
        // Preserve the original database error if the idempotency lookup fails.
      }
    }
    if (error?.publicCode) {
      return res.status(error.status || 422).json({
        message: error.message,
        error_type: error.publicCode,
      });
    }
    if (error?.status && error?.field) {
      return res.status(error.status).json({
        message: 'Demande invalide',
        errors: { [error.field]: error.message },
      });
    }
    return next(error);
  } finally {
    connection.release();
  }
  };
}

// KAN-16 owns these classification fields server-side. Keeping this endpoint
// separate also leaves room for a future, explicitly approved suggestion step.
router.post('/quick', handleAttachments, createServiceRequest({ forceQuickRequest: true, photosOnly: true }));
router.post('/selected-maalem', handleAttachments, createServiceRequest({ forceSelectedMaalem: true, photosOnly: true }));
router.post('/selected-service', handleAttachments, createServiceRequest({ forceSelectedService: true, photosOnly: true }));
router.post('/', handleAttachments, createServiceRequest());

router.get('/notifications', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT mnd.* FROM maalem_notification_deliveries mnd
       INNER JOIN service_requests sr ON sr.id = mnd.service_request_id AND sr.deleted_at IS NULL
       WHERE mnd.contact_id = ? AND sr.requester_contact_id = ? AND mnd.channel = 'IN_APP'
       ORDER BY mnd.created_at DESC, mnd.id DESC LIMIT 100`, [req.user.id, req.user.id]
    );
    res.json({ notifications: rows.map(normalizeOperationalNotificationRow) });
  } catch (error) { next(error); }
});

router.post('/notifications/:id(\\d+)/read', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Notification invalide' });
    const [result] = await pool.query(
      `UPDATE maalem_notification_deliveries mnd
       INNER JOIN service_requests sr ON sr.id = mnd.service_request_id AND sr.deleted_at IS NULL
       SET mnd.read_at = COALESCE(mnd.read_at, CURRENT_TIMESTAMP), mnd.updated_at = CURRENT_TIMESTAMP
       WHERE mnd.id = ? AND mnd.contact_id = ? AND sr.requester_contact_id = ? AND mnd.channel = 'IN_APP'`,
      [id, req.user.id, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Notification introuvable' });
    return res.status(204).send();
  } catch (error) { return next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT sr.id, sr.request_number, sr.requester_contact_id, sr.request_source, sr.service_id,
              sr.requested_maalem_profile_id, sr.qualified_category_id, sr.title, sr.problem_description,
              sr.city, sr.desired_date, sr.desired_time_slot, sr.status, sr.request_channel,
              sr.created_at, sr.updated_at,
              s.nom AS service_name, s.nom_ar AS service_name_ar,
              mc.nom AS category_name, mc.nom_ar AS category_name_ar,
              maalem_contact.nom_complet AS maalem_name
       FROM service_requests sr
       LEFT JOIN services s ON s.id = sr.service_id
       LEFT JOIN maalem_categories mc ON mc.id = sr.qualified_category_id
       LEFT JOIN maalem_profiles requested_maalem
         ON requested_maalem.id = sr.requested_maalem_profile_id
         AND requested_maalem.deleted_at IS NULL
       LEFT JOIN contacts maalem_contact
         ON maalem_contact.id = requested_maalem.contact_id
         AND maalem_contact.deleted_at IS NULL
       WHERE sr.requester_contact_id = ? AND sr.deleted_at IS NULL
       ORDER BY sr.created_at DESC, sr.id DESC
       LIMIT 200`,
      [Number(req.user.id)]
    );
    return res.json({ requests: rows.map(normalizeServiceRequestRow) });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  const requestId = parseId(req.params.id);
  if (!requestId) return res.status(400).json({ message: 'Identifiant de demande invalide' });
  try {
    const details = await listOwnedRequestDetails(pool, requestId, Number(req.user.id));
    if (!details) return res.status(404).json({ message: 'Demande introuvable' });
    return res.json(details);
  } catch (error) {
    return next(error);
  }
});

router.get('/:id/attachments/:attachmentId/download', async (req, res, next) => {
  const requestId = parseId(req.params.id);
  const attachmentId = parseId(req.params.attachmentId);
  if (!requestId || !attachmentId) return res.status(400).json({ message: 'Identifiant invalide' });
  try {
    const [rows] = await pool.query(
      `SELECT sra.storage_key, sra.original_name, sra.mime_type
       FROM service_request_attachments sra
       INNER JOIN service_requests sr ON sr.id = sra.request_id
       WHERE sra.id = ? AND sra.request_id = ? AND sra.deleted_at IS NULL
         AND sr.requester_contact_id = ? AND sr.deleted_at IS NULL
       LIMIT 1`,
      [attachmentId, requestId, Number(req.user.id)]
    );
    const attachment = rows[0];
    const absolutePath = attachment ? resolvePrivateAttachment(attachment.storage_key) : null;
    if (!absolutePath) return res.status(404).json({ message: 'Pièce jointe introuvable' });
    await fs.access(absolutePath);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', attachment.mime_type);
    return res.download(absolutePath, attachment.original_name);
  } catch (error) {
    if (error?.code === 'ENOENT') return res.status(404).json({ message: 'Pièce jointe introuvable' });
    return next(error);
  }
});

export {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_SIZE,
  nextRequestNumber,
  resolvePrivateAttachment,
  validateAttachments,
};

export default router;
