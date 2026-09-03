const SALE_TYPES = new Set(['Sortie', 'Comptant', 'Devis']);

export function meetsEmployeeSalePrice(price, cost) {
  const salePrice = Number(price);
  const costPrice = Number(cost);
  const minimum = Math.ceil((costPrice * 1.03 - 1e-9) * 100) / 100;
  return Number.isFinite(salePrice) && Number.isFinite(costPrice)
    && salePrice > 0 && costPrice >= 0
    && salePrice + 1e-9 >= minimum;
}

// Resolve costs and conversion factors from the database, never from the request.
export async function validateEmployeeSalePrices(connection, rawItems, { role, type }) {
  if (role !== 'Employé' || !SALE_TYPES.has(type)) return null;
  const items = Array.isArray(rawItems) ? rawItems : [];
  if (!items.length) return null;
  const productIds = [...new Set(items.map((item) => Number(item?.product_id))
    .filter((id) => Number.isInteger(id) && id > 0))];
  if (!productIds.length) return { code: 'EMPLOYEE_MINIMUM_SALE_PRICE', message: 'Produit invalide. Contactez un responsable.' };
  const [products] = await connection.query(
    'SELECT id, est_service, cout_revient, prix_achat FROM products WHERE id IN (?)', [productIds]
  );
  const [variants] = await connection.query(
    'SELECT id, product_id, cout_revient, prix_achat FROM product_variants WHERE product_id IN (?)', [productIds]
  );
  const [units] = await connection.query(
    'SELECT id, product_id, conversion_factor, is_default, facteur_isNormal FROM product_units WHERE product_id IN (?)', [productIds]
  );
  const [averages] = await connection.query(
    `SELECT ps.product_id, ps.variant_id,
       SUM(ps.cout_revient * ci.quantite) / NULLIF(SUM(ci.quantite), 0) AS cout_revient
     FROM product_snapshot ps
     JOIN commande_items ci ON ci.product_snapshot_id = ps.id
     WHERE ps.product_id IN (?) AND ci.quantite IS NOT NULL AND ci.quantite <> 0
       AND ps.cout_revient IS NOT NULL
     GROUP BY ps.product_id, ps.variant_id`, [productIds]
  );
  const snapshotIds = items.map((item) => Number(item?.product_snapshot_id)).filter((id) => id > 0);
  const [snapshots] = snapshotIds.length
    ? await connection.query('SELECT id, product_id, variant_id, cout_revient, prix_achat FROM product_snapshot WHERE id IN (?)', [snapshotIds])
    : [[]];
  const key = (productId, variantId) => `${Number(productId)}:${Number(variantId) || 0}`;
  const productMap = new Map(products.map((row) => [Number(row.id), row]));
  const variantMap = new Map(variants.map((row) => [Number(row.id), row]));
  const unitMap = new Map(units.map((row) => [Number(row.id), row]));
  const snapshotMap = new Map(snapshots.map((row) => [Number(row.id), row]));
  const averageMap = new Map(averages.filter((row) => row.cout_revient != null)
    .map((row) => [key(row.product_id, row.variant_id), Number(row.cout_revient)]));
  const invalidRows = [];
  for (const [index, item] of items.entries()) {
    const productId = Number(item?.product_id);
    const product = productMap.get(productId);
    const variant = variantMap.get(Number(item?.variant_id));
    const unit = unitMap.get(Number(item?.unit_id));
    const snapshot = snapshotMap.get(Number(item?.product_snapshot_id));
    if (!product
      || (item?.variant_id && (!variant || Number(variant.product_id) !== productId))
      || (item?.unit_id && (!unit || Number(unit.product_id) !== productId))
      || (item?.product_snapshot_id && (!snapshot || key(snapshot.product_id, snapshot.variant_id) !== key(productId, item.variant_id)))) {
      invalidRows.push(index + 1);
      continue;
    }
    const factor = !unit || Number(unit.is_default) === 1 || Number(unit.facteur_isNormal) === 1
      ? 1 : Number(unit.conversion_factor);
    const fallbackCost = Number(variant?.cout_revient) || Number(variant?.prix_achat)
      || Number(product.cout_revient) || Number(product.prix_achat)
      || Number(snapshot?.cout_revient) || Number(snapshot?.prix_achat) || 0;
    const baseCost = Number(product.est_service) === 1 ? 0
      : (averageMap.get(key(productId, item.variant_id)) ?? fallbackCost);
    if (!Number.isFinite(factor) || factor <= 0 || !meetsEmployeeSalePrice(item.prix_unitaire, baseCost * factor)) {
      invalidRows.push(index + 1);
    }
  }
  return invalidRows.length ? {
    code: 'EMPLOYEE_MINIMUM_SALE_PRICE',
    message: `Prix de vente inférieur au minimum autorisé (lignes ${invalidRows.join(', ')}). Contactez un responsable.`,
    line_numbers: invalidRows,
  } : null;
}
