const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 150;
const DESCRIPTION_MAX_LENGTH = 5000;
const MAX_CATEGORIES = 100;

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

function normalizeOptionalText(value, field, errors) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') {
    errors[field] = 'Ce champ doit être un texte';
    return null;
  }
  const normalized = value.trim();
  if (normalized.length > DESCRIPTION_MAX_LENGTH) {
    errors[field] = `Ce champ ne peut pas dépasser ${DESCRIPTION_MAX_LENGTH} caractères`;
  }
  return normalized || null;
}

function parseBoolean(value, field, errors, defaultValue) {
  if (value === undefined) return defaultValue;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  errors[field] = 'Ce champ doit être un booléen';
  return defaultValue;
}

export function parseServiceCategoryIds(value) {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      return { valid: false, error: 'Les catégories doivent être un tableau JSON' };
    }
  }
  if (!Array.isArray(source)) {
    return { valid: false, error: 'Au moins une catégorie Maalem est requise' };
  }
  if (source.length > MAX_CATEGORIES) {
    return { valid: false, error: `Un service ne peut pas dépasser ${MAX_CATEGORIES} catégories` };
  }
  const ids = [];
  const seen = new Set();
  for (const value of source) {
    const id = typeof value === 'string' && value.trim() ? Number(value) : value;
    if (!Number.isSafeInteger(id) || id <= 0) {
      return { valid: false, error: 'Une catégorie Maalem est invalide' };
    }
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  if (ids.length === 0) {
    return { valid: false, error: 'Au moins une catégorie Maalem est requise' };
  }
  return { valid: true, value: ids };
}

export function validateServiceInput(body, { defaultActive = true } = {}) {
  const source = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const errors = {};
  const nom = normalizeRequiredText(source.nom, 'nom', errors);
  const nom_ar = normalizeRequiredText(source.nom_ar, 'nom_ar', errors);
  const description = normalizeOptionalText(source.description, 'description', errors);
  const description_ar = normalizeOptionalText(source.description_ar, 'description_ar', errors);
  const is_active = parseBoolean(source.is_active, 'is_active', errors, defaultActive);
  const remove_image = parseBoolean(source.remove_image, 'remove_image', errors, false);
  const categories = parseServiceCategoryIds(source.category_ids);
  if (!categories.valid) errors.category_ids = categories.error;

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    value: {
      nom,
      nom_ar,
      description,
      description_ar,
      is_active,
      remove_image,
      category_ids: categories.valid ? categories.value : [],
    },
  };
}

export function parseServiceStatus(body) {
  if (!body || typeof body !== 'object' || typeof body.is_active !== 'boolean') {
    return { valid: false, error: 'Le statut doit être un booléen' };
  }
  return { valid: true, is_active: body.is_active };
}

export function canManageServices(user) {
  return user?.role === 'PDG';
}

export function normalizeServiceRow(row) {
  return {
    ...row,
    id: Number(row.id),
    is_active: Boolean(row.is_active),
    categories: Array.isArray(row.categories) ? row.categories : [],
  };
}
