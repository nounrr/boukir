import { Router } from 'express';
import pool from '../db/pool.js';
import { requireRoles } from '../middleware/auth.js';
import {
  ASSIGNMENT_EVENTS,
  validateAssignmentCommand,
  validateUnassignmentCommand,
} from '../utils/serviceRequestAssignment.js';
import {
  dispatchOperationalNotificationsSafely,
  enqueueOperationalNotifications,
  shouldNotifyOperationalPolicy,
} from '../utils/operationalNotification.js';

const router = Router();
router.use(requireRoles('PDG', 'Manager', 'ManagerPlus'));

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

async function loadActor(connection, employeeId) {
  const [rows] = await connection.query(
    `SELECT id, nom_complet FROM employees
     WHERE id = ? AND deleted_at IS NULL
       AND role IN ('PDG', 'Manager', 'ManagerPlus') LIMIT 1`,
    [employeeId]
  );
  if (!rows[0]) fail(403, 'Utilisateur Back-office non autorisé');
  return { id: Number(rows[0].id), name: rows[0].nom_complet || `Employé #${rows[0].id}` };
}

async function loadRequestForUpdate(connection, requestId) {
  const [rows] = await connection.query(
    `SELECT sr.id, sr.request_number, sr.requester_contact_id, sr.title, sr.status, sr.service_id,
            sr.qualified_service_id, sr.qualified_category_id,
            sr.requested_maalem_profile_id, sr.current_assignment_id,
            requester.telephone AS client_phone, requester.locale AS client_locale,
            COALESCE(qualified_service.nom, initial_service.nom, category.nom, sr.title) AS service_name,
            COALESCE(qualified_service.nom_ar, initial_service.nom_ar, category.nom_ar, sr.title) AS service_name_ar
     FROM service_requests sr
     INNER JOIN contacts requester ON requester.id = sr.requester_contact_id
     LEFT JOIN services initial_service ON initial_service.id = sr.service_id
     LEFT JOIN services qualified_service ON qualified_service.id = sr.qualified_service_id
     LEFT JOIN maalem_categories category ON category.id = sr.qualified_category_id
     WHERE sr.id = ? AND sr.deleted_at IS NULL LIMIT 1 FOR UPDATE`,
    [requestId]
  );
  return rows[0] || null;
}

async function loadCurrentAssignmentForUpdate(connection, requestId) {
  const [rows] = await connection.query(
    `SELECT id, service_request_id, maalem_profile_id, assigned_by_employee_id,
            assigned_at, assignment_reason, compatibility_override,
            compatibility_override_reason
     FROM service_request_assignments
     WHERE service_request_id = ? AND unassigned_at IS NULL
     LIMIT 1 FOR UPDATE`,
    [requestId]
  );
  return rows[0] || null;
}

async function loadMaalemForUpdate(connection, profileId, serviceId) {
  const [rows] = await connection.query(
    `SELECT mp.id, mp.contact_id, mp.category_id, mp.status, mp.deleted_at,
            c.nom_complet, c.telephone, c.locale, c.is_active AS contact_is_active,
            c.is_blocked AS contact_is_blocked, c.deleted_at AS contact_deleted_at,
            CASE WHEN ? IS NULL THEN 0 ELSE EXISTS (
              SELECT 1 FROM service_maalem_categories smc
              WHERE smc.service_id = ? AND smc.category_id = mp.category_id
            ) END AS service_compatible
     FROM maalem_profiles mp
     INNER JOIN contacts c ON c.id = mp.contact_id
     WHERE mp.id = ? LIMIT 1 FOR UPDATE`,
    [serviceId, serviceId, profileId]
  );
  const profile = rows[0] || null;
  if (profile?.contact_deleted_at) profile.deleted_at = profile.contact_deleted_at;
  return profile;
}

async function writeEvent(connection, requestId, actor, eventType, oldStatus, newStatus, oldValue, newValue, metadata) {
  await connection.query(
    `INSERT INTO service_request_history
       (request_id, event_type, old_status, new_status, old_value, new_value, metadata,
        actor_type, actor_employee_id, actor_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'EMPLOYEE', ?, ?)`,
    [requestId, eventType, oldStatus, newStatus,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      metadata ? JSON.stringify(metadata) : null,
      actor.id, actor.name]
  );
}

function assertCurrentReference(request, currentAssignment) {
  const referenceId = request.current_assignment_id == null ? null : Number(request.current_assignment_id);
  const activeId = currentAssignment ? Number(currentAssignment.id) : null;
  if (referenceId !== activeId) fail(409, 'Référence d’affectation courante incohérente');
}

router.get('/:id(\\d+)/assignment-candidates', async (req, res, next) => {
  try {
    const requestId = positiveId(req.params.id);
    if (!requestId) return res.status(400).json({ message: 'Identifiant de demande invalide' });
    const q = String(req.query.q || '').trim();
    const city = String(req.query.city || '').trim();
    const categoryId = positiveId(req.query.category_id);
    const compatibleOnly = req.query.compatible_only !== 'false';
    if (q.length > 100 || city.length > 100) return res.status(422).json({ message: 'Filtre trop long' });

    const [requests] = await pool.query(
      `SELECT id, status, service_id, qualified_service_id, qualified_category_id
       FROM service_requests WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [requestId]
    );
    const request = requests[0];
    if (!request) return res.status(404).json({ message: 'Demande introuvable' });
    if (!['confirmed', 'assigned', 'scheduled', 'to_do', 'en_route', 'arrived', 'work_in_progress'].includes(request.status)) {
      return res.status(409).json({ message: 'La demande doit être confirmée avant la recherche' });
    }
    const serviceId = Number(request.qualified_service_id || request.service_id) || null;
    const qualifiedCategoryId = Number(request.qualified_category_id) || null;
    const conditions = [
      "mp.status = 'approved'", 'mp.deleted_at IS NULL', 'c.deleted_at IS NULL',
      'COALESCE(c.is_active, 1) = 1', 'COALESCE(c.is_blocked, 0) = 0',
    ];
    const filterParams = [];
    if (q) { conditions.push('c.nom_complet LIKE ?'); filterParams.push(`%${q}%`); }
    if (city) {
      conditions.push(`(JSON_UNQUOTE(JSON_EXTRACT(mp.professional_data, '$.city')) LIKE ? OR c.shipping_city LIKE ?
        OR JSON_SEARCH(JSON_EXTRACT(mp.professional_data, '$.intervention_areas'), 'one', ?) IS NOT NULL)`);
      filterParams.push(`%${city}%`, `%${city}%`, `%${city}%`);
    }
    if (categoryId) { conditions.push('mp.category_id = ?'); filterParams.push(categoryId); }
    const compatibilitySql = `CASE
      WHEN ? IS NOT NULL THEN mp.category_id = ?
      WHEN ? IS NOT NULL THEN EXISTS (
        SELECT 1 FROM service_maalem_categories smc
        WHERE smc.service_id = ? AND smc.category_id = mp.category_id
      ) ELSE 0 END`;
    if (compatibleOnly) {
      conditions.push(`(${compatibilitySql}) = 1`);
      filterParams.push(qualifiedCategoryId, qualifiedCategoryId, serviceId, serviceId);
    }

    const [rows] = await pool.query(
      `SELECT mp.id, mp.category_id, c.nom_complet AS name, c.telephone,
              mc.nom AS category_name,
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(mp.professional_data, '$.city')), c.shipping_city) AS city,
              JSON_EXTRACT(mp.professional_data, '$.intervention_areas') AS intervention_areas,
              JSON_UNQUOTE(JSON_EXTRACT(mp.professional_data, '$.availability')) AS declared_availability,
              (${compatibilitySql}) AS compatible,
              (SELECT COUNT(*) FROM service_request_assignments sra
               WHERE sra.maalem_profile_id = mp.id AND sra.unassigned_at IS NULL) AS active_missions
       FROM maalem_profiles mp
       INNER JOIN contacts c ON c.id = mp.contact_id
       LEFT JOIN maalem_categories mc ON mc.id = mp.category_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY compatible DESC, active_missions ASC, c.nom_complet ASC
       LIMIT 100`,
      [qualifiedCategoryId, qualifiedCategoryId, serviceId, serviceId, ...filterParams]
    );
    res.json({
      candidates: rows.map((row) => ({
        ...row, id: Number(row.id), category_id: Number(row.category_id),
        compatible: Boolean(Number(row.compatible)), active_missions: Number(row.active_missions),
      })),
      availability_notice: 'La disponibilité affichée est déclarative et ne constitue pas une garantie de calendrier.',
    });
  } catch (error) { next(error); }
});

router.post('/:id(\\d+)/assign', async (req, res, next) => {
  const connection = await pool.getConnection();
  let deliveries = [];
  try {
    const requestId = positiveId(req.params.id);
    const profileId = positiveId(req.body.maalem_profile_id);
    if (!requestId || !profileId) fail(422, 'Demande ou Maalem invalide');
    if (!Object.prototype.hasOwnProperty.call(req.body, 'expected_current_assignment_id')) {
      fail(422, 'La version courante de l’affectation est requise');
    }
    await connection.beginTransaction();
    const actor = await loadActor(connection, req.user.id);
    const request = await loadRequestForUpdate(connection, requestId);
    if (!request) fail(404, 'Demande introuvable');
    const currentAssignment = await loadCurrentAssignmentForUpdate(connection, requestId);
    assertCurrentReference(request, currentAssignment);
    const expectedId = req.body.expected_current_assignment_id == null
      ? null : positiveId(req.body.expected_current_assignment_id);
    const actualId = currentAssignment ? Number(currentAssignment.id) : null;
    if (expectedId !== actualId) fail(409, 'L’affectation a été modifiée par un autre membre de l’équipe');
    const serviceId = Number(request.qualified_service_id || request.service_id) || null;
    const profile = await loadMaalemForUpdate(connection, profileId, serviceId);
    const previousMaalem = currentAssignment
      ? await loadMaalemForUpdate(connection, currentAssignment.maalem_profile_id, serviceId)
      : null;
    const validation = validateAssignmentCommand({
      request,
      maalemProfile: profile,
      currentAssignment,
      reason: req.body.reason,
      allowOverride: req.body.compatibility_override === true,
      overrideReason: req.body.compatibility_override_reason,
      allowStartedReassignment: req.body.started_reassignment === true,
    });
    if (!validation.valid) fail(422, 'Affectation invalide', validation.errors);

    const now = new Date();
    if (currentAssignment) {
      const [closed] = await connection.query(
        `UPDATE service_request_assignments
         SET unassigned_at = ?, unassigned_by_employee_id = ?, unassignment_reason = ?
         WHERE id = ? AND unassigned_at IS NULL`,
        [now, actor.id, validation.reason, currentAssignment.id]
      );
      if (Number(closed.affectedRows) !== 1) fail(409, 'L’affectation courante a déjà changé');
    }
    const [insert] = await connection.query(
      `INSERT INTO service_request_assignments
         (service_request_id, maalem_profile_id, assigned_by_employee_id, assigned_at,
          assignment_reason, compatibility_override, compatibility_override_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [requestId, profileId, actor.id, now, validation.reason,
        validation.compatibility.compatible ? 0 : 1,
        validation.compatibility.compatible ? null : validation.overrideReason]
    );
    const assignmentId = Number(insert.insertId);
    const nextStatus = currentAssignment ? request.status : 'assigned';
    const [updated] = nextStatus === 'assigned'
      ? await connection.query(
        `UPDATE service_requests SET current_assignment_id = ?, status = 'assigned' WHERE id = ?`,
        [assignmentId, requestId]
      )
      : await connection.query(
        `UPDATE service_requests SET current_assignment_id = ?, status = ? WHERE id = ?`,
        [assignmentId, nextStatus, requestId]
      );
    if (Number(updated.affectedRows) !== 1) fail(409, 'La demande a changé pendant l’affectation');
    const eventType = currentAssignment ? ASSIGNMENT_EVENTS.REASSIGNED : ASSIGNMENT_EVENTS.ASSIGNED;
    await writeEvent(connection, requestId, actor, eventType, request.status, nextStatus,
      currentAssignment ? { assignment_id: Number(currentAssignment.id), maalem_profile_id: Number(currentAssignment.maalem_profile_id) } : null,
      { assignment_id: assignmentId, maalem_profile_id: profileId },
      { reason: validation.reason, started_reassignment: validation.startedReassignment,
        compatibility_override: !validation.compatibility.compatible,
        compatibility_override_reason: validation.compatibility.compatible ? null : validation.overrideReason });
    if (validation.startedReassignment) {
      const [interventions] = await connection.query(
        'SELECT id FROM service_interventions WHERE service_request_id = ? LIMIT 1 FOR UPDATE', [requestId]
      );
      if (interventions[0]) {
        await connection.query(
          `INSERT INTO service_intervention_history
            (intervention_id, event_type, old_status, new_status, old_value, new_value, metadata,
             actor_type, actor_employee_id, actor_name)
           VALUES (?, 'MaalemReassignedAfterStart', ?, ?, ?, ?, ?, 'EMPLOYEE', ?, ?)`,
          [interventions[0].id, request.status, request.status,
            JSON.stringify({ assignment_id: Number(currentAssignment.id), maalem_profile_id: Number(currentAssignment.maalem_profile_id) }),
            JSON.stringify({ assignment_id: assignmentId, maalem_profile_id: profileId }),
            JSON.stringify({ reason: validation.reason }), actor.id, actor.name]
        );
      }
    }
    const audiences = currentAssignment ? ['PREVIOUS_MAALEM', 'CURRENT_MAALEM'] : ['CURRENT_MAALEM'];
    if (shouldNotifyOperationalPolicy('SERVICE_NOTIFY_CLIENT_ASSIGNMENT')) audiences.push('CLIENT');
    deliveries = await enqueueOperationalNotifications(connection, {
      serviceRequestId: requestId,
      event: eventType,
      audiences,
      previousMaalemProfileId: currentAssignment?.maalem_profile_id,
      previousMaalem: previousMaalem ? {
        profile_id: previousMaalem.id,
        contact_id: previousMaalem.contact_id,
        telephone: previousMaalem.telephone,
        locale: previousMaalem.locale,
      } : null,
      context: {
        id: requestId,
        request_number: request.request_number,
        requester_contact_id: request.requester_contact_id,
        client_phone: request.client_phone,
        client_locale: request.client_locale,
        service_name: request.service_name || request.title,
        service_name_ar: request.service_name_ar || request.service_name || request.title,
        current_maalem_profile_id: profile.id,
        current_maalem_contact_id: profile.contact_id,
        current_maalem_phone: profile.telephone,
        current_maalem_locale: profile.locale,
      },
      versionKey: `assignment:${assignmentId}`,
      createdByEmployeeId: actor.id,
    });
    await connection.commit();
    await dispatchOperationalNotificationsSafely(deliveries);
    res.status(currentAssignment ? 200 : 201).json({
      assignment_id: assignmentId,
      status: nextStatus,
      event: eventType,
      requested_maalem_profile_id: request.requested_maalem_profile_id == null ? null : Number(request.requested_maalem_profile_id),
      assigned_maalem_profile_id: profileId,
    });
  } catch (error) {
    await connection.rollback().catch(() => {});
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Une affectation courante existe déjà' });
    next(error);
  } finally { connection.release(); }
});

router.post('/:id(\\d+)/unassign', async (req, res, next) => {
  const connection = await pool.getConnection();
  let deliveries = [];
  try {
    const requestId = positiveId(req.params.id);
    if (!requestId) fail(422, 'Demande invalide');
    const expectedId = positiveId(req.body.expected_current_assignment_id);
    if (!expectedId) fail(422, 'La version courante de l’affectation est requise');
    await connection.beginTransaction();
    const actor = await loadActor(connection, req.user.id);
    const request = await loadRequestForUpdate(connection, requestId);
    if (!request) fail(404, 'Demande introuvable');
    const currentAssignment = await loadCurrentAssignmentForUpdate(connection, requestId);
    assertCurrentReference(request, currentAssignment);
    if (Number(currentAssignment?.id) !== expectedId) fail(409, 'L’affectation a été modifiée par un autre membre de l’équipe');
    const validation = validateUnassignmentCommand({ request, currentAssignment, reason: req.body.reason });
    if (!validation.valid) fail(422, 'Désaffectation invalide', validation.errors);
    const serviceId = Number(request.qualified_service_id || request.service_id) || null;
    const previousMaalem = await loadMaalemForUpdate(connection, currentAssignment.maalem_profile_id, serviceId);
    const now = new Date();
    const [closed] = await connection.query(
      `UPDATE service_request_assignments
       SET unassigned_at = ?, unassigned_by_employee_id = ?, unassignment_reason = ?
       WHERE id = ? AND unassigned_at IS NULL`,
      [now, actor.id, validation.reason, currentAssignment.id]
    );
    if (Number(closed.affectedRows) !== 1) fail(409, 'L’affectation courante a déjà changé');
    await connection.query(
      `UPDATE service_requests SET current_assignment_id = NULL, status = 'confirmed' WHERE id = ?`,
      [requestId]
    );
    await writeEvent(connection, requestId, actor, ASSIGNMENT_EVENTS.UNASSIGNED, 'assigned', 'confirmed',
      { assignment_id: Number(currentAssignment.id), maalem_profile_id: Number(currentAssignment.maalem_profile_id) },
      null, { reason: validation.reason });
    deliveries = await enqueueOperationalNotifications(connection, {
      serviceRequestId: requestId,
      event: ASSIGNMENT_EVENTS.UNASSIGNED,
      audiences: ['PREVIOUS_MAALEM'],
      previousMaalemProfileId: currentAssignment.maalem_profile_id,
      previousMaalem: previousMaalem ? {
        profile_id: previousMaalem.id,
        contact_id: previousMaalem.contact_id,
        telephone: previousMaalem.telephone,
        locale: previousMaalem.locale,
      } : null,
      context: {
        id: requestId,
        request_number: request.request_number,
        requester_contact_id: request.requester_contact_id,
        client_phone: request.client_phone,
        client_locale: request.client_locale,
        service_name: request.service_name || request.title,
        service_name_ar: request.service_name_ar || request.service_name || request.title,
      },
      versionKey: `unassignment:${currentAssignment.id}`,
      createdByEmployeeId: actor.id,
    });
    await connection.commit();
    await dispatchOperationalNotificationsSafely(deliveries);
    res.json({ status: 'confirmed', event: ASSIGNMENT_EVENTS.UNASSIGNED });
  } catch (error) {
    await connection.rollback().catch(() => {});
    next(error);
  } finally { connection.release(); }
});

export default router;
