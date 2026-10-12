// Keep the default offer, image, stock and first selected variant aligned.
// A zero price is not a usable default when another variant has a price.
export function prioritizeDefaultVariant(variants, required) {
  if (Number(required) !== 1 || variants.length < 2) return variants;
  const priced = (variant) => Number.isFinite(Number(variant.prix_vente)) && Number(variant.prix_vente) > 0;
  const available = (variant) => variant.available === undefined
    ? Number(variant.stock_quantity) > 0
    : variant.available === true;
  let index = variants.findIndex((variant) => priced(variant) && available(variant));
  if (index < 0) index = variants.findIndex(priced);
  if (index <= 0) return variants;
  return [variants[index], ...variants.slice(0, index), ...variants.slice(index + 1)];
}

// Used on a derived table so these aliases refer to effective snapshot values.
export const DEFAULT_VARIANT_ORDER_SQL = `
  CASE WHEN prix_vente > 0 AND stock_quantity > 0 THEN 0
       WHEN prix_vente > 0 THEN 1 ELSE 2 END,
  variant_type, variant_name, id`;
