export const ARTISAN_REGISTRATION_PATHS = Object.freeze(['ecommerce', 'maalem']);

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function parseMaalemRegistrationIntent(body) {
  const value = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const isArtisanRequest = value.type_compte === 'Artisan/Promoteur';
  const rawPath = value.artisan_path;
  const hasCategory = value.maalem_category_id !== undefined
    && value.maalem_category_id !== null
    && value.maalem_category_id !== '';

  if (!isArtisanRequest) {
    if (rawPath === 'maalem' || hasCategory) {
      return { valid: false, error: 'Le parcours Maalem est réservé à une inscription Artisan' };
    }
    return {
      valid: true,
      is_artisan_request: false,
      artisan_path: null,
      wants_maalem: false,
      category_id: null,
    };
  }

  const artisanPath = rawPath == null || rawPath === '' ? 'ecommerce' : rawPath;
  if (!ARTISAN_REGISTRATION_PATHS.includes(artisanPath)) {
    return { valid: false, error: 'Parcours Artisan invalide' };
  }

  if (artisanPath === 'ecommerce' && hasCategory) {
    return { valid: false, error: 'Une catégorie Maalem ne peut pas être associée à un Artisan e-commerce simple' };
  }

  if (hasCategory && !isPositiveInteger(value.maalem_category_id)) {
    return { valid: false, error: 'Identifiant de catégorie Maalem invalide' };
  }

  return {
    valid: true,
    is_artisan_request: true,
    artisan_path: artisanPath,
    wants_maalem: artisanPath === 'maalem',
    category_id: hasCategory ? value.maalem_category_id : null,
  };
}

export function canManagePendingMaalemApplication(contact, profile) {
  const isApprovedArtisan = contact?.type_compte === 'Artisan/Promoteur'
    || contact?.artisan_approuve === true
    || contact?.artisan_approuve === 1
    || contact?.artisan_approuve === '1';
  if (isApprovedArtisan) return true;

  const hasPendingArtisanRequest = contact?.demande_artisan === true
    || contact?.demande_artisan === 1
    || contact?.demande_artisan === '1';
  return Boolean(
    hasPendingArtisanRequest
    && profile
    && ['draft', 'rejected'].includes(profile.status)
  );
}
