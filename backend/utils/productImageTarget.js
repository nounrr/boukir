export const PRODUCT_IMAGE_TARGETS = Object.freeze({
  MAIN_AND_GALLERY: 'main_and_gallery',
  GALLERY: 'gallery',
});

const allowedTargets = new Set(Object.values(PRODUCT_IMAGE_TARGETS));

export function parseProductImageTarget(value) {
  return typeof value === 'string' && allowedTargets.has(value) ? value : null;
}

export function isMissingImageFilterEnabled(value) {
  return value === true || value === 1 || ['true', '1'].includes(String(value || '').toLowerCase());
}
