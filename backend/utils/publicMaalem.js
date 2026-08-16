import { canReceiveServiceAssignments } from './maalemAccess.js';

function parseProfessionalData(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function publicString(value, maxLength = 5000) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function publicStringList(value, limit = 30) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => publicString(item, 120))
    .filter(Boolean)
    .slice(0, limit);
}

function isDatabaseTrue(value) {
  return value === true || value === 1 || value === '1';
}

export function isPubliclyOrderableMaalem(row) {
  return Boolean(
    row
    && isDatabaseTrue(row.is_public)
    && row.deleted_at == null
    && row.contact_deleted_at == null
    && isDatabaseTrue(row.contact_is_active)
    && !isDatabaseTrue(row.contact_is_blocked)
    && canReceiveServiceAssignments(row)
  );
}

export function normalizePublicMaalem(row) {
  if (!isPubliclyOrderableMaalem(row)) return null;
  const professional = parseProfessionalData(row.professional_data);
  return {
    id: Number(row.id),
    public_name: publicString(row.nom_complet, 255) || `Maalem #${row.id}`,
    photo_url: publicString(row.avatar_url, 1024),
    is_verified: true,
    category: row.category_id == null ? null : {
      id: Number(row.category_id),
      name: publicString(row.category_name, 100),
      name_ar: publicString(row.category_name_ar, 100),
    },
    city: publicString(professional.city, 100),
    intervention_areas: publicStringList(professional.intervention_areas),
    skills: publicStringList(professional.skills),
    experience_years: Number.isFinite(Number(professional.experience_years))
      ? Math.max(0, Number(professional.experience_years))
      : null,
    professional_summary: publicString(professional.professional_summary, 3000),
  };
}
