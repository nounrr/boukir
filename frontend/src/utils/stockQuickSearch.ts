export interface StockSearchOption {
  key: string;
  product: any;
  variant: any | null;
  productId: number;
  variantId: number | null;
  reference: string;
  designation: string;
  variantName: string;
  variantReference: string;
  stock: number;
  baseUnit: string;
}

export interface StockDisplayPrices {
  prixAchat: number | null;
  coutRevient: number | null;
  prixGros: number | null;
  prixVente: number | null;
  prixVente2: number | null;
}

const finiteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const positiveNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    const number = finiteNumber(value);
    if (number !== null && number > 0) return number;
  }
  return null;
};

const stockNumber = (...values: unknown[]): number => {
  for (const value of values) {
    const number = finiteNumber(value);
    if (number !== null) return number;
  }
  return 0;
};

const normalized = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('fr');

const isDuplicateSingleVariant = (product: any, variant: any) => {
  const variantName = normalized(variant?.variant_name);
  const variantReference = normalized(variant?.reference);
  if (!variantName && !variantReference) return true;
  return variantName === normalized(product?.designation)
    && (!variantReference
      || variantReference === normalized(product?.reference)
      || variantReference === normalized(product?.reference_2));
};

export const buildStockSearchOptions = (products: any[] = []): StockSearchOption[] => {
  const options: StockSearchOption[] = [];

  for (const product of products) {
    const variants = Array.isArray(product?.variants) ? product.variants.filter(Boolean) : [];
    const baseOption: StockSearchOption = {
      key: `product-${product.id}`,
      product,
      variant: null,
      productId: Number(product.id),
      variantId: null,
      reference: String(product.reference_2 || product.reference || product.id || ''),
      designation: String(product.designation || ''),
      variantName: '',
      variantReference: '',
      stock: stockNumber(product.snapshot_quantite_total, product.quantite),
      baseUnit: String(product.base_unit || 'u'),
    };

    if (variants.length === 1 && isDuplicateSingleVariant(product, variants[0])) {
      options.push(baseOption);
      continue;
    }

    const variantRequired = Boolean(product?.isObligatoireVariant || product?.is_obligatoire_variant);
    if (!variantRequired || variants.length === 0) options.push(baseOption);

    for (const variant of variants) {
      options.push({
        ...baseOption,
        key: `product-${product.id}-variant-${variant.id}`,
        variant,
        variantId: Number(variant.id),
        variantName: String(variant.variant_name || ''),
        variantReference: String(variant.reference || ''),
        stock: stockNumber(variant.snapshot_quantite_total, variant.stock_quantity),
      });
    }
  }

  return options;
};

const activeSnapshotsFor = (rows: any[], productId: number, variantId: number | null) => rows.filter((row) => (
  row?.snapshot_id
  && String(row.id) === String(productId)
  && String(row.variant_id || '') === String(variantId || '')
  && (row.snapshot_en_validation == null || Number(row.snapshot_en_validation) !== 0)
));

const newestSnapshot = (rows: any[]) => [...rows].sort((a, b) => {
  const dateA = new Date(a.bon_commande_date_creation ?? a.snapshot_created_at ?? 0).getTime() || 0;
  const dateB = new Date(b.bon_commande_date_creation ?? b.snapshot_created_at ?? 0).getTime() || 0;
  return dateB - dateA || Number(b.snapshot_id || 0) - Number(a.snapshot_id || 0);
})[0] ?? null;

const oldestPricedSnapshot = (rows: any[], field: 'prix_vente' | 'prix_vente_2') => {
  const priced = rows.filter((row) => positiveNumber(row?.[field]) !== null);
  const withStock = priced.filter((row) => stockNumber(row.snapshot_quantite) > 0);
  return [...(withStock.length ? withStock : priced)].sort((a, b) => {
    const priorityA = finiteNumber(a.fifo_priority) ?? 999;
    const priorityB = finiteNumber(b.fifo_priority) ?? 999;
    if (priorityA !== priorityB) return priorityA - priorityB;
    const dateA = new Date(a.snapshot_created_at ?? 0).getTime() || 0;
    const dateB = new Date(b.snapshot_created_at ?? 0).getTime() || 0;
    return dateA - dateB || Number(a.snapshot_id || 0) - Number(b.snapshot_id || 0);
  })[0] ?? null;
};

export const resolveStockDisplayPrices = (
  option: StockSearchOption,
  snapshotRows: any[] = [],
): StockDisplayPrices => {
  const { product, variant, productId, variantId } = option;
  const entity = variant || product;
  const rows = activeSnapshotsFor(snapshotRows, productId, variantId);
  const latest = newestSnapshot(rows);
  const oldestPv = oldestPricedSnapshot(rows, 'prix_vente');
  const oldestPv2 = oldestPricedSnapshot(rows, 'prix_vente_2');
  const display = entity?.snapshot_display;
  const displayRows = Array.isArray(display?.rows) ? display.rows : [];
  const displayOldest = [...displayRows].sort((a, b) => (
    (new Date(a?.created_at ?? 0).getTime() || 0) - (new Date(b?.created_at ?? 0).getTime() || 0)
    || Number(a?.id || 0) - Number(b?.id || 0)
  ))[0] ?? display?.data ?? null;

  return {
    prixAchat: positiveNumber(latest?.prix_achat, display?.latest?.prix_achat, entity?.prix_achat, product?.prix_achat),
    coutRevient: positiveNumber(
      entity?.cout_revient_moyen_snapshot,
      latest?.cout_revient_moyen_snapshot,
      latest?.cout_revient,
      display?.data?.cout_revient,
      displayOldest?.cout_revient,
      entity?.cout_revient,
      product?.cout_revient,
    ),
    prixGros: positiveNumber(latest?.prix_gros, displayOldest?.prix_gros, entity?.prix_gros, product?.prix_gros),
    prixVente: positiveNumber(
      oldestPv?.prix_vente,
      displayOldest?.prix_vente,
      entity?.snapshot_prix_vente_old,
      entity?.prix_vente,
      product?.snapshot_prix_vente_old,
      product?.prix_vente,
    ),
    prixVente2: positiveNumber(
      oldestPv2?.prix_vente_2,
      displayOldest?.prix_vente_2,
      entity?.snapshot_prix_vente_2_old,
      entity?.prix_vente_2,
      product?.snapshot_prix_vente_2_old,
      product?.prix_vente_2,
    ),
  };
};

export const formatStockPrice = (value: number | null) => value === null
  ? '—'
  : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(value)} DH`;

