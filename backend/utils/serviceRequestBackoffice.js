export const SERVICE_REQUEST_STATUSES = Object.freeze([
  'new',
  'to_contact',
  'processing',
  'waiting_customer',
  'confirmed',
  'assigned',
  'scheduled',
  'to_do',
  'en_route',
  'arrived',
  'work_in_progress',
  'completed',
  'closed',
  'cancelled',
]);

export const SERVICE_REQUEST_TRANSITIONS = Object.freeze({
  new: Object.freeze(['to_contact']),
  to_contact: Object.freeze(['processing']),
  processing: Object.freeze(['waiting_customer', 'confirmed', 'cancelled']),
  waiting_customer: Object.freeze(['processing', 'cancelled']),
  confirmed: Object.freeze([]),
  assigned: Object.freeze([]),
  scheduled: Object.freeze([]),
  to_do: Object.freeze([]),
  en_route: Object.freeze([]),
  arrived: Object.freeze([]),
  work_in_progress: Object.freeze([]),
  completed: Object.freeze([]),
  closed: Object.freeze([]),
  cancelled: Object.freeze([]),
});

export const SERVICE_REQUEST_PRIORITIES = Object.freeze(['low', 'normal', 'high', 'urgent']);
export const SERVICE_REQUEST_CONTACT_CHANNELS = Object.freeze(['WHATSAPP', 'PHONE', 'OTHER']);

export function canTransitionServiceRequest(from, to) {
  return Boolean(SERVICE_REQUEST_TRANSITIONS[from]?.includes(to));
}

export function confirmationErrors(request) {
  const errors = {};
  if (!String(request?.requester_name || '').trim() && !String(request?.requester_phone || '').trim()) {
    errors.requester = 'Le client ou le contact doit être identifiable';
  }
  if (!String(request?.requester_phone || '').trim()) errors.requester_phone = 'Un téléphone de contact est requis';
  if (!String(request?.qualified_description || request?.problem_description || '').trim()) {
    errors.description = 'Une description exploitable est requise';
  }
  if (!String(request?.city || '').trim()) errors.city = 'La ville est requise';
  if (!String(request?.intervention_address || '').trim()
    && (request?.latitude == null || request?.longitude == null)) {
    errors.location = 'Une adresse ou une géolocalisation complète est requise';
  }
  if (!request?.qualified_service_id && !request?.service_id && !request?.qualified_category_id) {
    errors.qualification = 'Un service ou une catégorie qualifiée est requis';
  }
  return errors;
}

export function normalizeNullableText(value, maxLength = 10000) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.length <= maxLength ? normalized : undefined;
}
