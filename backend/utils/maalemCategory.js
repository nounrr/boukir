const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 1000;

function normalizeRequiredText(value, field, errors) {
  if (typeof value !== 'string') {
    errors[field] = 'Ce champ est requis';
    return '';
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < NAME_MIN_LENGTH) {
    errors[field] = `Ce champ doit contenir au moins ${NAME_MIN_LENGTH} caractères`;
  } else if (normalized.length > NAME_MAX_LENGTH) {
    errors[field] = `Ce champ ne peut pas dépasser ${NAME_MAX_LENGTH} caractères`;
  }
  return normalized;
}

function normalizeDescription(value, errors) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') {
    errors.description = 'La description doit être un texte';
    return null;
  }

  const normalized = value.trim();
  if (normalized.length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `La description ne peut pas dépasser ${DESCRIPTION_MAX_LENGTH} caractères`;
  }
  return normalized || null;
}

export function validateMaalemCategoryInput(body, { defaultActive = true } = {}) {
  const source = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const errors = {};

  const nom = normalizeRequiredText(source.nom, 'nom', errors);
  const nom_ar = normalizeRequiredText(source.nom_ar, 'nom_ar', errors);
  const description = normalizeDescription(source.description, errors);

  let is_active = source.is_active;
  if (is_active === undefined) is_active = defaultActive;
  if (typeof is_active !== 'boolean') {
    errors.is_active = 'Le statut doit être un booléen';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    value: { nom, nom_ar, description, is_active },
  };
}

export function parseMaalemCategoryStatus(body) {
  if (!body || typeof body !== 'object' || typeof body.is_active !== 'boolean') {
    return { valid: false, error: 'Le statut doit être un booléen' };
  }
  return { valid: true, is_active: body.is_active };
}

export function canManageMaalemCategories(user) {
  return user?.role === 'PDG';
}

export function normalizeMaalemCategoryRow(row) {
  return { ...row, is_active: Boolean(row.is_active) };
}
