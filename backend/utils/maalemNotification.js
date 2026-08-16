import {
  dispatchNotificationDelivery,
  dispatchQueuedNotificationDeliveries,
  enqueueNotificationDeliveries,
  parseNotificationPayload,
  sanitizeNotificationError,
} from './notificationDelivery.js';

export { sanitizeNotificationError } from './notificationDelivery.js';

export const MAALEM_NOTIFICATION_EVENTS = Object.freeze({
  SUBMITTED: 'MaalemApplicationSubmitted',
  UNDER_REVIEW: 'MaalemApplicationUnderReview',
  APPROVED: 'MaalemApplicationApproved',
  REJECTED: 'MaalemApplicationRejected',
  SUSPENDED: 'MaalemSuspended',
  ACCOUNT_CREATED_BY_TEAM: 'MaalemAccountCreatedByTeam',
});

const EVENT_BY_STATUS = Object.freeze({
  submitted: MAALEM_NOTIFICATION_EVENTS.SUBMITTED,
  under_review: MAALEM_NOTIFICATION_EVENTS.UNDER_REVIEW,
  approved: MAALEM_NOTIFICATION_EVENTS.APPROVED,
  rejected: MAALEM_NOTIFICATION_EVENTS.REJECTED,
  suspended: MAALEM_NOTIFICATION_EVENTS.SUSPENDED,
});

const TEMPLATE_KEY_BY_EVENT = Object.freeze({
  [MAALEM_NOTIFICATION_EVENTS.SUBMITTED]: 'maalem.application.submitted',
  [MAALEM_NOTIFICATION_EVENTS.UNDER_REVIEW]: 'maalem.application.under_review',
  [MAALEM_NOTIFICATION_EVENTS.APPROVED]: 'maalem.application.approved',
  [MAALEM_NOTIFICATION_EVENTS.REJECTED]: 'maalem.application.rejected',
  [MAALEM_NOTIFICATION_EVENTS.SUSPENDED]: 'maalem.suspended',
  [MAALEM_NOTIFICATION_EVENTS.ACCOUNT_CREATED_BY_TEAM]: 'maalem.account.created_by_team',
});

export function normalizeMaalemNotificationLocale(value) {
  return String(value || '').toLowerCase().startsWith('ar') ? 'ar' : 'fr';
}

function cleanText(value, maxLength = 500) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : null;
}

export function shouldNotifyUnderReview(env = process.env) {
  return String(env.MAALEM_NOTIFY_UNDER_REVIEW || '').toLowerCase() === 'true';
}

export function notificationEventForStatus(status, env = process.env) {
  const event = EVENT_BY_STATUS[status] || null;
  return event === MAALEM_NOTIFICATION_EVENTS.UNDER_REVIEW && !shouldNotifyUnderReview(env) ? null : event;
}

function espaceUrl(locale) {
  const base = String(process.env.ECOMMERCE_FRONTEND_URL || 'http://localhost:3002').trim().replace(/\/+$/, '');
  return `${base}/${locale}/profile/maalem`;
}

export function renderMaalemNotification({ event, locale, payload = {}, activationUrl = null }) {
  const language = normalizeMaalemNotificationLocale(locale);
  const name = cleanText(payload.candidate_name, 255) || (language === 'ar' ? 'الحرفي' : 'Maalem');
  const publicReason = cleanText(payload.public_reason);
  const profileUrl = cleanText(payload.profile_url, 1000) || espaceUrl(language);
  const invitationUrl = activationUrl ? String(activationUrl) : null;

  const fr = {
    [MAALEM_NOTIFICATION_EVENTS.SUBMITTED]: {
      title: 'Candidature Maalem reçue',
      lines: [`Bonjour ${name},`, 'Votre dossier Maalem a bien été reçu. Notre équipe va l’étudier.', 'Vos fonctionnalités professionnelles ne sont pas encore activées.'],
    },
    [MAALEM_NOTIFICATION_EVENTS.UNDER_REVIEW]: {
      title: 'Candidature Maalem en vérification',
      lines: [`Bonjour ${name},`, 'Votre dossier Maalem est maintenant en cours de vérification par notre équipe.'],
    },
    [MAALEM_NOTIFICATION_EVENTS.APPROVED]: {
      title: 'Candidature Maalem validée',
      lines: [`Bonjour ${name},`, 'Votre profil Maalem a été accepté.', `Vous pouvez consulter votre espace professionnel : ${profileUrl}`, 'Les autorisations restent contrôlées de façon sécurisée par la plateforme.'],
    },
    [MAALEM_NOTIFICATION_EVENTS.REJECTED]: {
      title: 'Résultat de votre candidature Maalem',
      lines: [`Bonjour ${name},`, 'Votre candidature Maalem n’a pas été validée.', publicReason ? `Motif communiqué : ${publicReason}` : null],
    },
    [MAALEM_NOTIFICATION_EVENTS.SUSPENDED]: {
      title: 'Fonctionnalités Maalem suspendues',
      lines: [`Bonjour ${name},`, 'Vos fonctionnalités professionnelles Maalem sont suspendues.', 'Votre compte Artisan e-commerce reste actif.', publicReason ? `Motif communiqué : ${publicReason}` : null],
    },
    [MAALEM_NOTIFICATION_EVENTS.ACCOUNT_CREATED_BY_TEAM]: {
      title: 'Votre compte Artisan/Maalem a été créé',
      lines: [`Bonjour ${name},`, 'Votre compte Artisan/Maalem Boukir a été créé par notre équipe.', invitationUrl ? 'Choisissez votre mot de passe avec ce lien sécurisé valable 48 heures :' : 'Utilisez le lien sécurisé transmis par notre équipe pour choisir votre mot de passe.', invitationUrl],
    },
  };
  const ar = {
    [MAALEM_NOTIFICATION_EVENTS.SUBMITTED]: {
      title: 'تم استلام طلب معلّم',
      lines: [`مرحباً ${name}،`, 'تم استلام ملف معلّم الخاص بك وسيقوم فريقنا بدراسته.', 'لم يتم تفعيل الخصائص المهنية بعد.'],
    },
    [MAALEM_NOTIFICATION_EVENTS.UNDER_REVIEW]: {
      title: 'طلب معلّم قيد التحقق',
      lines: [`مرحباً ${name}،`, 'ملف معلّم الخاص بك قيد التحقق من طرف فريقنا.'],
    },
    [MAALEM_NOTIFICATION_EVENTS.APPROVED]: {
      title: 'تم قبول طلب معلّم',
      lines: [`مرحباً ${name}،`, 'تم قبول ملف معلّم الخاص بك.', `يمكنك الدخول إلى فضائك المهني: ${profileUrl}`, 'تظل الصلاحيات خاضعة للتحقق الآمن من طرف المنصة.'],
    },
    [MAALEM_NOTIFICATION_EVENTS.REJECTED]: {
      title: 'نتيجة طلب معلّم',
      lines: [`مرحباً ${name}،`, 'لم تتم المصادقة على طلب معلّم الخاص بك.', publicReason ? `السبب المعلن: ${publicReason}` : null],
    },
    [MAALEM_NOTIFICATION_EVENTS.SUSPENDED]: {
      title: 'تم تعليق خصائص معلّم',
      lines: [`مرحباً ${name}،`, 'تم تعليق الخصائص المهنية الخاصة بمعلّم.', 'يبقى حساب الحرفي للتجارة الإلكترونية فعالاً.', publicReason ? `السبب المعلن: ${publicReason}` : null],
    },
    [MAALEM_NOTIFICATION_EVENTS.ACCOUNT_CREATED_BY_TEAM]: {
      title: 'تم إنشاء حساب الحرفي/معلّم',
      lines: [`مرحباً ${name}،`, 'قام فريقنا بإنشاء حساب الحرفي/معلّم الخاص بك.', invitationUrl ? 'اختر كلمة المرور عبر هذا الرابط الآمن الصالح لمدة 48 ساعة:' : 'استعمل الرابط الآمن الذي أرسله فريقنا لاختيار كلمة المرور.', invitationUrl],
    },
  };
  const template = (language === 'ar' ? ar : fr)[event];
  if (!template) throw new Error(`Unsupported Maalem notification event: ${event}`);
  return { title: template.title, body: template.lines.filter(Boolean).join('\n'), locale: language };
}

function notificationPayload(input, locale) {
  return {
    candidate_name: cleanText(input.candidateName, 255),
    category_name: cleanText(input.categoryName, 255),
    public_reason: cleanText(input.publicReason),
    application_date: input.applicationDate || null,
    profile_url: input.event === MAALEM_NOTIFICATION_EVENTS.APPROVED ? espaceUrl(locale) : null,
  };
}

export async function enqueueMaalemNotifications(connection, input) {
  if (!input?.event || !TEMPLATE_KEY_BY_EVENT[input.event]) return [];
  const locale = normalizeMaalemNotificationLocale(input.locale);
  const payload = notificationPayload(input, locale);
  return enqueueNotificationDeliveries(connection, {
    profileId: input.profileId,
    contactId: input.contactId,
    sourceHistoryId: input.sourceHistoryId,
    notificationType: input.event,
    sourceEvent: input.event,
    recipientType: 'CONTACT',
    recipientAddress: String(input.contactId),
    locale,
    telephone: input.telephone,
    templateKey: TEMPLATE_KEY_BY_EVENT[input.event],
    payload,
    idempotencyBase: `maalem:${input.profileId}:history:${input.sourceHistoryId}:${input.event}`,
    versionKey: String(input.sourceHistoryId || ''),
    createdByEmployeeId: input.createdByEmployeeId,
  });
}

export async function dispatchMaalemNotification(deliveryId, {
  activationUrl = null,
  force = false,
  sender,
} = {}) {
  return dispatchNotificationDelivery(deliveryId, {
    render: renderMaalemNotification,
    force,
    ...(sender ? { sender } : {}),
    renderOptions: { activationUrl },
  });
}

export async function dispatchQueuedMaalemNotifications(deliveries, options = {}) {
  return dispatchQueuedNotificationDeliveries(deliveries, {
    render: renderMaalemNotification,
    force: options.force,
    ...(options.sender ? { sender: options.sender } : {}),
    renderOptions: { activationUrl: options.activationUrl || null },
  });
}

export function normalizeNotificationRow(row) {
  const payload = parseNotificationPayload(row.payload);
  const rendered = renderMaalemNotification({ event: row.notification_type, locale: row.locale, payload });
  return {
    id: Number(row.id), profile_id: Number(row.profile_id), notification_type: row.notification_type,
    source_event: row.source_event, channel: row.channel, locale: row.locale, status: row.status,
    attempts: Number(row.attempts), recipient_address: row.recipient_address, title: rendered.title,
    body: rendered.body, last_error: row.last_error || null, created_at: row.created_at,
    sent_at: row.sent_at || null, read_at: row.read_at || null,
  };
}
