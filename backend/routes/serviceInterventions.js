import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Router } from 'express';
import multer from 'multer';
import pool from '../db/pool.js';
import { requireRoles } from '../middleware/auth.js';
import { canReceiveServiceAssignments } from '../utils/maalemAccess.js';
import { detectBufferKind } from '../utils/uploadValidation.js';
import {
  canTransitionIntervention,
  validateCompletionReport,
  validateProgress,
  validateSchedule,
} from '../utils/serviceIntervention.js';
import {
  OPERATIONAL_NOTIFICATION_EVENTS,
  dispatchOperationalNotificationsSafely,
  enqueueOperationalNotifications,
  notifiableInterventionStatuses,
  scheduleHasMeaningfulChange,
  shouldNotifyOperationalPolicy,
} from '../utils/operationalNotification.js';

const maalemRouter = Router();
export const adminServiceInterventionsRouter = Router();
adminServiceInterventionsRouter.use(requireRoles('PDG', 'Manager', 'ManagerPlus'));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const photoRoot = path.resolve(__dirname, '..', 'private_uploads', 'service_interventions');
const MAX_PHOTOS = 8;
const upload = multer({ storage: multer.memoryStorage(), limits: { files: MAX_PHOTOS, fileSize: 8 * 1024 * 1024, fields: 10 } });
const PHOTO_TYPES = Object.freeze({ jpeg: ['.jpg', 'image/jpeg'], png: ['.png', 'image/png'], webp: ['.webp', 'image/webp'] });

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function fail(status, message, errors) {
  const error = new Error(message);
  error.status = status;
  if (errors) error.errors = errors;
  throw error;
}

function json(value) {
  if (value == null || typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function handlePhotos(req, res, next) {
  upload.array('photos', MAX_PHOTOS)(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'Chaque photo est limitée à 8 Mo' });
    if (error.code === 'LIMIT_FILE_COUNT') return res.status(413).json({ message: `Maximum ${MAX_PHOTOS} photos` });
    return res.status(400).json({ message: error.message || 'Photo invalide' });
  });
}

async function loadEmployee(connection, id) {
  const [rows] = await connection.query(
    `SELECT id, nom_complet FROM employees WHERE id = ? AND deleted_at IS NULL
     AND role IN ('PDG', 'Manager', 'ManagerPlus') LIMIT 1`, [id]
  );
  if (!rows[0]) fail(403, 'Utilisateur Back-office non autorisé');
  return { id: Number(rows[0].id), name: rows[0].nom_complet || `Employé #${rows[0].id}` };
}

async function loadMaalem(connection, contactId) {
  const [rows] = await connection.query(
    `SELECT mp.id, mp.contact_id, mp.status, mp.deleted_at, c.nom_complet, c.telephone, c.locale,
            c.deleted_at AS contact_deleted_at, c.is_active, c.is_blocked
     FROM maalem_profiles mp INNER JOIN contacts c ON c.id = mp.contact_id
     WHERE mp.contact_id = ? LIMIT 1`, [contactId]
  );
  const row = rows[0];
  if (!row || row.deleted_at || row.contact_deleted_at || !canReceiveServiceAssignments(row)
      || Number(row.is_active ?? 1) !== 1 || Number(row.is_blocked ?? 0) === 1) {
    fail(403, 'Accès réservé au Maalem approuvé et actif actuellement affecté');
  }
  return { id: Number(row.id), contactId: Number(row.contact_id), name: row.nom_complet || `Maalem #${row.id}`,
    phone: row.telephone || null, locale: row.locale || 'fr' };
}

function notificationContext(row, maalem = null) {
  return {
    id: Number(row.service_request_id || row.id),
    request_number: row.request_number,
    requester_contact_id: row.requester_contact_id,
    client_phone: row.client_phone,
    client_locale: row.client_locale,
    service_name: row.service_name || row.category_name,
    service_name_ar: row.service_name_ar || row.category_name_ar || row.service_name || row.category_name,
    current_maalem_profile_id: row.current_maalem_profile_id || row.maalem_profile_id || maalem?.id,
    current_maalem_contact_id: row.current_maalem_contact_id || maalem?.contactId,
    current_maalem_phone: row.current_maalem_phone || maalem?.phone,
    current_maalem_locale: row.current_maalem_locale || maalem?.locale,
    intervention_id: row.intervention_id || (row.service_request_id ? row.id : null),
    planned_date: row.planned_date,
    planned_time_slot: row.planned_time_slot,
  };
}

async function loadAdminIntervention(connection, id, forUpdate = false) {
  const [rows] = await connection.query(
    `SELECT si.*, sr.request_number, sr.requester_contact_id, sr.status AS request_status, sr.current_assignment_id,
            sra.maalem_profile_id AS current_maalem_profile_id,
            mp.contact_id AS current_maalem_contact_id,
            c.nom_complet AS current_maalem_name, c.telephone AS current_maalem_phone,
            c.locale AS current_maalem_locale, requester.telephone AS client_phone,
            requester.locale AS client_locale,
            COALESCE(s.nom, mc.nom) AS service_name,
            COALESCE(s.nom_ar, mc.nom_ar, s.nom, mc.nom) AS service_name_ar
     FROM service_interventions si
     INNER JOIN service_requests sr ON sr.id = si.service_request_id AND sr.deleted_at IS NULL
     INNER JOIN service_request_assignments sra ON sra.id = sr.current_assignment_id AND sra.unassigned_at IS NULL
     INNER JOIN maalem_profiles mp ON mp.id = sra.maalem_profile_id
     INNER JOIN contacts c ON c.id = mp.contact_id
     INNER JOIN contacts requester ON requester.id = sr.requester_contact_id
     LEFT JOIN services s ON s.id = si.planned_service_id
     LEFT JOIN maalem_categories mc ON mc.id = si.planned_category_id
     WHERE si.id = ? LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`, [id]
  );
  return rows[0] || null;
}

async function loadMaalemIntervention(connection, id, maalem, forUpdate = false) {
  const [rows] = await connection.query(
    `SELECT si.id, si.service_request_id, si.status, si.planned_date, si.planned_time_slot,
            si.mission_address, si.mission_city, si.latitude, si.longitude,
            si.planned_service_id, si.planned_category_id, si.mission_contact_name,
            si.mission_contact_phone, si.shared_instructions, si.special_information,
            si.progress_percent, si.work_summary, si.maalem_observations, si.work_finished,
            si.additional_intervention_required, si.incomplete_reason, si.scheduled_at,
            si.en_route_at, si.arrived_at, si.started_at, si.completed_at, si.created_at, si.updated_at,
            sr.request_number, sr.requester_contact_id,
            requester.telephone AS client_phone, requester.locale AS client_locale,
            COALESCE(sr.qualified_description, sr.problem_description) AS mission_description,
            sr.current_assignment_id, sra.maalem_profile_id,
            s.nom AS service_name, s.nom_ar AS service_name_ar,
            mc.nom AS category_name, mc.nom_ar AS category_name_ar
     FROM service_interventions si
     INNER JOIN service_requests sr ON sr.id = si.service_request_id AND sr.deleted_at IS NULL
     INNER JOIN service_request_assignments sra ON sra.id = sr.current_assignment_id
       AND sra.unassigned_at IS NULL AND sra.maalem_profile_id = ?
     LEFT JOIN services s ON s.id = si.planned_service_id
     LEFT JOIN maalem_categories mc ON mc.id = si.planned_category_id
     INNER JOIN contacts requester ON requester.id = sr.requester_contact_id
     WHERE si.id = ? LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`, [maalem.id, id]
  );
  return rows[0] || null;
}

async function history(connection, interventionId, actor, eventType, oldStatus, newStatus, oldValue = null, newValue = null, metadata = null) {
  const isEmployee = actor.type === 'EMPLOYEE';
  await connection.query(
    `INSERT INTO service_intervention_history
       (intervention_id, event_type, old_status, new_status, old_value, new_value, metadata,
        actor_type, actor_employee_id, actor_contact_id, actor_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [interventionId, eventType, oldStatus, newStatus, oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null, metadata ? JSON.stringify(metadata) : null,
      actor.type, isEmployee ? actor.id : null, isEmployee ? null : actor.contactId, actor.name]
  );
}

async function listPhotos(connection, interventionId) {
  const [rows] = await connection.query(
    `SELECT id, phase, original_name, mime_type, file_size, created_at
     FROM service_intervention_photos WHERE intervention_id = ? AND deleted_at IS NULL
     ORDER BY created_at, id`, [interventionId]
  );
  return rows.map((row) => ({ ...row, id: Number(row.id), file_size: Number(row.file_size) }));
}

adminServiceInterventionsRouter.get('/by-request/:requestId(\\d+)', async (req, res, next) => {
  try {
    const requestId = positiveId(req.params.requestId);
    if (!requestId) return res.status(400).json({ message: 'Demande invalide' });
    const [rows] = await pool.query(
      `SELECT si.*, sr.request_number, sr.status AS request_status, sr.current_assignment_id,
              c.nom_complet AS current_maalem_name
       FROM service_requests sr
       LEFT JOIN service_interventions si ON si.service_request_id = sr.id
       LEFT JOIN service_request_assignments sra ON sra.id = sr.current_assignment_id AND sra.unassigned_at IS NULL
       LEFT JOIN maalem_profiles mp ON mp.id = sra.maalem_profile_id
       LEFT JOIN contacts c ON c.id = mp.contact_id
       WHERE sr.id = ? AND sr.deleted_at IS NULL LIMIT 1`, [requestId]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Demande introuvable' });
    if (!rows[0].id) return res.json({ intervention: null });
    const [eventRows] = await pool.query(
      `SELECT id, event_type, old_status, new_status, old_value, new_value, metadata,
              actor_type, actor_name, created_at
       FROM service_intervention_history WHERE intervention_id = ? ORDER BY created_at, id`, [rows[0].id]
    );
    const photos = await listPhotos(pool, rows[0].id);
    res.json({ intervention: rows[0], history: eventRows.map((event) => ({
      ...event, old_value: json(event.old_value), new_value: json(event.new_value), metadata: json(event.metadata),
    })), photos });
  } catch (error) { next(error); }
});

adminServiceInterventionsRouter.put('/by-request/:requestId(\\d+)/schedule', async (req, res, next) => {
  const connection = await pool.getConnection();
  let deliveries = [];
  try {
    const requestId = positiveId(req.params.requestId);
    const validation = validateSchedule(req.body);
    if (!requestId || !validation.valid) fail(422, 'Planification invalide', validation.errors);
    await connection.beginTransaction();
    const actor = { ...(await loadEmployee(connection, req.user.id)), type: 'EMPLOYEE' };
    const [requests] = await connection.query(
      `SELECT sr.id, sr.request_number, sr.requester_contact_id, sr.status, sr.current_assignment_id,
              requester.telephone AS client_phone, requester.locale AS client_locale,
              sra.maalem_profile_id AS current_maalem_profile_id,
              mp.contact_id AS current_maalem_contact_id,
              maalem.telephone AS current_maalem_phone, maalem.locale AS current_maalem_locale,
              COALESCE(qs.nom, initial_service.nom, category.nom, sr.title) AS service_name,
              COALESCE(qs.nom_ar, initial_service.nom_ar, category.nom_ar, sr.title) AS service_name_ar
       FROM service_requests sr
       INNER JOIN contacts requester ON requester.id = sr.requester_contact_id
       LEFT JOIN service_request_assignments sra ON sra.id = sr.current_assignment_id AND sra.unassigned_at IS NULL
       LEFT JOIN maalem_profiles mp ON mp.id = sra.maalem_profile_id
       LEFT JOIN contacts maalem ON maalem.id = mp.contact_id
       LEFT JOIN services initial_service ON initial_service.id = sr.service_id
       LEFT JOIN services qs ON qs.id = sr.qualified_service_id
       LEFT JOIN maalem_categories category ON category.id = sr.qualified_category_id
       WHERE sr.id = ? AND sr.deleted_at IS NULL LIMIT 1 FOR UPDATE`, [requestId]
    );
    const request = requests[0];
    if (!request) fail(404, 'Demande introuvable');
    if (!request.current_assignment_id || !['assigned', 'scheduled'].includes(request.status)) {
      fail(409, 'La demande doit avoir une affectation courante et être affectée ou planifiée');
    }
    const [assignments] = await connection.query(
      `SELECT id FROM service_request_assignments WHERE id = ? AND service_request_id = ?
       AND unassigned_at IS NULL LIMIT 1 FOR UPDATE`, [request.current_assignment_id, requestId]
    );
    if (!assignments[0]) fail(409, 'Affectation courante incohérente');
    const [existingRows] = await connection.query(
      'SELECT * FROM service_interventions WHERE service_request_id = ? LIMIT 1 FOR UPDATE', [requestId]
    );
    const old = existingRows[0] || null;
    const value = validation.value;
    let interventionId;
    if (old) {
      if (old.status !== 'scheduled') fail(409, 'La planification ne peut plus être modifiée à ce stade');
      await connection.query(
        `UPDATE service_interventions SET planned_date = ?, planned_time_slot = ?, mission_address = ?, mission_city = ?,
          latitude = ?, longitude = ?, planned_service_id = ?, planned_category_id = ?, mission_contact_name = ?,
          mission_contact_phone = ?, shared_instructions = ?, special_information = ?, scheduled_by_employee_id = ?, scheduled_at = ?
         WHERE id = ?`,
        [value.planned_date, value.planned_time_slot, value.mission_address, value.mission_city, value.latitude,
          value.longitude, value.planned_service_id, value.planned_category_id, value.mission_contact_name,
          value.mission_contact_phone, value.shared_instructions, value.special_information, actor.id, new Date(), old.id]
      );
      interventionId = Number(old.id);
    } else {
      const [insert] = await connection.query(
        `INSERT INTO service_interventions
          (service_request_id, status, planned_date, planned_time_slot, mission_address, mission_city, latitude, longitude,
           planned_service_id, planned_category_id, mission_contact_name, mission_contact_phone, shared_instructions,
           special_information, scheduled_by_employee_id, scheduled_at)
         VALUES (?, 'scheduled', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [requestId, value.planned_date, value.planned_time_slot, value.mission_address, value.mission_city, value.latitude,
          value.longitude, value.planned_service_id, value.planned_category_id, value.mission_contact_name,
          value.mission_contact_phone, value.shared_instructions, value.special_information, actor.id, new Date()]
      );
      interventionId = Number(insert.insertId);
    }
    await connection.query("UPDATE service_requests SET status = 'scheduled' WHERE id = ?", [requestId]);
    await history(connection, interventionId, actor, old ? 'ScheduleUpdated' : 'InterventionScheduled',
      old?.status || 'assigned', 'scheduled', old ? { planned_date: old.planned_date, planned_time_slot: old.planned_time_slot } : null, value);
    if (scheduleHasMeaningfulChange(old, value)) {
      deliveries = await enqueueOperationalNotifications(connection, {
        serviceRequestId: requestId,
        interventionId,
        event: old ? OPERATIONAL_NOTIFICATION_EVENTS.RESCHEDULED : OPERATIONAL_NOTIFICATION_EVENTS.SCHEDULED,
        sourceEvent: old ? 'ScheduleUpdated' : 'InterventionScheduled',
        audiences: ['CLIENT', 'CURRENT_MAALEM'],
        plannedDate: value.planned_date,
        plannedTimeSlot: value.planned_time_slot,
        oldPlannedDate: old?.planned_date,
        oldPlannedTimeSlot: old?.planned_time_slot,
        context: notificationContext(request),
        versionKey: `schedule:${value.planned_date}:${value.planned_time_slot}`,
        createdByEmployeeId: actor.id,
      });
    }
    await connection.commit();
    await dispatchOperationalNotificationsSafely(deliveries);
    res.status(old ? 200 : 201).json({ intervention_id: interventionId, status: 'scheduled', event: old ? 'ScheduleUpdated' : 'InterventionScheduled' });
  } catch (error) {
    await connection.rollback().catch(() => {});
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Une intervention existe déjà pour cette demande' });
    next(error);
  } finally { connection.release(); }
});

adminServiceInterventionsRouter.post('/:id(\\d+)/transition', async (req, res, next) => {
  const connection = await pool.getConnection();
  let deliveries = [];
  try {
    const id = positiveId(req.params.id);
    const nextStatus = String(req.body.status || '');
    if (!id) fail(400, 'Intervention invalide');
    await connection.beginTransaction();
    const actor = { ...(await loadEmployee(connection, req.user.id)), type: 'EMPLOYEE' };
    const intervention = await loadAdminIntervention(connection, id, true);
    if (!intervention) fail(404, 'Intervention introuvable');
    if (!canTransitionIntervention('EMPLOYEE', intervention.status, nextStatus)) fail(409, 'Transition Back-office interdite');
    if (nextStatus === 'closed') {
      const [closureResult] = await connection.query(
        `UPDATE service_interventions
         SET status = 'closed', executing_assignment_id = ?, closed_at = ?,
             closed_by_employee_id = ?, closure_internal_note = ?
         WHERE id = ? AND executing_assignment_id IS NULL`,
        [intervention.current_assignment_id, new Date(), actor.id,
          String(req.body.closure_internal_note || '').trim() || null, id]
      );
      if (closureResult.affectedRows !== 1) fail(409, 'Cette intervention est déjà clôturée');
    } else {
      await connection.query("UPDATE service_interventions SET status = 'to_do' WHERE id = ?", [id]);
    }
    await connection.query('UPDATE service_requests SET status = ? WHERE id = ?', [nextStatus, intervention.service_request_id]);
    await history(connection, id, actor, nextStatus === 'closed' ? 'InterventionClosed' : 'MissionReleased', intervention.status, nextStatus);
    if (nextStatus === 'closed') deliveries = await enqueueOperationalNotifications(connection, {
      serviceRequestId: intervention.service_request_id,
      interventionId: id,
      event: OPERATIONAL_NOTIFICATION_EVENTS.CLOSED,
      audiences: ['CLIENT'],
      context: notificationContext(intervention),
      versionKey: `status:closed`,
      createdByEmployeeId: actor.id,
    });
    await connection.commit();
    await dispatchOperationalNotificationsSafely(deliveries);
    res.json({ intervention_id: id, status: nextStatus, event: nextStatus === 'closed' ? 'InterventionClosed' : 'MissionReleased' });
  } catch (error) { await connection.rollback().catch(() => {}); next(error); }
  finally { connection.release(); }
});

maalemRouter.get('/', async (req, res, next) => {
  try {
    const maalem = await loadMaalem(pool, req.user?.id);
    const [rows] = await pool.query(
      `SELECT si.id, si.service_request_id, sr.request_number,
              COALESCE(sr.qualified_description, sr.problem_description) AS mission_description,
              si.status, si.planned_date, si.planned_time_slot,
              si.mission_city, si.mission_address, si.progress_percent, s.nom AS service_name, mc.nom AS category_name
       FROM service_interventions si
       INNER JOIN service_requests sr ON sr.id = si.service_request_id AND sr.deleted_at IS NULL
       INNER JOIN service_request_assignments sra ON sra.id = sr.current_assignment_id
         AND sra.unassigned_at IS NULL AND sra.maalem_profile_id = ?
       LEFT JOIN services s ON s.id = si.planned_service_id
       LEFT JOIN maalem_categories mc ON mc.id = si.planned_category_id
       WHERE si.status IN ('scheduled', 'to_do', 'en_route', 'arrived', 'work_in_progress', 'completed')
       ORDER BY si.planned_date, si.created_at`, [maalem.id]
    );
    res.json({ missions: rows });
  } catch (error) { next(error); }
});

maalemRouter.get('/:id(\\d+)', async (req, res, next) => {
  try {
    const id = positiveId(req.params.id);
    const maalem = await loadMaalem(pool, req.user?.id);
    const intervention = id ? await loadMaalemIntervention(pool, id, maalem) : null;
    if (!intervention) return res.status(404).json({ message: 'Mission introuvable ou non affectée à ce Maalem' });
    const photos = await listPhotos(pool, id);
    res.json({ mission: intervention, photos });
  } catch (error) { next(error); }
});

maalemRouter.patch('/:id(\\d+)/progress', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const id = positiveId(req.params.id);
    const validation = validateProgress(req.body.progress_percent);
    if (!id || !validation.valid) fail(422, validation.error || 'Intervention invalide');
    await connection.beginTransaction();
    const actor = { ...(await loadMaalem(connection, req.user?.id)), type: 'MAALEM' };
    const mission = await loadMaalemIntervention(connection, id, actor, true);
    if (!mission) fail(404, 'Mission introuvable ou réaffectée');
    if (!['to_do', 'en_route', 'arrived', 'work_in_progress'].includes(mission.status)) fail(409, 'Progression non modifiable à ce stade');
    await connection.query('UPDATE service_interventions SET progress_percent = ? WHERE id = ?', [validation.value, id]);
    await history(connection, id, actor, 'ProgressUpdated', mission.status, mission.status,
      { progress_percent: Number(mission.progress_percent) }, { progress_percent: validation.value });
    await connection.commit();
    res.json({ intervention_id: id, status: mission.status, progress_percent: validation.value });
  } catch (error) { await connection.rollback().catch(() => {}); next(error); }
  finally { connection.release(); }
});

maalemRouter.patch('/:id(\\d+)/report', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const id = positiveId(req.params.id);
    const validation = validateCompletionReport(req.body);
    if (!id || !validation.valid) fail(422, 'Compte-rendu invalide', validation.errors);
    await connection.beginTransaction();
    const actor = { ...(await loadMaalem(connection, req.user?.id)), type: 'MAALEM' };
    const mission = await loadMaalemIntervention(connection, id, actor, true);
    if (!mission) fail(404, 'Mission introuvable ou réaffectée');
    if (mission.status !== 'work_in_progress') fail(409, 'Le compte-rendu est modifiable pendant les travaux');
    const value = validation.value;
    await connection.query(
      `UPDATE service_interventions SET work_summary = ?, maalem_observations = ?, progress_percent = ?,
        work_finished = ?, additional_intervention_required = ?, incomplete_reason = ? WHERE id = ?`,
      [value.work_summary, value.maalem_observations, value.progress_percent, value.work_finished ? 1 : 0,
        value.additional_intervention_required ? 1 : 0, value.incomplete_reason, id]
    );
    await history(connection, id, actor, 'ReportUpdated', mission.status, mission.status, null, value);
    await connection.commit();
    res.json({ intervention_id: id, status: mission.status, report: value });
  } catch (error) { await connection.rollback().catch(() => {}); next(error); }
  finally { connection.release(); }
});

maalemRouter.post('/:id(\\d+)/transition', async (req, res, next) => {
  const connection = await pool.getConnection();
  let deliveries = [];
  try {
    const id = positiveId(req.params.id);
    const nextStatus = String(req.body.status || '');
    if (!id) fail(400, 'Intervention invalide');
    await connection.beginTransaction();
    const actor = { ...(await loadMaalem(connection, req.user?.id)), type: 'MAALEM' };
    const mission = await loadMaalemIntervention(connection, id, actor, true);
    if (!mission) fail(404, 'Mission introuvable ou réaffectée');
    if (!canTransitionIntervention('MAALEM', mission.status, nextStatus)) fail(409, 'Transition Maalem interdite');
    if (nextStatus === 'completed') {
      const report = validateCompletionReport(mission);
      if (!report.valid) fail(422, 'Le compte-rendu complet est obligatoire avant de terminer', report.errors);
    }
    const timestampColumns = {
      en_route: ['en_route_at', 'en_route_by_contact_id'], arrived: ['arrived_at', 'arrived_by_contact_id'],
      work_in_progress: ['started_at', 'started_by_contact_id'], completed: ['completed_at', 'completed_by_contact_id'],
    };
    const [dateColumn, actorColumn] = timestampColumns[nextStatus];
    await connection.query(
      `UPDATE service_interventions SET status = ?, ${dateColumn} = ?, ${actorColumn} = ? WHERE id = ?`,
      [nextStatus, new Date(), actor.contactId, id]
    );
    await connection.query('UPDATE service_requests SET status = ? WHERE id = ?', [nextStatus, mission.service_request_id]);
    const event = { en_route: 'MaalemEnRoute', arrived: 'MaalemArrived', work_in_progress: 'WorkStarted', completed: 'WorkCompleted' }[nextStatus];
    await history(connection, id, actor, event, mission.status, nextStatus);
    if (nextStatus === 'completed') {
      const audiences = ['BACKOFFICE_TEAM'];
      if (shouldNotifyOperationalPolicy('SERVICE_NOTIFY_CLIENT_COMPLETED')) audiences.push('CLIENT');
      deliveries = await enqueueOperationalNotifications(connection, {
        serviceRequestId: mission.service_request_id,
        interventionId: id,
        event: OPERATIONAL_NOTIFICATION_EVENTS.COMPLETED,
        sourceEvent: event,
        audiences,
        context: notificationContext(mission, actor),
        versionKey: 'status:completed',
      });
    } else if (notifiableInterventionStatuses().includes(nextStatus)) {
      deliveries = await enqueueOperationalNotifications(connection, {
        serviceRequestId: mission.service_request_id,
        interventionId: id,
        event: OPERATIONAL_NOTIFICATION_EVENTS.STATUS_CHANGED,
        sourceEvent: event,
        audiences: ['CLIENT'],
        context: notificationContext(mission, actor),
        publicStatus: nextStatus,
        versionKey: `status:${nextStatus}`,
      });
    }
    await connection.commit();
    await dispatchOperationalNotificationsSafely(deliveries);
    res.json({ intervention_id: id, status: nextStatus, event });
  } catch (error) { await connection.rollback().catch(() => {}); next(error); }
  finally { connection.release(); }
});

maalemRouter.post('/:id(\\d+)/photos', handlePhotos, async (req, res, next) => {
  const connection = await pool.getConnection();
  const written = [];
  try {
    const id = positiveId(req.params.id);
    const phase = String(req.body.phase || '').toUpperCase();
    if (!id || !['BEFORE', 'DURING', 'AFTER'].includes(phase) || !req.files?.length) fail(422, 'Phase et photos obligatoires');
    const detected = req.files.map((file) => ({ file, kind: detectBufferKind(file.buffer) }));
    if (detected.some(({ kind }) => !PHOTO_TYPES[kind])) fail(422, 'Formats autorisés : JPG, PNG et WEBP');
    await connection.beginTransaction();
    const actor = { ...(await loadMaalem(connection, req.user?.id)), type: 'MAALEM' };
    const mission = await loadMaalemIntervention(connection, id, actor, true);
    if (!mission) fail(404, 'Mission introuvable ou réaffectée');
    if (!['to_do', 'en_route', 'arrived', 'work_in_progress', 'completed'].includes(mission.status)) fail(409, 'Ajout de photo interdit à ce stade');
    const directory = path.join(photoRoot, String(id));
    await fs.mkdir(directory, { recursive: true });
    const ids = [];
    for (const item of detected) {
      const [extension, mimeType] = PHOTO_TYPES[item.kind];
      const storageKey = `${id}/${crypto.randomUUID()}${extension}`;
      const absolutePath = path.resolve(photoRoot, storageKey);
      if (!absolutePath.startsWith(`${photoRoot}${path.sep}`)) fail(500, 'Chemin de stockage invalide');
      await fs.writeFile(absolutePath, item.file.buffer, { flag: 'wx' });
      written.push(absolutePath);
      const [insert] = await connection.query(
        `INSERT INTO service_intervention_photos
          (intervention_id, assignment_id, phase, storage_key, original_name, mime_type, file_size, uploaded_by_contact_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, mission.current_assignment_id, phase, storageKey, path.basename(item.file.originalname || `photo${extension}`),
          mimeType, item.file.size, actor.contactId]
      );
      ids.push(Number(insert.insertId));
    }
    await history(connection, id, actor, 'PhotosAdded', mission.status, mission.status, null, { phase, photo_ids: ids });
    await connection.commit();
    res.status(201).json({ photo_ids: ids, phase });
  } catch (error) {
    await connection.rollback().catch(() => {});
    await Promise.all(written.map((file) => fs.unlink(file).catch(() => {})));
    next(error);
  } finally { connection.release(); }
});

async function sendPhoto(req, res, next, admin) {
  try {
    const interventionId = positiveId(req.params.id);
    const photoId = positiveId(req.params.photoId);
    if (!interventionId || !photoId) return res.status(400).json({ message: 'Photo invalide' });
    if (!admin) {
      const maalem = await loadMaalem(pool, req.user?.id);
      if (!await loadMaalemIntervention(pool, interventionId, maalem)) return res.status(404).json({ message: 'Photo introuvable' });
    }
    const [rows] = await pool.query(
      `SELECT storage_key, original_name, mime_type FROM service_intervention_photos
       WHERE id = ? AND intervention_id = ? AND deleted_at IS NULL LIMIT 1`, [photoId, interventionId]
    );
    const photo = rows[0];
    if (!photo) return res.status(404).json({ message: 'Photo introuvable' });
    const absolutePath = path.resolve(photoRoot, photo.storage_key);
    if (!absolutePath.startsWith(`${photoRoot}${path.sep}`)) return res.status(404).json({ message: 'Photo introuvable' });
    res.type(photo.mime_type).set('Content-Disposition', `inline; filename="${path.basename(photo.original_name).replace(/["\\]/g, '_')}"`);
    return res.sendFile(absolutePath);
  } catch (error) { return next(error); }
}

maalemRouter.get('/:id(\\d+)/photos/:photoId(\\d+)', (req, res, next) => sendPhoto(req, res, next, false));
adminServiceInterventionsRouter.get('/:id(\\d+)/photos/:photoId(\\d+)', (req, res, next) => sendPhoto(req, res, next, true));

export default maalemRouter;
