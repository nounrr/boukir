export function buildProductDeltaMap(items = [], multiplier = 1) {
  const map = new Map();
  if (!Array.isArray(items)) return map;

  for (const item of items) {
    const productId = Number(item?.product_id);
    const qty = Number(item?.quantite);
    if (!Number.isFinite(productId) || productId <= 0) continue;
    if (!Number.isFinite(qty) || qty === 0) continue;

    const delta = qty * multiplier;
    map.set(productId, (map.get(productId) || 0) + delta);
  }

  return map;
}

export function buildStockDeltaMaps(items = [], multiplier = 1) {
  const productDeltas = new Map();
  const variantDeltas = new Map();

  if (!Array.isArray(items)) return { productDeltas, variantDeltas };

  for (const item of items) {
    const qty = Number(item?.quantite);
    if (!Number.isFinite(qty) || qty === 0) continue;

    const delta = qty * multiplier;
    const variantId = Number(item?.variant_id);
    if (Number.isFinite(variantId) && variantId > 0) {
      variantDeltas.set(variantId, (variantDeltas.get(variantId) || 0) + delta);
      continue;
    }

    const productId = Number(item?.product_id);
    if (!Number.isFinite(productId) || productId <= 0) continue;
    productDeltas.set(productId, (productDeltas.get(productId) || 0) + delta);
  }

  return { productDeltas, variantDeltas };
}

export function mergeDeltaMaps(target, source) {
  if (!(target instanceof Map) || !(source instanceof Map)) return target;
  for (const [productId, delta] of source.entries()) {
    if (!delta) continue;
    target.set(productId, (target.get(productId) || 0) + delta);
  }
  return target;
}

export function mergeStockDeltaMaps(target, source) {
  if (!target || !source) return target;
  const tp = target.productDeltas;
  const tv = target.variantDeltas;
  const sp = source.productDeltas;
  const sv = source.variantDeltas;
  if (!(tp instanceof Map) || !(tv instanceof Map) || !(sp instanceof Map) || !(sv instanceof Map)) return target;

  mergeDeltaMaps(tp, sp);
  mergeDeltaMaps(tv, sv);
  return target;
}

export async function applyProductStockDeltas(connection, deltas, updatedBy = null) {
  if (!deltas || !(deltas instanceof Map) || deltas.size === 0) return;

  const productIds = Array.from(deltas.keys());
  if (productIds.length === 0) return;

  // Lock product rows to avoid concurrent stock races
  await connection.execute('SELECT id FROM products WHERE id IN (?) FOR UPDATE', [productIds]);

  for (const productId of productIds) {
    const delta = Number(deltas.get(productId));
    if (!Number.isFinite(delta) || delta === 0) continue;

    await connection.execute(
      `UPDATE products
          SET quantite = COALESCE(quantite, 0) + ?,
              updated_by = ?,
              updated_at = NOW()
        WHERE id = ?`,
      [delta, updatedBy ?? null, productId]
    );
  }
}

export async function applyStockDeltas(connection, deltaMaps, updatedBy = null) {
  if (!deltaMaps) return;
  const productDeltas = deltaMaps.productDeltas;
  const variantDeltas = deltaMaps.variantDeltas;

  if (productDeltas instanceof Map && productDeltas.size > 0) {
    await applyProductStockDeltas(connection, productDeltas, updatedBy);
  }

  if (!(variantDeltas instanceof Map) || variantDeltas.size === 0) return;

  const variantIds = Array.from(variantDeltas.keys());
  if (variantIds.length === 0) return;

  // Lock variant rows to avoid concurrent stock races
  await connection.execute('SELECT id FROM product_variants WHERE id IN (?) FOR UPDATE', [variantIds]);

  for (const variantId of variantIds) {
    const delta = Number(variantDeltas.get(variantId));
    if (!Number.isFinite(delta) || delta === 0) continue;

    await connection.execute(
      `UPDATE product_variants
          SET stock_quantity = COALESCE(stock_quantity, 0) + ?,
              updated_at = NOW()
        WHERE id = ?`,
      [delta, variantId]
    );
  }
}
