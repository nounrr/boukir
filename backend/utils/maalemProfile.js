export const MAALEM_PROFILE_STATUSES = Object.freeze([
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'suspended',
]);

export const MAALEM_PROFILE_STATUS_LABELS = Object.freeze({
  draft: 'Brouillon',
  submitted: 'Demande envoyée',
  under_review: 'En vérification',
  approved: 'Validé',
  rejected: 'Refusé',
  suspended: 'Suspendu',
});

export const MAALEM_PROFILE_ORIGINS = Object.freeze([
  'SELF_SERVICE',
  'NEW_REGISTRATION',
  'ARTISAN_CONVERSION',
  'TEAM_CREATED',
]);

export const MAALEM_PROFILE_ORIGIN_LABELS = Object.freeze({
  SELF_SERVICE: 'Inscription ou conversion historique',
  NEW_REGISTRATION: 'Nouvelle inscription',
  ARTISAN_CONVERSION: 'Artisan existant',
  TEAM_CREATED: 'Créé par l’équipe',
});

export const MAALEM_AVAILABILITIES = Object.freeze([
  'immediate',
  'weekdays',
  'weekends',
  'evenings',
  'on_request',
]);

const USER_EDITABLE_STATUSES = new Set(['draft', 'rejected']);
const ADMIN_TRANSITIONS = Object.freeze({
  submitted: new Set(['under_review']),
  under_review: new Set(['approved', 'rejected']),
  approved: new Set(['suspended']),
});
const ADMIN_CATEGORY_EDITABLE_STATUSES = new Set(['draft', 'submitted', 'under_review', 'rejected']);

function isTruthyDatabaseFlag(value) {
  return value === true || value === 1 || value === '1';
}

export function isArtisanAccount(user) {
  return user?.type_compte === 'Artisan/Promoteur' || isTruthyDatabaseFlag(user?.artisan_approuve);
}

function optionalTrimmedText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

// Only copy account fields that have the same meaning in a Maalem application.
// The source contact is never updated or replaced by this professional extension.
export function buildMaalemProfessionalPrefill(contact) {
  return {
    skills: [],
    contact_phone: optionalTrimmedText(contact?.telephone),
    city: optionalTrimmedText(contact?.shipping_city),
    intervention_areas: [],
    experience_years: null,
    professional_summary: null,
    experiences: null,
    availability: null,
    other_information: null,
  };
}

export function canEditMaalemDraft(status) {
  return USER_EDITABLE_STATUSES.has(status);
}

function normalizeText(value, maxLength, label, { required = false } = {}) {
  if (value == null || value === '') {
    return required
      ? { valid: false, error: `${label} est requis(e)` }
      : { valid: true, value: null };
  }
  if (typeof value !== 'string') return { valid: false, error: `${label} doit être un texte` };
  const normalized = value.trim();
  if (required && !normalized) return { valid: false, error: `${label} est requis(e)` };
  if (normalized.length > maxLength) {
    return { valid: false, error: `${label} ne peut pas dépasser ${maxLength} caractères` };
  }
  return { valid: true, value: normalized || null };
}

function normalizeStringList(value, { label, maxItems, maxItemLength, required = false }) {
  if (value == null) value = [];
  if (!Array.isArray(value)) return { valid: false, error: `${label} doit être une liste` };
  const normalized = [];
  for (const item of value) {
    if (typeof item !== 'string') return { valid: false, error: `${label} contient une valeur invalide` };
    const text = item.trim();
    if (!text) continue;
    if (text.length > maxItemLength) {
      return { valid: false, error: `Chaque élément de ${label} est limité à ${maxItemLength} caractères` };
    }
    if (!normalized.includes(text)) normalized.push(text);
  }
  if (normalized.length > maxItems) return { valid: false, error: `${label} est limité(e) à ${maxItems} éléments` };
  if (required && normalized.length === 0) return { valid: false, error: `${label} est requis(e)` };
  return { valid: true, value: normalized };
}

export function validateMaalemProfessionalData(input, { requireComplete = false } = {}) {
  if (input == null && !requireComplete) return { valid: true, data: null };
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, error: 'Les informations professionnelles sont invalides' };
  }

  const skills = normalizeStringList(input.skills, {
    label: 'Les compétences', maxItems: 20, maxItemLength: 80, required: requireComplete,
  });
  if (!skills.valid) return skills;
  const areas = normalizeStringList(input.intervention_areas, {
    label: "Les zones d’intervention", maxItems: 20, maxItemLength: 100,
  });
  if (!areas.valid) return areas;
  const city = normalizeText(input.city, 100, 'La ville', { required: requireComplete });
  if (!city.valid) return city;
  const phone = normalizeText(input.contact_phone, 30, 'Le téléphone de contact');
  if (!phone.valid) return phone;
  if (phone.value && !/^[+\d][\d\s().-]{6,29}$/.test(phone.value)) {
    return { valid: false, error: 'Le téléphone de contact est invalide' };
  }
  const summary = normalizeText(input.professional_summary, 2000, 'La présentation professionnelle', {
    required: requireComplete,
  });
  if (!summary.valid) return summary;
  const experiences = normalizeText(input.experiences, 5000, 'Les expériences');
  if (!experiences.valid) return experiences;
  const other = normalizeText(input.other_information, 2000, 'Les informations complémentaires');
  if (!other.valid) return other;

  const years = input.experience_years;
  if (years == null || years === '') {
    if (requireComplete) return { valid: false, error: "Les années d’expérience sont requises" };
  } else if (!Number.isSafeInteger(years) || years < 0 || years > 70) {
    return { valid: false, error: "Les années d’expérience doivent être un entier entre 0 et 70" };
  }

  const availability = input.availability == null || input.availability === '' ? null : input.availability;
  if (requireComplete && !availability) return { valid: false, error: 'La disponibilité est requise' };
  if (availability && !MAALEM_AVAILABILITIES.includes(availability)) {
    return { valid: false, error: 'La disponibilité est invalide' };
  }

  return {
    valid: true,
    data: {
      skills: skills.value,
      contact_phone: phone.value,
      city: city.value,
      intervention_areas: areas.value,
      experience_years: years == null || years === '' ? null : years,
      professional_summary: summary.value,
      experiences: experiences.value,
      availability,
      other_information: other.value,
    },
  };
}

export function validateMaalemDraftInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.hasOwn(body, 'category_id')) {
    return { valid: false, error: 'La catégorie doit être fournie, même si elle est vide' };
  }
  if (body.category_id !== null && (!Number.isSafeInteger(body.category_id) || body.category_id <= 0)) {
    return { valid: false, error: 'Identifiant de catégorie invalide' };
  }
  const professionalData = Object.hasOwn(body, 'professional_data')
    ? validateMaalemProfessionalData(body.professional_data)
    : { valid: true, data: undefined };
  if (!professionalData.valid) return professionalData;
  const result = { valid: true, category_id: body.category_id };
  if (professionalData.data !== undefined) result.professional_data = professionalData.data;
  return result;
}

function parseProfessionalData(value) {
  if (value == null || typeof value === 'object') return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function validateMaalemSubmission(profile, category, fallbackPhone = null) {
  if (!profile) return { valid: false, error: 'Profil Maalem introuvable' };
  if (!canEditMaalemDraft(profile.status)) {
    return { valid: false, error: 'Ce profil ne peut pas être soumis dans son statut actuel' };
  }
  if (!profile.category_id) {
    return { valid: false, error: 'Une catégorie métier est requise avant la soumission' };
  }
  if (!category || !isTruthyDatabaseFlag(category.is_active) || category.deleted_at != null) {
    return { valid: false, error: 'La catégorie métier sélectionnée n’est plus disponible' };
  }
  const professionalData = validateMaalemProfessionalData(parseProfessionalData(profile.professional_data), {
    requireComplete: true,
  });
  if (!professionalData.valid) return professionalData;
  if (!professionalData.data.contact_phone && !String(fallbackPhone || '').trim()) {
    return { valid: false, error: 'Un téléphone de contact est requis avant la soumission' };
  }
  return { valid: true };
}

export function canAdminTransitionMaalemStatus(currentStatus, nextStatus) {
  return Boolean(ADMIN_TRANSITIONS[currentStatus]?.has(nextStatus));
}

export function canAdminChangeMaalemCategory(status) {
  return ADMIN_CATEGORY_EDITABLE_STATUSES.has(status);
}

export function validateMaalemAdminStatusInput(body) {
  if (!body || typeof body !== 'object' || !MAALEM_PROFILE_STATUSES.includes(body.status)) {
    return { valid: false, error: 'Statut Maalem invalide' };
  }
  if (!['under_review', 'approved', 'rejected', 'suspended'].includes(body.status)) {
    return { valid: false, error: 'Ce statut ne peut pas être attribué par le Back-office' };
  }
  const rawInternalReason = body.internal_reason ?? body.reason;
  if (rawInternalReason != null && typeof rawInternalReason !== 'string') {
    return { valid: false, error: 'Le motif interne doit être un texte' };
  }
  if (body.public_reason != null && typeof body.public_reason !== 'string') {
    return { valid: false, error: 'Le motif public doit être un texte' };
  }
  const internalReason = typeof rawInternalReason === 'string' ? rawInternalReason.trim() : '';
  const publicReason = typeof body.public_reason === 'string' ? body.public_reason.trim() : '';
  if (internalReason.length > 500) return { valid: false, error: 'Le motif interne ne peut pas dépasser 500 caractères' };
  if (publicReason.length > 500) return { valid: false, error: 'Le motif public ne peut pas dépasser 500 caractères' };
  if (['rejected', 'suspended'].includes(body.status) && !internalReason) {
    return { valid: false, error: 'Un motif interne est requis pour un refus ou une suspension' };
  }
  return {
    valid: true,
    status: body.status,
    reason: internalReason || null,
    internalReason: internalReason || null,
    publicReason: publicReason || null,
  };
}

export function validateMaalemAdminCategoryInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Les données de catégorie sont invalides' };
  }
  if (!Number.isSafeInteger(body.category_id) || body.category_id <= 0) {
    return { valid: false, error: 'Identifiant de catégorie invalide' };
  }
  if (body.note != null && typeof body.note !== 'string') {
    return { valid: false, error: 'La note de correction doit être un texte' };
  }
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 500) {
    return { valid: false, error: 'La note de correction ne peut pas dépasser 500 caractères' };
  }
  return { valid: true, category_id: body.category_id, note: note || null };
}

export function validateMaalemInternalNoteInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.note !== 'string') {
    return { valid: false, error: 'La note interne est requise' };
  }
  const note = body.note.trim();
  if (!note) return { valid: false, error: 'La note interne est requise' };
  if (note.length > 2000) {
    return { valid: false, error: 'La note interne ne peut pas dépasser 2000 caractères' };
  }
  return { valid: true, note };
}

export function normalizeMaalemProfileRow(row) {
  if (!row) return null;
  const profile = {
    id: Number(row.id),
    user_id: Number(row.contact_id),
    contact_id: Number(row.contact_id),
    category_id: row.category_id == null ? null : Number(row.category_id),
    status: row.status,
    status_label: MAALEM_PROFILE_STATUS_LABELS[row.status] || row.status,
    origin: row.origin || 'SELF_SERVICE',
    origin_label: MAALEM_PROFILE_ORIGIN_LABELS[row.origin || 'SELF_SERVICE'] || row.origin,
    created_by_employee_id: row.created_by_employee_id == null ? null : Number(row.created_by_employee_id),
    professional_data: parseProfessionalData(row.professional_data),
    status_reason: row._backoffice === true
      ? (row.internal_reason ?? row.status_reason ?? null)
      : (row.public_reason ?? null),
    public_reason: row.public_reason ?? null,
    submitted_at: row.submitted_at ?? null,
    reviewed_at: row.reviewed_at ?? null,
    reviewed_by: row.reviewed_by ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    category: row.category_id == null ? null : {
      id: Number(row.category_id),
      nom: row.category_nom,
      nom_ar: row.category_nom_ar,
      is_active: isTruthyDatabaseFlag(row.category_is_active),
    },
  };
  if (row._backoffice === true) profile.internal_reason = row.internal_reason ?? row.status_reason ?? null;
  if (row.contact_nom_complet !== undefined) {
    profile.user = {
      id: Number(row.contact_id),
      nom_complet: row.contact_nom_complet,
      email: row.contact_email,
      telephone: row.contact_telephone,
      type_compte: row.contact_type_compte,
      prenom: row.contact_prenom ?? null,
      nom: row.contact_nom ?? null,
      societe: row.contact_societe ?? null,
      adresse: row.contact_adresse ?? null,
      city: row.contact_shipping_city ?? null,
      avatar_url: row.contact_avatar_url ?? null,
    };
  }
  if (row.reviewer_name !== undefined || row.creator_name !== undefined) {
    profile.review = {
      reviewer_name: row.reviewer_name ?? null,
      creator_name: row.creator_name ?? null,
    };
  }
  return profile;
}

export async function findMaalemProfileByContactId(db, contactId) {
  const [rows] = await db.query(
    `SELECT mp.*,
            mc.nom AS category_nom,
            mc.nom_ar AS category_nom_ar,
            mc.is_active AS category_is_active
     FROM maalem_profiles mp
     LEFT JOIN maalem_categories mc ON mc.id = mp.category_id
     WHERE mp.contact_id = ? AND mp.deleted_at IS NULL
     LIMIT 1`,
    [contactId]
  );
  return normalizeMaalemProfileRow(rows[0]);
}
