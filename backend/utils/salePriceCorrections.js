const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const salePriceEntityKey = (productId, variantId) =>
  `${Number(productId)}:${variantId == null ? 'base' : Number(variantId)}`;

export function buildSellableEntities(products = [], variants = []) {
  const activeVariants = new Map();
  for (const variant of variants) {
    if (Number(variant?.is_deleted || 0) !== 0) continue;
    const list = activeVariants.get(Number(variant.product_id)) || [];
    list.push(variant);
    activeVariants.set(Number(variant.product_id), list);
  }

  return products.flatMap((product) => {
    const productVariants = activeVariants.get(Number(product.id)) || [];
    if (productVariants.length) {
      return productVariants.map((variant) => ({
        product_id: Number(product.id),
        variant_id: Number(variant.id),
        product,
        variant,
      }));
    }
    return [{ product_id: Number(product.id), variant_id: null, product, variant: null }];
  });
}

export function resolveCurrentSalePrice({ snapshots = [], field, variantPrice, productPrice }) {
  const candidates = snapshots.filter((snapshot) => {
    const enabled = snapshot.en_validation == null ? true : Number(snapshot.en_validation) !== 0;
    const valid = snapshot.valid == null ? true : Number(snapshot.valid) !== 0;
    return enabled && valid && toNumber(snapshot[field]) > 0;
  });

  if (candidates.length) {
    const stocked = candidates.filter((snapshot) => toNumber(snapshot.quantite) > 0);
    const pool = stocked.length ? stocked : candidates;
    const selected = [...pool].sort((a, b) => {
      const priority = toNumber(a.fifo_priority, 999999) - toNumber(b.fifo_priority, 999999);
      if (priority) return priority;
      const dateA = new Date(a.snapshot_created_at ?? a.created_at ?? 0).getTime() || 0;
      const dateB = new Date(b.snapshot_created_at ?? b.created_at ?? 0).getTime() || 0;
      if (dateA !== dateB) return dateA - dateB;
      return toNumber(a.snapshot_id ?? a.id) - toNumber(b.snapshot_id ?? b.id);
    })[0];
    return { value: toNumber(selected[field]), source: 'snapshot', snapshot_id: Number(selected.snapshot_id ?? selected.id) };
  }

  if (toNumber(variantPrice) > 0) return { value: toNumber(variantPrice), source: 'variant', snapshot_id: null };
  return { value: toNumber(productPrice), source: 'product', snapshot_id: null };
}

export function rankHistoricalPrices(lines = [], direction = 'desc', limit = 3) {
  const grouped = new Map();
  for (const line of lines) {
    const status = String(line?.statut ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (status.startsWith('annul') || status === 'avoir') continue;
    if (Number(line?.vendre_au_fournisseur || 0) !== 0) continue;
    if (Number(line?.is_indisponible || 0) !== 0) continue;
    if (line?.facteur_isNormal != null && Number(line.facteur_isNormal) === 0) continue;
    const factor = line?.conversion_factor == null ? 1 : toNumber(line.conversion_factor);
    const rawPrice = toNumber(line?.prix_unitaire);
    if (!(rawPrice > 0) || !(factor > 0)) continue;
    const price = Math.round((rawPrice / factor + Number.EPSILON) * 10000) / 10000;
    if (!(price > 0)) continue;
    const current = grouped.get(price) || { price, usage_count: 0, quantity_sold: 0, last_used_at: null };
    current.usage_count += 1;
    current.quantity_sold += Math.max(0, toNumber(line?.quantite)) * factor;
    const date = line?.date_creation ?? line?.created_at ?? null;
    if (date && (!current.last_used_at || new Date(date) > new Date(current.last_used_at))) current.last_used_at = date;
    grouped.set(price, current);
  }
  return [...grouped.values()]
    .sort((a, b) => direction === 'asc' ? a.price - b.price : b.price - a.price)
    .slice(0, limit);
}

export const salePricesMatch = (a, b) => Math.abs(toNumber(a) - toNumber(b)) < 0.005;

export const snapshotMatchesEntity = (snapshot, productId, variantId) =>
  Number(snapshot?.product_id) === Number(productId)
  && (snapshot?.variant_id == null ? null : Number(snapshot.variant_id)) === (variantId == null ? null : Number(variantId));
