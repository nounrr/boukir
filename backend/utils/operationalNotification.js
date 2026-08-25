import {
  dispatchNotificationDelivery,
  dispatchQueuedNotificationDeliveries,
  enqueueNotificationDeliveries,
  parseNotificationPayload,
  sanitizeNotificationError,
} from './notificationDelivery.js';

export const OPERATIONAL_NOTIFICATION_EVENTS = Object.freeze({
  CREATED: 'ServiceRequestCreated',
  CONFIRMED: 'ServiceRequestConfirmed',
  CANCELLED: 'ServiceRequestCancelled',
  ASSIGNED: 'MaalemAssigned',
  REASSIGNED: 'MaalemReassigned',
  UNASSIGNED: 'MaalemUnassigned',
  SCHEDULED: 'InterventionScheduled',
  RESCHEDULED: 'InterventionRescheduled',
  STATUS_CHANGED: 'InterventionStatusChanged',
  COMPLETED: 'InterventionCompleted',
  CLOSED: 'InterventionClosed',
  REVIEW_INVITATION: 'MaalemReviewInvitation',
  REVIEW_REMINDER: 'MaalemReviewReminder',
});

const TEMPLATE_KEY_BY_EVENT = Object.freeze(Object.fromEntries(
  Object.values(OPERATIONAL_NOTIFICATION_EVENTS).map((event) => [event, `service.operation.${event}`])
));

export const DEFAULT_NOTIFIABLE_INTERVENTION_STATUSES = Object.freeze(['en_route', 'arrived']);

export function notifiableInterventionStatuses(env = process.env) {
  const configured = String(env.SERVICE_NOTIFIABLE_INTERVENTION_STATUSES || '').trim();
  const allowed = new Set(['en_route', 'arrived', 'work_in_progress']);
  if (!configured) return [...DEFAULT_NOTIFIABLE_INTERVENTION_STATUSES];
  return [...new Set(configured.split(',').map((item) => item.trim()).filter((item) => allowed.has(item)))];
}

export function shouldNotifyOperationalPolicy(name, env = process.env) {
  return String(env[name] || '').toLowerCase() === 'true';
}

function clean(value, max = 1000) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function ecomBase() {
  return String(process.env.ECOMMERCE_FRONTEND_URL || 'http://localhost:3002').trim().replace(/\/+$/, '');
}

function publicStatus(locale, status) {
  const values = {
    fr: { en_route: 'en route', arrived: 'arrivé sur place', work_in_progress: 'intervention commencée' },
    ar: { en_route: 'في الطريق', arrived: 'وصل إلى المكان', work_in_progress: 'بدأ التدخل' },
  };
  return values[locale]?.[status] || status;
}

export function renderOperationalNotification({ event, locale, payload = {} }) {
  const language = String(locale || '').toLowerCase().startsWith('ar') ? 'ar' : 'fr';
  const requestNumber = clean(payload.request_number, 80) || 'SRV';
  const serviceName = clean(payload.service_name, 255) || (language === 'ar' ? 'الخدمة المطلوبة' : 'service demandé');
  const publicReason = clean(payload.public_reason);
  const plannedDate = clean(payload.planned_date, 30);
  const plannedTimeSlot = clean(payload.planned_time_slot, 100);
  const oldDate = clean(payload.old_planned_date, 30);
  const oldSlot = clean(payload.old_planned_time_slot, 100);
  const link = clean(payload.detail_url, 1000);
  const removed = payload.assignment_action === 'removed';
  const maalemName = clean(payload.maalem_name, 255) || (language === 'ar' ? 'المعلم' : 'votre Maalem');

  const fr = {
    [OPERATIONAL_NOTIFICATION_EVENTS.CREATED]: ['Demande de service reçue', [`Votre demande ${requestNumber} a bien été reçue.`, `Type : ${serviceName}.`, 'Notre équipe prendra contact avec vous.']],
    [OPERATIONAL_NOTIFICATION_EVENTS.CONFIRMED]: ['Demande confirmée', [`Votre demande ${requestNumber} est confirmée administrativement.`, 'Notre équipe va maintenant organiser son affectation et sa planification.', link]],
    [OPERATIONAL_NOTIFICATION_EVENTS.CANCELLED]: ['Demande annulée', [`Votre demande ${requestNumber} a été annulée.`, publicReason ? `Motif communiqué : ${publicReason}` : null, link]],
    [OPERATIONAL_NOTIFICATION_EVENTS.ASSIGNED]: ['Nouvelle mission Maalem', [`La mission ${requestNumber} vous a été affectée.`, `Service : ${serviceName}.`, 'Consultez votre espace professionnel pour les informations nécessaires.', link]],
    [OPERATIONAL_NOTIFICATION_EVENTS.REASSIGNED]: removed
      ? ['Mission retirée', [`La mission ${requestNumber} ne vous est plus affectée.`, 'Vous ne recevrez plus ses notifications opérationnelles.']]
      : ['Nouvelle mission Maalem', [`La mission ${requestNumber} vous est désormais affectée.`, `Service : ${serviceName}.`, link]],
    [OPERATIONAL_NOTIFICATION_EVENTS.UNASSIGNED]: ['Mission retirée', [`La mission ${requestNumber} ne vous est plus affectée.`, 'Vous ne recevrez plus ses notifications opérationnelles.']],
    [OPERATIONAL_NOTIFICATION_EVENTS.SCHEDULED]: ['Intervention planifiée', [`L’intervention ${requestNumber} est planifiée.`, plannedDate ? `Date : ${plannedDate}.` : null, plannedTimeSlot ? `Créneau : ${plannedTimeSlot}.` : null, link]],
    [OPERATIONAL_NOTIFICATION_EVENTS.RESCHEDULED]: ['Intervention replanifiée', [`La planification de ${requestNumber} a changé.`, oldDate || oldSlot ? `Ancien créneau : ${[oldDate, oldSlot].filter(Boolean).join(' — ')}.` : null, `Nouveau créneau : ${[plannedDate, plannedTimeSlot].filter(Boolean).join(' — ')}.`, link]],
    [OPERATIONAL_NOTIFICATION_EVENTS.STATUS_CHANGED]: ['Avancement de l’intervention', [`Pour ${requestNumber}, le Maalem est ${publicStatus('fr', payload.public_status)}.`, link]],
    [OPERATIONAL_NOTIFICATION_EVENTS.COMPLETED]: ['Intervention déclarée terminée', [`L’intervention ${requestNumber} a été déclarée terminée par le Maalem.`, 'Elle attend encore la vérification et la clôture Back-office.']],
    [OPERATIONAL_NOTIFICATION_EVENTS.CLOSED]: ['Intervention clôturée', [`L’intervention ${requestNumber} est clôturée.`, 'Vous pouvez consulter le détail de votre demande.', link]],
    [OPERATIONAL_NOTIFICATION_EVENTS.REVIEW_INVITATION]: ['Comment s’est passée votre intervention ?', [`Votre intervention avec ${maalemName} est terminée. Partagez votre expérience pour aider les autres clients et améliorer la qualité de nos Services.`, `Demande : ${requestNumber}.`]],
    [OPERATIONAL_NOTIFICATION_EVENTS.REVIEW_REMINDER]: ['Votre avis compte', [`Vous n’avez pas encore évalué votre intervention avec ${maalemName}. Partagez votre expérience tant que votre invitation est disponible.`, `Demande : ${requestNumber}.`]],
  };
  const ar = {
    [OPERATIONAL_NOTIFICATION_EVENTS.CREATED]: ['تم استلام طلب الخدمة', [`تم استلام طلبكم ${requestNumber}.`, `نوع الخدمة: ${serviceName}.`, 'سيتواصل معكم فريقنا.']],
    [OPERATIONAL_NOTIFICATION_EVENTS.CONFIRMED]: ['تم تأكيد الطلب', [`تم تأكيد طلبكم ${requestNumber} إدارياً.`, 'سيقوم فريقنا الآن بتنظيم الإسناد والموعد.', link]],
    [OPERATIONAL_NOTIFICATION_EVENTS.CANCELLED]: ['تم إلغاء الطلب', [`تم إلغاء طلبكم ${requestNumber}.`, publicReason ? `السبب المعلن: ${publicReason}` : null, link]],
    [OPERATIONAL_NOTIFICATION_EVENTS.ASSIGNED]: ['مهمة جديدة للمعلم', [`تم إسناد المهمة ${requestNumber} إليكم.`, `الخدمة: ${serviceName}.`, 'راجعوا فضاءكم المهني للمعلومات الضرورية.', link]],
    [OPERATIONAL_NOTIFICATION_EVENTS.REASSIGNED]: removed
      ? ['تم سحب المهمة', [`لم تعد المهمة ${requestNumber} مسندة إليكم.`, 'لن تتلقوا إشعارات تشغيلية أخرى عنها.']]
      : ['مهمة جديدة للمعلم', [`أصبحت المهمة ${requestNumber} مسندة إليكم.`, `الخدمة: ${serviceName}.`, link]],
    [OPERATIONAL_NOTIFICATION_EVENTS.UNASSIGNED]: ['تم سحب المهمة', [`لم تعد المهمة ${requestNumber} مسندة إليكم.`, 'لن تتلقوا إشعارات تشغيلية أخرى عنها.']],
    [OPERATIONAL_NOTIFICATION_EVENTS.SCHEDULED]: ['تم تحديد موعد التدخل', [`تم تحديد موعد التدخل ${requestNumber}.`, plannedDate ? `التاريخ: ${plannedDate}.` : null, plannedTimeSlot ? `الفترة: ${plannedTimeSlot}.` : null, link]],
    [OPERATIONAL_NOTIFICATION_EVENTS.RESCHEDULED]: ['تم تغيير موعد التدخل', [`تم تغيير موعد ${requestNumber}.`, oldDate || oldSlot ? `الموعد السابق: ${[oldDate, oldSlot].filter(Boolean).join(' — ')}.` : null, `الموعد الجديد: ${[plannedDate, plannedTimeSlot].filter(Boolean).join(' — ')}.`, link]],
    [OPERATIONAL_NOTIFICATION_EVENTS.STATUS_CHANGED]: ['تقدم التدخل', [`بالنسبة للطلب ${requestNumber}، حالة المعلم: ${publicStatus('ar', payload.public_status)}.`, link]],
    [OPERATIONAL_NOTIFICATION_EVENTS.COMPLETED]: ['تم التصريح بانتهاء التدخل', [`صرّح المعلم بانتهاء التدخل ${requestNumber}.`, 'ينتظر التدخل التحقق والإغلاق من طرف الإدارة.']],
    [OPERATIONAL_NOTIFICATION_EVENTS.CLOSED]: ['تم إغلاق التدخل', [`تم إغلاق التدخل ${requestNumber}.`, 'يمكنكم الاطلاع على تفاصيل الطلب.', link]],
    [OPERATIONAL_NOTIFICATION_EVENTS.REVIEW_INVITATION]: ['كيف كانت عملية التدخل؟', [`اكتمل تدخلكم مع ${maalemName}. شاركوا تجربتكم لمساعدة العملاء الآخرين وتحسين جودة خدماتنا.`, `الطلب: ${requestNumber}.`]],
    [OPERATIONAL_NOTIFICATION_EVENTS.REVIEW_REMINDER]: ['رأيكم مهم', [`لم تقيّموا بعد تدخلكم مع ${maalemName}. شاركوا تجربتكم قبل انتهاء صلاحية الدعوة.`, `الطلب: ${requestNumber}.`]],
  };
  const template = (language === 'ar' ? ar : fr)[event];
  if (!template) throw new Error(`Unsupported operational notification event: ${event}`);
  return { title: template[0], body: template[1].filter(Boolean).join('\n'), locale: language };
}

async function loadContext(connection, serviceRequestId) {
  const [rows] = await connection.query(
    `SELECT sr.id, sr.request_number, sr.requester_contact_id, sr.title,
            sr.cancellation_public_reason, sr.current_assignment_id,
            client.prenom AS client_first_name, client.nom_complet AS client_name,
            client.telephone AS client_phone, client.locale AS client_locale,
            COALESCE(qualified_service.nom, initial_service.nom, category.nom, sr.title) AS service_name,
            COALESCE(qualified_service.nom_ar, initial_service.nom_ar, category.nom_ar, sr.title) AS service_name_ar,
            current_assignment.maalem_profile_id AS current_maalem_profile_id,
            maalem_profile.contact_id AS current_maalem_contact_id,
            maalem.prenom AS current_maalem_first_name, maalem.nom_complet AS current_maalem_name,
            maalem.telephone AS current_maalem_phone, maalem.locale AS current_maalem_locale,
            intervention.id AS intervention_id, intervention.planned_date, intervention.planned_time_slot
     FROM service_requests sr
     INNER JOIN contacts client ON client.id = sr.requester_contact_id
     LEFT JOIN services initial_service ON initial_service.id = sr.service_id
     LEFT JOIN services qualified_service ON qualified_service.id = sr.qualified_service_id
     LEFT JOIN maalem_categories category ON category.id = sr.qualified_category_id
     LEFT JOIN service_request_assignments current_assignment
       ON current_assignment.id = sr.current_assignment_id AND current_assignment.unassigned_at IS NULL
     LEFT JOIN maalem_profiles maalem_profile ON maalem_profile.id = current_assignment.maalem_profile_id
     LEFT JOIN contacts maalem ON maalem.id = maalem_profile.contact_id
     LEFT JOIN service_interventions intervention ON intervention.service_request_id = sr.id
     WHERE sr.id = ? AND sr.deleted_at IS NULL LIMIT 1`, [serviceRequestId]
  );
  return rows[0] || null;
}

async function loadMaalemRecipient(connection, profileId) {
  const [rows] = await connection.query(
    `SELECT mp.id AS profile_id, c.id AS contact_id, c.prenom, c.nom_complet, c.telephone, c.locale
     FROM maalem_profiles mp INNER JOIN contacts c ON c.id = mp.contact_id
     WHERE mp.id = ? LIMIT 1`, [profileId]
  );
  return rows[0] || null;
}

function payloadFor(context, input, audience, locale) {
  const interventionId = Number(input.interventionId || context.intervention_id) || null;
  const base = ecomBase();
  return {
    request_number: context.request_number,
    service_name: locale === 'ar' ? context.service_name_ar : context.service_name,
    public_reason: clean(input.publicReason),
    planned_date: input.plannedDate || context.planned_date || null,
    planned_time_slot: input.plannedTimeSlot || context.planned_time_slot || null,
    old_planned_date: input.oldPlannedDate || null,
    old_planned_time_slot: input.oldPlannedTimeSlot || null,
    public_status: input.publicStatus || null,
    assignment_action: audience === 'PREVIOUS_MAALEM' ? 'removed' : 'assigned',
    maalem_name: clean(input.maalemName, 255),
    detail_url: clean(input.detailUrl, 1000) || (audience.includes('MAALEM') && interventionId
      ? `${base}/${locale}/profile/maalem/missions/${interventionId}`
      : `${base}/${locale}/profile/requests/${context.id}`),
  };
}

export async function enqueueOperationalNotifications(connection, input) {
  const context = input.context || await loadContext(connection, input.serviceRequestId);
  if (!context || !TEMPLATE_KEY_BY_EVENT[input.event]) return [];
  const recipients = [];
  for (const audience of input.audiences || []) {
    if (audience === 'CLIENT') {
      recipients.push({ audience, recipientType: 'CONTACT', contactId: Number(context.requester_contact_id),
        profileId: null, telephone: context.client_phone, locale: context.client_locale });
    } else if (audience === 'CURRENT_MAALEM' && context.current_maalem_contact_id) {
      recipients.push({ audience, recipientType: 'CONTACT', contactId: Number(context.current_maalem_contact_id),
        profileId: Number(context.current_maalem_profile_id), telephone: context.current_maalem_phone,
        locale: context.current_maalem_locale });
    } else if (audience === 'PREVIOUS_MAALEM' && input.previousMaalemProfileId) {
      const previous = input.previousMaalem || await loadMaalemRecipient(connection, input.previousMaalemProfileId);
      if (previous) recipients.push({ audience, recipientType: 'CONTACT', contactId: Number(previous.contact_id),
        profileId: Number(previous.profile_id), telephone: previous.telephone, locale: previous.locale });
    } else if (audience === 'BACKOFFICE_TEAM') {
      recipients.push({ audience, recipientType: 'BACKOFFICE_TEAM', contactId: null, profileId: null,
        telephone: null, locale: 'fr' });
    }
  }
  const deliveries = [];
  for (const recipient of recipients) {
    const locale = String(recipient.locale || '').startsWith('ar') ? 'ar' : 'fr';
    const recipientKey = recipient.contactId || 'team';
    const versionKey = String(input.versionKey || input.event);
    deliveries.push(...await enqueueNotificationDeliveries(connection, {
      profileId: recipient.profileId,
      serviceRequestId: Number(context.id),
      interventionId: Number(input.interventionId || context.intervention_id) || null,
      notificationType: input.event,
      sourceEvent: input.sourceEvent || input.event,
      recipientType: recipient.recipientType,
      contactId: recipient.contactId,
      recipientAddress: String(recipientKey),
      locale,
      telephone: recipient.telephone,
      templateKey: TEMPLATE_KEY_BY_EVENT[input.event],
      payload: payloadFor(context, input, recipient.audience, locale),
      idempotencyBase: `srv:${context.id}:event:${input.event}:audience:${recipient.audience}:recipient:${recipientKey}:version:${versionKey}`,
      versionKey,
      createdByEmployeeId: input.createdByEmployeeId,
    }));
  }
  return deliveries;
}

export async function dispatchOperationalNotification(deliveryId, options = {}) {
  return dispatchNotificationDelivery(deliveryId, {
    render: renderOperationalNotification,
    force: options.force,
    ...(options.sender ? { sender: options.sender } : {}),
  });
}

export async function dispatchQueuedOperationalNotifications(deliveries, options = {}) {
  return dispatchQueuedNotificationDeliveries(deliveries, {
    render: renderOperationalNotification,
    force: options.force,
    ...(options.sender ? { sender: options.sender } : {}),
  });
}

export async function dispatchOperationalNotificationsSafely(deliveries, options = {}) {
  try { return await dispatchQueuedOperationalNotifications(deliveries, options); }
  catch (error) {
    console.error('[Operational notification] dispatch unavailable:', sanitizeNotificationError(error));
    return [];
  }
}

export function normalizeOperationalNotificationRow(row, { includeAction = false } = {}) {
  const payload = parseNotificationPayload(row.payload);
  const rendered = renderOperationalNotification({ event: row.notification_type, locale: row.locale, payload });
  const isReviewInvitation = [OPERATIONAL_NOTIFICATION_EVENTS.REVIEW_INVITATION, OPERATIONAL_NOTIFICATION_EVENTS.REVIEW_REMINDER]
    .includes(row.notification_type);
  return {
    id: Number(row.id), service_request_id: Number(row.service_request_id),
    intervention_id: row.intervention_id == null ? null : Number(row.intervention_id),
    notification_type: row.notification_type, source_event: row.source_event,
    recipient_type: row.recipient_type, recipient_contact_id: row.contact_id == null ? null : Number(row.contact_id),
    recipient_employee_id: row.recipient_employee_id == null ? null : Number(row.recipient_employee_id),
    recipient_address: row.recipient_address, channel: row.channel, locale: row.locale,
    status: row.status, attempts: Number(row.attempts), title: rendered.title, body: rendered.body,
    last_error: row.last_error || null, created_at: row.created_at, sent_at: row.sent_at || null,
    read_at: row.read_at || null,
    action_url: includeAction && isReviewInvitation ? clean(payload.detail_url, 1000) : null,
    cta_label: includeAction && isReviewInvitation ? (row.locale === 'ar' ? 'إضافة تقييم' : 'Donner mon avis') : null,
  };
}

export function scheduleHasMeaningfulChange(oldSchedule, nextSchedule) {
  if (!oldSchedule) return true;
  const date = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
  return date(oldSchedule.planned_date) !== date(nextSchedule.planned_date)
    || String(oldSchedule.planned_time_slot || '').trim() !== String(nextSchedule.planned_time_slot || '').trim();
}
