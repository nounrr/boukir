export const SERVICE_REQUEST_SOURCES = Object.freeze({
  SELECTED_MAALEM: 'selected_maalem',
  SELECTED_SERVICE: 'selected_service',
  QUICK_REQUEST: 'quick_request',
});

export const SERVICE_REQUEST_INITIAL_STATUS = 'new';
export const SERVICE_REQUEST_CHANNEL = 'ECOMMERCE';

const SOURCE_VALUES = new Set(Object.values(SERVICE_REQUEST_SOURCES));
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBMISSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;

function optionalText(value, field, maxLength, errors) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') {
    errors[field] = 'Ce champ doit être un texte';
    return null;
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) errors[field] = `Ce champ ne peut pas dépasser ${maxLength} caractères`;
  return normalized;
}

function optionalId(value, field, errors) {
  if (value == null || value === '') return null;
  const id = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (!Number.isSafeInteger(id) || id <= 0) {
    errors[field] = 'Identifiant invalide';
    return null;
  }
  return id;
}

function optionalCoordinate(value, field, min, max, errors) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    errors[field] = `Coordonnée invalide (${min} à ${max})`;
    return null;
  }
  return number;
}

function optionalDate(value, errors) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    errors.desired_date = 'La date doit respecter le format AAAA-MM-JJ';
    return null;
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    errors.desired_date = 'Date invalide';
    return null;
  }
  if (value < new Date().toISOString().slice(0, 10)) {
    errors.desired_date = 'La date souhaitée ne peut pas être passée';
    return null;
  }
  return value;
}

export function validateServiceRequestInput(body) {
  const source = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const errors = {};
  const requestSource = typeof source.request_source === 'string' ? source.request_source.trim() : '';
  if (!SOURCE_VALUES.has(requestSource)) errors.request_source = 'Source de demande invalide';

  const serviceId = optionalId(source.service_id, 'service_id', errors);
  const requestedMaalemId = optionalId(source.requested_maalem_id, 'requested_maalem_id', errors);
  const categoryId = optionalId(source.category_id, 'category_id', errors);
  const title = optionalText(source.title, 'title', 160, errors);
  const problemDescription = optionalText(source.problem_description, 'problem_description', 10000, errors);
  const requesterName = optionalText(source.contact_name, 'contact_name', 255, errors);
  const requesterPhone = optionalText(source.contact_phone, 'contact_phone', 50, errors);
  const requesterEmail = optionalText(source.contact_email, 'contact_email', 255, errors);
  if (requesterEmail && !EMAIL_PATTERN.test(requesterEmail)) errors.contact_email = 'Adresse email invalide';
  const city = optionalText(source.city, 'city', 100, errors);
  const address = optionalText(source.address, 'address', 500, errors);
  const latitude = optionalCoordinate(source.latitude, 'latitude', -90, 90, errors);
  const longitude = optionalCoordinate(source.longitude, 'longitude', -180, 180, errors);
  const desiredDate = optionalDate(source.desired_date, errors);
  const desiredTimeSlot = optionalText(source.desired_time_slot, 'desired_time_slot', 100, errors);
  const sharedNote = optionalText(source.shared_note, 'shared_note', 5000, errors);
  const clientSubmissionId = optionalText(source.client_submission_id, 'client_submission_id', 64, errors);
  if (clientSubmissionId && !SUBMISSION_ID_PATTERN.test(clientSubmissionId)) {
    errors.client_submission_id = 'Identifiant de soumission invalide';
  }

  if ((latitude == null) !== (longitude == null)) errors.coordinates = 'Latitude et longitude doivent être fournies ensemble';
  if (requestSource === SERVICE_REQUEST_SOURCES.SELECTED_MAALEM && !requestedMaalemId) {
    errors.requested_maalem_id = 'Un Maalem est requis pour cette source';
  }
  if (requestSource === SERVICE_REQUEST_SOURCES.SELECTED_SERVICE && !serviceId) {
    errors.service_id = 'Un service est requis pour cette source';
  }
  if (requestSource === SERVICE_REQUEST_SOURCES.SELECTED_SERVICE && !problemDescription) {
    errors.problem_description = 'La description du besoin est requise pour ce service';
  }
  if (requestSource === SERVICE_REQUEST_SOURCES.SELECTED_SERVICE && requestedMaalemId) {
    errors.requested_maalem_id = 'Un Maalem ne peut pas être imposé pour cette source';
  }
  if (requestSource === SERVICE_REQUEST_SOURCES.SELECTED_SERVICE && categoryId) {
    errors.category_id = 'La catégorie sera déterminée ultérieurement par l’équipe';
  }
  if (requestSource === SERVICE_REQUEST_SOURCES.SELECTED_SERVICE && !desiredDate) {
    errors.desired_date = 'La date souhaitée est requise';
  }
  if (requestSource === SERVICE_REQUEST_SOURCES.SELECTED_SERVICE && !desiredTimeSlot) {
    errors.desired_time_slot = 'Le créneau souhaité est requis';
  }
  if (requestSource === SERVICE_REQUEST_SOURCES.QUICK_REQUEST && !problemDescription) {
    errors.problem_description = 'La description du problème est requise pour une demande rapide';
  }
  if (requestSource === SERVICE_REQUEST_SOURCES.QUICK_REQUEST && serviceId) {
    errors.service_id = 'Une demande rapide ne peut pas imposer de service';
  }
  if (requestSource === SERVICE_REQUEST_SOURCES.QUICK_REQUEST && requestedMaalemId) {
    errors.requested_maalem_id = 'Une demande rapide ne peut pas imposer de Maalem';
  }
  if (requestSource === SERVICE_REQUEST_SOURCES.QUICK_REQUEST && categoryId) {
    errors.category_id = 'La catégorie sera qualifiée ultérieurement par l’équipe';
  }
  if (source.status != null && source.status !== SERVICE_REQUEST_INITIAL_STATUS) {
    errors.status = 'Le statut initial doit être new';
  }
  if (source.internal_note != null || source.note_visibility === 'INTERNAL') {
    errors.internal_note = 'Une note interne ne peut pas être créée depuis cet endpoint';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    value: {
      request_source: requestSource,
      service_id: serviceId,
      requested_maalem_id: requestedMaalemId,
      category_id: categoryId,
      title,
      problem_description: problemDescription,
      contact_name: requesterName,
      contact_phone: requesterPhone,
      contact_email: requesterEmail,
      city,
      address,
      latitude,
      longitude,
      desired_date: desiredDate,
      desired_time_slot: desiredTimeSlot,
      shared_note: sharedNote,
      client_submission_id: clientSubmissionId,
    },
  };
}

export function formatServiceRequestNumber(value) {
  const sequence = Number(value);
  if (!Number.isSafeInteger(sequence) || sequence <= 0) throw new TypeError('Séquence de demande invalide');
  return `SRV-${String(sequence).padStart(6, '0')}`;
}

export function isEcommerceRequester(user) {
  return Boolean(user?.id) && !user?.role && user?.type_compte != null;
}

export function normalizeServiceRequestRow(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    requester_contact_id: Number(row.requester_contact_id),
    service_id: row.service_id == null ? null : Number(row.service_id),
    requested_maalem_id: row.requested_maalem_profile_id == null ? null : Number(row.requested_maalem_profile_id),
    category_id: row.qualified_category_id == null ? null : Number(row.qualified_category_id),
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
  };
}
