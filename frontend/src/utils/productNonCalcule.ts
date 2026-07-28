const isTruthyFlag = (value: unknown): boolean => (
  value === true || value === 1 || value === '1' || value === 'true'
);

export const isProductNonCalcule = (item: any, products: any[] = []): boolean => {
  if ([
    item?.rappel_non_calcule,
    item?.product_non_calcule,
    item?.non_calcule,
    item?.product?.rappel_non_calcule,
    item?.produit?.rappel_non_calcule,
  ].some(isTruthyFlag)) {
    return true;
  }

  const productId = item?.product_id ?? item?.produit_id ?? item?.product?.id ?? item?.produit?.id;
  if (productId === null || productId === undefined || productId === '') return false;

  const product = products.find((candidate) => String(candidate?.id) === String(productId));
  return isTruthyFlag(product?.rappel_non_calcule);
};

export const getCalculatedBonAmount = (
  rawItems: unknown,
  products: any[] = [],
  fallback = 0,
): number => {
  let items: any[] = [];
  if (Array.isArray(rawItems)) {
    items = rawItems;
  } else if (typeof rawItems === 'string') {
    try {
      const parsed = JSON.parse(rawItems);
      if (Array.isArray(parsed)) items = parsed;
    } catch {
      return fallback;
    }
  }

  if (items.length === 0) return fallback;

  return items.reduce((sum, item) => {
    if (isProductNonCalcule(item, products)) return sum;
    const quantity = Number(item?.quantite ?? item?.quantity ?? item?.qty ?? 0) || 0;
    const lineTotal = Number(item?.total ?? item?.subtotal);
    if (Number.isFinite(lineTotal)) return sum + lineTotal;
    const unitPrice = Number(item?.prix_unitaire ?? item?.unit_price ?? 0) || 0;
    return sum + unitPrice * quantity;
  }, 0);
};
