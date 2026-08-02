function hasNoImage(value) {
  return String(value ?? '').trim() === '';
}

export function isStockRowMissingImage(row) {
  if (row?.isVariantRow) return hasNoImage(row?.variant_image_url);
  return hasNoImage(row?.image_url);
}

export function filterStockRowsByMissingImage(rows, enabled) {
  if (!enabled) return rows;
  return rows.filter(isStockRowMissingImage);
}
