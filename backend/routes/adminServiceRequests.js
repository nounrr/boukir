import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Router } from 'express';
import multer from 'multer';
import pool from '../db/pool.js';
import { requireRoles } from '../middleware/auth.js';
import { detectBufferKind } from '../utils/uploadValidation.js';
import assignmentRouter from './adminServiceRequestAssignments.js';
import {
  SERVICE_REQUEST_CONTACT_CHANNELS,
  SERVICE_REQUEST_PRIORITIES,
  SERVICE_REQUEST_STATUSES,
  canTransitionServiceRequest,
  confirmationErrors,
  normalizeNullableText,
} from '../utils/serviceRequestBackoffice.js';
import {
  OPERATIONAL_NOTIFICATION_EVENTS,
  dispatchOperationalNotification,
  dispatchOperationalNotificationsSafely,
  enqueueOperationalNotifications,
  normalizeOperationalNotificationRow,
} from '../utils/operationalNotification.js';
import {
  INITIAL_RESPONSE_SLA_MINUTES,
  buildServiceRequestDashboardFilters,
  dashboardMetricSelect,
  normalizeDashboardMetrics,
  overdueSql,
} from '../utils/serviceRequestDashboard.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const privateFilesRoot = path.resolve(__dirname, '..', 'private_uploads', 'service_requests');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 8 } });
const allowedRoles = ['PDG', 'Manager', 'ManagerPlus'];
const kindExtensions = Object.freeze({ pdf: '.pdf', jpeg: '.jpg', png: '.png', webp: '.webp' });
const kindMimeTypes = Object.freeze({ pdf: 'application/pdf', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' });

router.use(requireRoles(...allowedRoles));
router.use(assignmentRouter);

function fail(status, message, errors) {
  const error = new Error(message);
  error.status = status;
  if (errors) error.errors = errors;
  throw error;
}

function handleAdminAttachments(req, res, next) {
  upload.array('attachments', 8)(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE' || error.code === 'LIMIT_FILE_COUNT') {
      return res.status(413).json({ message: 'Maximum 8 fichiers de 8 Mo chacun' });
    }
    return res.status(400).json({ message: error.message || 'Pièce jointe invalide' });
  });
}

function positiveId(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function positiveIdOrNull(value) {
  if (value == null || value === '') return null;
  return positiveId(value) ?? undefined;
}

function json(value) {
  if (value == null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function normalizeRow(row) {
  if (!row) return null;
  const numeric = [
    'id', 'requester_contact_id', 'service_id', 'qualified_service_id',
    'requested_maalem_profile_id', 'qualified_category_id', 'handled_by_employee_id',
    'confirmed_by_employee_id', 'cancelled_by_employee_id', 'current_assignment_id',
    'current_assigned_maalem_profile_id', 'intervention_id',
  ];
  const result = { ...row };
  for (const key of numeric) result[key] = result[key] == null ? null : Number(result[key]);
  result.latitude = result.latitude == null ? null : Number(result.latitude);
  result.longitude = result.longitude == null ? null : Number(result.longitude);
  result.assignment_eligible = result.status === 'confirmed' && !result.cancelled_at;
  result.is_overdue = Boolean(Number(result.is_overdue));
  return result;
}

async function actor(connection, employeeId) {
  const [rows] = await connection.query(
    'SELECT id, nom_complet FROM employees WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [employeeId]
  );
  if (!rows[0]) {
    const error = new Error('Employé Back-office introuvable');
    error.status = 403;
    throw error;
  }
  return { id: Number(rows[0].id), name: rows[0].nom_complet || `Employé #${rows[0].id}` };
}

async function requestForUpdate(connection, requestId) {
  const [rows] = await connection.query(
    'SELECT * FROM service_requests WHERE id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE',
    [requestId]
  );
  return normalizeRow(rows[0]);
}

async function history(connection, requestId, employee, eventType, { oldStatus = null, newStatus = null, oldValue = null, newValue = null, metadata = null } = {}) {
  await connection.query(
    `INSERT INTO service_request_history
       (request_id, event_type, old_status, new_status, old_value, new_value, metadata,
        actor_type, actor_employee_id, actor_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'EMPLOYEE', ?, ?)`,
    [requestId, eventType, oldStatus, newStatus, json(oldValue), json(newValue), json(metadata), employee.id, employee.name]
  );
}

function baseFrom() {
  return `FROM service_requests sr
    INNER JOIN contacts requester ON requester.id = sr.requester_contact_id
    LEFT JOIN services initial_service ON initial_service.id = sr.service_id
    LEFT JOIN services qualified_service ON qualified_service.id = sr.qualified_service_id
    LEFT JOIN maalem_categories category ON category.id = sr.qualified_category_id
    LEFT JOIN maalem_profiles requested_maalem ON requested_maalem.id = sr.requested_maalem_profile_id
    LEFT JOIN contacts requested_maalem_contact ON requested_maalem_contact.id = requested_maalem.contact_id
    LEFT JOIN employees handler ON handler.id = sr.handled_by_employee_id
    LEFT JOIN employees confirmer ON confirmer.id = sr.confirmed_by_employee_id
    LEFT JOIN employees canceller ON canceller.id = sr.cancelled_by_employee_id
    LEFT JOIN service_request_assignments current_assignment ON current_assignment.id = sr.current_assignment_id
    LEFT JOIN maalem_profiles current_maalem ON current_maalem.id = current_assignment.maalem_profile_id
    LEFT JOIN contacts current_maalem_contact ON current_maalem_contact.id = current_maalem.contact_id
    LEFT JOIN service_interventions si ON si.service_request_id = sr.id`;
}

function baseSelect() {
  return `SELECT sr.*,
      requester.nom_complet AS contact_account_name,
      requester.telephone AS contact_account_phone,
      requester.email AS contact_account_email,
      initial_service.nom AS initial_service_name,
      qualified_service.nom AS qualified_service_name,
      category.nom AS qualified_category_name,
      requested_maalem_contact.nom_complet AS requested_maalem_name,
      handler.nom_complet AS handled_by_name,
      confirmer.nom_complet AS confirmed_by_name,
      canceller.nom_complet AS cancelled_by_name
      ,current_assignment.maalem_profile_id AS current_assigned_maalem_profile_id
      ,current_maalem_contact.nom_complet AS current_assigned_maalem_name
      ,si.id AS intervention_id, si.planned_date, si.planned_time_slot
      ,sr.status AS administrative_status, si.status AS intervention_status, si.status AS operational_status
      ,${overdueSql()} AS is_overdue
    ${baseFrom()}`;
}

router.get('/dashboard', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT ${dashboardMetricSelect()} ${baseFrom()} WHERE sr.deleted_at IS NULL`
    );
    res.json({
      generated_at: new Date().toISOString(),
      initial_response_sla_minutes: INITIAL_RESPONSE_SLA_MINUTES,
      metrics: normalizeDashboardMetrics(rows[0]),
    });
  } catch (error) { next(error); }
});

router.get('/filters', async (_req, res, next) => {
  try {
    const [[services], [categories], [maalems], [employees], [cities]] = await Promise.all([
      pool.query('SELECT id, nom FROM services WHERE is_active = 1 AND deleted_at IS NULL ORDER BY nom'),
      pool.query('SELECT id, nom FROM maalem_categories WHERE is_active = 1 AND deleted_at IS NULL ORDER BY nom'),
      pool.query(`SELECT mp.id, c.nom_complet AS name FROM maalem_profiles mp
        INNER JOIN contacts c ON c.id = mp.contact_id
        WHERE mp.deleted_at IS NULL AND mp.status = 'approved' AND c.deleted_at IS NULL ORDER BY c.nom_complet`),
      pool.query(`SELECT id, nom_complet AS name FROM employees
        WHERE deleted_at IS NULL AND role IN ('PDG', 'Manager', 'ManagerPlus') ORDER BY nom_complet`),
      pool.query(`SELECT DISTINCT city FROM service_requests
        WHERE deleted_at IS NULL AND city IS NOT NULL AND city <> '' ORDER BY city`),
    ]);
    res.json({ services, categories, maalems, employees, cities: cities.map((row) => row.city) });
  } catch (error) { next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(10, Number.parseInt(req.query.limit, 10) || 25));
    const { where, params } = buildServiceRequestDashboardFilters(req.query);
    const [[countRow], [rows]] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total ${baseFrom()} WHERE ${where}`, params),
      pool.query(`${baseSelect()} WHERE ${where} ORDER BY sr.created_at DESC, sr.id DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]),
    ]);
    res.json({ requests: rows.map(normalizeRow), page, limit, total: Number(countRow[0]?.total || 0) });
  } catch (error) { next(error); }
});

router.get('/:id(\\d+)', async (req, res, next) => {
  try {
    const requestId = positiveId(req.params.id);
    const [[rows], [attachments], [notes], [contacts], [events], [assignments], [notifications], [reviewInvitations]] = await Promise.all([
      pool.query(`${baseSelect()} WHERE sr.id = ? AND sr.deleted_at IS NULL LIMIT 1`, [requestId]),
      pool.query(`SELECT id, request_id, kind, original_name, mime_type, file_size, created_at
        FROM service_request_attachments WHERE request_id = ? AND deleted_at IS NULL ORDER BY created_at, id`, [requestId]),
      pool.query(`SELECT id, visibility, body, actor_name, created_at FROM service_request_notes
        WHERE request_id = ? ORDER BY created_at, id`, [requestId]),
      pool.query(`SELECT src.id, src.channel, src.contacted_at, src.result, src.internal_observation,
          src.created_at, e.nom_complet AS employee_name
        FROM service_request_contacts src INNER JOIN employees e ON e.id = src.created_by_employee_id
        WHERE src.request_id = ? ORDER BY src.contacted_at DESC, src.id DESC`, [requestId]),
      pool.query(`SELECT id, event_type, old_status, new_status, old_value, new_value, metadata,
          actor_name, created_at FROM service_request_history
        WHERE request_id = ? ORDER BY created_at DESC, id DESC`, [requestId]),
      pool.query(`SELECT sra.id, sra.maalem_profile_id, maalem.nom_complet AS maalem_name,
          category.nom AS category_name, assigner.nom_complet AS assigned_by_name,
          unassigner.nom_complet AS unassigned_by_name, sra.assigned_at, sra.assignment_reason,
          sra.compatibility_override, sra.compatibility_override_reason,
          sra.unassigned_at, sra.unassignment_reason, (sra.unassigned_at IS NULL) AS is_current
        FROM service_request_assignments sra
        INNER JOIN maalem_profiles mp ON mp.id = sra.maalem_profile_id
        INNER JOIN contacts maalem ON maalem.id = mp.contact_id
        LEFT JOIN maalem_categories category ON category.id = mp.category_id
        INNER JOIN employees assigner ON assigner.id = sra.assigned_by_employee_id
        LEFT JOIN employees unassigner ON unassigner.id = sra.unassigned_by_employee_id
        WHERE sra.service_request_id = ? ORDER BY sra.assigned_at DESC, sra.id DESC`, [requestId]),
      pool.query(`SELECT mnd.*, COALESCE(recipient.nom_complet, recipient.email, recipient.telephone,
          CASE WHEN mnd.recipient_type = 'BACKOFFICE_TEAM' THEN 'Équipe Back-office' END) AS recipient_name
        FROM maalem_notification_deliveries mnd
        LEFT JOIN contacts recipient ON recipient.id = mnd.contact_id
        WHERE mnd.service_request_id = ? ORDER BY mnd.created_at DESC, mnd.id DESC`, [requestId]),
      pool.query(`SELECT status, scheduled_at, expires_at, first_sent_at, last_sent_at,
          next_reminder_at, reminder_count, max_reminders, processing_attempts,
          opened_at, submitted_at, last_error, created_at, updated_at
        FROM maalem_review_invitations WHERE service_request_id = ? LIMIT 1`, [requestId]),
    ]);
    if (!rows[0]) return res.status(404).json({ message: 'Demande introuvable' });
    res.json({ request: normalizeRow(rows[0]), attachments, notes, contacts, history: events,
      assignments: assignments.map((item) => ({ ...item, id: Number(item.id), maalem_profile_id: Number(item.maalem_profile_id), compatibility_override: Boolean(Number(item.compatibility_override)), is_current: Boolean(Number(item.is_current)) })),
      notifications: notifications.map((item) => ({ ...normalizeOperationalNotificationRow(item), recipient_name: item.recipient_name })),
      review_invitation: reviewInvitations[0] ? {
        ...reviewInvitations[0],
        reminder_count: Number(reviewInvitations[0].reminder_count),
        max_reminders: Number(reviewInvitations[0].max_reminders),
        processing_attempts: Number(reviewInvitations[0].processing_attempts),
      } : null });
  } catch (error) { next(error); }
});

router.get('/:id(\\d+)/attachments/:attachmentId(\\d+)', async (req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT storage_key, original_name, mime_type
      FROM service_request_attachments WHERE id = ? AND request_id = ? AND deleted_at IS NULL LIMIT 1`,
    [positiveId(req.params.attachmentId), positiveId(req.params.id)]);
    if (!rows[0]) return res.status(404).json({ message: 'Pièce jointe introuvable' });
    const absolutePath = path.resolve(privateFilesRoot, rows[0].storage_key);
    const relative = path.relative(privateFilesRoot, absolutePath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return res.status(404).json({ message: 'Pièce jointe introuvable' });
    res.type(rows[0].mime_type);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(rows[0].original_name)}`);
    return res.sendFile(absolutePath);
  } catch (error) { next(error); }
});

router.post('/:id(\\d+)/attachments', handleAdminAttachments, async (req, res, next) => {
  const requestId = positiveId(req.params.id);
  const written = [];
  let connection;
  try {
    if (!req.files?.length) return res.status(422).json({ message: 'Au moins une pièce jointe est requise' });
    const files = req.files.map((file) => {
      const detected = detectBufferKind(file.buffer);
      if (!kindExtensions[detected]) throw Object.assign(new Error('Formats autorisés : PDF, JPG, PNG et WEBP'), { status: 422 });
      return { file, detected };
    });
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const employee = await actor(connection, req.user.id);
    const request = await requestForUpdate(connection, requestId);
    if (!request) fail(404, 'Demande introuvable');
    if (['confirmed', 'cancelled'].includes(request.status)) fail(409, 'Cette demande est terminée');
    const directory = path.join(privateFilesRoot, String(requestId));
    await fs.mkdir(directory, { recursive: true });
    for (const item of files) {
      const filename = `${crypto.randomUUID()}${kindExtensions[item.detected]}`;
      const absolutePath = path.join(directory, filename);
      await fs.writeFile(absolutePath, item.file.buffer, { flag: 'wx' });
      written.push(absolutePath);
      await connection.query(`INSERT INTO service_request_attachments
        (request_id, kind, storage_key, original_name, mime_type, file_size, uploaded_by_employee_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)`, [requestId, item.detected === 'pdf' ? 'DOCUMENT' : 'PHOTO',
        path.posix.join(String(requestId), filename), item.file.originalname, kindMimeTypes[item.detected], item.file.size, employee.id]);
    }
    await history(connection, requestId, employee, 'attachments_added', { newValue: { count: files.length } });
    await connection.commit();
    res.status(201).json({ added: files.length });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    await Promise.all(written.map((file) => fs.unlink(file).catch(() => {})));
    next(error);
  } finally { connection?.release(); }
});

router.patch('/:id(\\d+)/qualification', async (req, res, next) => {
  let connection;
  try {
    const requestId = positiveId(req.params.id);
    const serviceId = positiveIdOrNull(req.body.qualified_service_id);
    const categoryId = positiveIdOrNull(req.body.qualified_category_id);
    const handlerId = positiveIdOrNull(req.body.handled_by_employee_id);
    const textFields = {
      qualified_description: normalizeNullableText(req.body.qualified_description),
      requester_name: normalizeNullableText(req.body.requester_name, 255),
      requester_phone: normalizeNullableText(req.body.requester_phone, 50),
      city: normalizeNullableText(req.body.city, 100),
      intervention_address: normalizeNullableText(req.body.intervention_address, 500),
      desired_time_slot: normalizeNullableText(req.body.desired_time_slot, 100),
    };
    if ([serviceId, categoryId, handlerId, ...Object.values(textFields)].some((value) => value === undefined)) {
      return res.status(422).json({ message: 'Données de qualification invalides' });
    }
    const latitude = req.body.latitude == null || req.body.latitude === '' ? null : Number(req.body.latitude);
    const longitude = req.body.longitude == null || req.body.longitude === '' ? null : Number(req.body.longitude);
    if ((latitude == null) !== (longitude == null) || (latitude != null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
      return res.status(422).json({ message: 'Coordonnées invalides' });
    }
    const desiredDate = req.body.desired_date || null;
    if (desiredDate && !/^\d{4}-\d{2}-\d{2}$/.test(desiredDate)) return res.status(422).json({ message: 'Date souhaitée invalide' });
    const priority = req.body.priority || 'normal';
    if (!SERVICE_REQUEST_PRIORITIES.includes(priority)) return res.status(422).json({ message: 'Priorité invalide' });
    connection = await pool.getConnection(); await connection.beginTransaction();
    const employee = await actor(connection, req.user.id);
    const before = await requestForUpdate(connection, requestId);
    if (!before) fail(404, 'Demande introuvable');
    if (['confirmed', 'assigned', 'scheduled', 'to_do', 'en_route', 'arrived', 'work_in_progress', 'completed', 'closed', 'cancelled'].includes(before.status)) fail(409, 'Cette demande ne peut plus être requalifiée');
    if (serviceId) {
      const [rows] = await connection.query('SELECT id FROM services WHERE id = ? AND is_active = 1 AND deleted_at IS NULL', [serviceId]);
      if (!rows[0]) fail(422, 'Service qualifié indisponible');
    }
    if (categoryId) {
      const [rows] = await connection.query('SELECT id FROM maalem_categories WHERE id = ? AND is_active = 1 AND deleted_at IS NULL', [categoryId]);
      if (!rows[0]) fail(422, 'Catégorie qualifiée indisponible');
    }
    if (handlerId) {
      const [rows] = await connection.query(`SELECT id FROM employees WHERE id = ? AND deleted_at IS NULL
        AND role IN ('PDG', 'Manager', 'ManagerPlus')`, [handlerId]);
      if (!rows[0]) fail(422, 'Responsable Back-office invalide');
    }
    const after = { ...textFields, qualified_service_id: serviceId, qualified_category_id: categoryId,
      handled_by_employee_id: handlerId, latitude, longitude, desired_date: desiredDate, priority };
    await connection.query(`UPDATE service_requests SET qualified_service_id = ?, qualified_category_id = ?,
      qualified_description = ?, requester_name = ?, requester_phone = ?, city = ?, intervention_address = ?,
      latitude = ?, longitude = ?, desired_date = ?, desired_time_slot = ?, priority = ?, handled_by_employee_id = ?
      WHERE id = ?`, [serviceId, categoryId, textFields.qualified_description, textFields.requester_name,
      textFields.requester_phone, textFields.city, textFields.intervention_address, latitude, longitude,
      desiredDate, textFields.desired_time_slot, priority, handlerId, requestId]);
    const oldValue = Object.fromEntries(Object.keys(after).map((key) => [key, before[key]]));
    await history(connection, requestId, employee, 'qualification_updated', { oldValue, newValue: after });
    await connection.commit();
    res.json({ message: 'Qualification enregistrée' });
  } catch (error) { if (connection) await connection.rollback().catch(() => {}); next(error); }
  finally { connection?.release(); }
});

router.post('/:id(\\d+)/notes', async (req, res, next) => {
  let connection;
  try {
    const requestId = positiveId(req.params.id);
    const visibility = req.body.visibility;
    const body = normalizeNullableText(req.body.body, 10000);
    if (!['INTERNAL', 'SHARED'].includes(visibility) || !body) return res.status(422).json({ message: 'Note invalide' });
    connection = await pool.getConnection(); await connection.beginTransaction();
    const employee = await actor(connection, req.user.id);
    if (!await requestForUpdate(connection, requestId)) fail(404, 'Demande introuvable');
    await connection.query(`INSERT INTO service_request_notes
      (request_id, visibility, body, actor_type, created_by_employee_id, actor_name)
      VALUES (?, ?, ?, 'EMPLOYEE', ?, ?)`, [requestId, visibility, body, employee.id, employee.name]);
    await history(connection, requestId, employee, visibility === 'INTERNAL' ? 'internal_note_added' : 'shared_instruction_added', { newValue: { visibility } });
    await connection.commit(); res.status(201).json({ message: 'Note enregistrée' });
  } catch (error) { if (connection) await connection.rollback().catch(() => {}); next(error); }
  finally { connection?.release(); }
});

router.post('/:id(\\d+)/contacts', async (req, res, next) => {
  let connection;
  try {
    const requestId = positiveId(req.params.id);
    const channel = req.body.channel;
    const result = normalizeNullableText(req.body.result, 500);
    const observation = normalizeNullableText(req.body.internal_observation, 10000);
    const contactedAt = req.body.contacted_at ? new Date(req.body.contacted_at) : new Date();
    if (!SERVICE_REQUEST_CONTACT_CHANNELS.includes(channel) || !result || Number.isNaN(contactedAt.getTime())) {
      return res.status(422).json({ message: 'Échange client invalide' });
    }
    connection = await pool.getConnection(); await connection.beginTransaction();
    const employee = await actor(connection, req.user.id);
    const request = await requestForUpdate(connection, requestId);
    if (!request) fail(404, 'Demande introuvable');
    await connection.query(`INSERT INTO service_request_contacts
      (request_id, channel, contacted_at, result, internal_observation, created_by_employee_id)
      VALUES (?, ?, ?, ?, ?, ?)`, [requestId, channel, contactedAt, result, observation, employee.id]);
    await history(connection, requestId, employee, 'customer_contact_recorded', { newValue: { channel, contacted_at: contactedAt, result } });
    await connection.commit(); res.status(201).json({ message: 'Échange enregistré' });
  } catch (error) { if (connection) await connection.rollback().catch(() => {}); next(error); }
  finally { connection?.release(); }
});

router.post('/:id(\\d+)/transition', async (req, res, next) => {
  let connection;
  let deliveries = [];
  try {
    const requestId = positiveId(req.params.id);
    const nextStatus = req.body.status;
    const reason = normalizeNullableText(req.body.reason, 1000);
    const publicReason = normalizeNullableText(req.body.public_reason, 1000);
    if (publicReason === undefined) return res.status(422).json({ message: 'Motif public invalide' });
    if (!SERVICE_REQUEST_STATUSES.includes(nextStatus)) return res.status(422).json({ message: 'Statut invalide' });
    connection = await pool.getConnection(); await connection.beginTransaction();
    const employee = await actor(connection, req.user.id);
    const request = await requestForUpdate(connection, requestId);
    if (!request) fail(404, 'Demande introuvable');
    if (!canTransitionServiceRequest(request.status, nextStatus)) fail(409, `Transition ${request.status} → ${nextStatus} interdite`);
    if (nextStatus === 'confirmed') {
      const errors = confirmationErrors(request);
      if (Object.keys(errors).length) fail(422, 'Informations minimales incomplètes', errors);
    }
    if (nextStatus === 'cancelled' && !reason) fail(422, "Un motif d'annulation est obligatoire");
    const handlerId = request.handled_by_employee_id || employee.id;
    await connection.query(`UPDATE service_requests SET status = ?, handled_by_employee_id = ?,
      confirmed_by_employee_id = ?, confirmed_at = ?, cancelled_by_employee_id = ?, cancelled_at = ?,
      cancellation_reason = ?, cancellation_public_reason = ?
      WHERE id = ?`, [nextStatus, handlerId, nextStatus === 'confirmed' ? employee.id : null,
      nextStatus === 'confirmed' ? new Date() : null, nextStatus === 'cancelled' ? employee.id : null,
      nextStatus === 'cancelled' ? new Date() : null, nextStatus === 'cancelled' ? reason : null,
      nextStatus === 'cancelled' ? publicReason : null, requestId]);
    await history(connection, requestId, employee, 'status_changed', { oldStatus: request.status, newStatus: nextStatus, metadata: reason ? { reason } : null });
    const notificationEvent = nextStatus === 'confirmed' ? OPERATIONAL_NOTIFICATION_EVENTS.CONFIRMED
      : nextStatus === 'cancelled' ? OPERATIONAL_NOTIFICATION_EVENTS.CANCELLED : null;
    if (notificationEvent) deliveries = await enqueueOperationalNotifications(connection, {
      serviceRequestId: requestId,
      event: notificationEvent,
      audiences: ['CLIENT'],
      publicReason: nextStatus === 'cancelled' ? publicReason : null,
      versionKey: `status:${request.status}:${nextStatus}`,
      createdByEmployeeId: employee.id,
    });
    await connection.commit();
    await dispatchOperationalNotificationsSafely(deliveries);
    res.json({ status: nextStatus, assignment_eligible: nextStatus === 'confirmed' });
  } catch (error) { if (connection) await connection.rollback().catch(() => {}); next(error); }
  finally { connection?.release(); }
});

router.post('/:id(\\d+)/notifications/:notificationId(\\d+)/retry', async (req, res, next) => {
  try {
    const requestId = positiveId(req.params.id);
    const notificationId = positiveId(req.params.notificationId);
    if (!requestId || !notificationId) return res.status(400).json({ message: 'Notification invalide' });
    const [rows] = await pool.query(
      `SELECT * FROM maalem_notification_deliveries
       WHERE id = ? AND service_request_id = ? LIMIT 1`, [notificationId, requestId]
    );
    const delivery = rows[0];
    if (!delivery) return res.status(404).json({ message: 'Notification introuvable' });
    if (delivery.channel !== 'WHATSAPP') return res.status(409).json({ message: 'Ce canal ne nécessite pas de relance' });
    const result = await dispatchOperationalNotification(notificationId, { force: true });
    const [updated] = await pool.query(
      'SELECT * FROM maalem_notification_deliveries WHERE id = ? AND service_request_id = ? LIMIT 1',
      [notificationId, requestId]
    );
    res.json({ result, notification: normalizeOperationalNotificationRow(updated[0]) });
  } catch (error) { next(error); }
});

export default router;
