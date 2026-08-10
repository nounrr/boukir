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

  const productIds = Array.from(deltas.keys()).sort((a, b) => Number(a) - Number(b));
  if (productIds.length === 0) return;

  // Lock product rows to avoid concurrent stock races
  await connection.execute('SELECT id FROM products WHERE id IN (?) FOR UPDATE', [productIds]);

  const effectiveDeltas = productIds
    .map((productId) => [productId, Number(deltas.get(productId))])
    .filter(([, delta]) => Number.isFinite(delta) && delta !== 0);
  if (effectiveDeltas.length === 0) return;

  const cases = [];
  const params = [];
  for (const [productId, delta] of effectiveDeltas) {
    cases.push('WHEN ? THEN ?');
    params.push(productId, delta);
  }

  await connection.query(
    `UPDATE products
        SET quantite = COALESCE(quantite, 0) + CASE id ${cases.join(' ')} ELSE 0 END,
            updated_by = ?,
            updated_at = NOW()
      WHERE id IN (?)`,
    [...params, updatedBy ?? null, effectiveDeltas.map(([productId]) => productId)]
  );
}

export async function applyStockDeltas(connection, deltaMaps, updatedBy = null) {
  if (!deltaMaps) return;
  const productDeltas = deltaMaps.productDeltas;
  const variantDeltas = deltaMaps.variantDeltas;

  if (productDeltas instanceof Map && productDeltas.size > 0) {
    await applyProductStockDeltas(connection, productDeltas, updatedBy);
  }

  if (!(variantDeltas instanceof Map) || variantDeltas.size === 0) return;

  const variantIds = Array.from(variantDeltas.keys()).sort((a, b) => Number(a) - Number(b));
  if (variantIds.length === 0) return;

  // Lock variant rows to avoid concurrent stock races
  await connection.execute('SELECT id FROM product_variants WHERE id IN (?) FOR UPDATE', [variantIds]);

  const effectiveDeltas = variantIds
    .map((variantId) => [variantId, Number(variantDeltas.get(variantId))])
    .filter(([, delta]) => Number.isFinite(delta) && delta !== 0);
  if (effectiveDeltas.length === 0) return;

  const cases = [];
  const params = [];
  for (const [variantId, delta] of effectiveDeltas) {
    cases.push('WHEN ? THEN ?');
    params.push(variantId, delta);
  }

  await connection.query(
    `UPDATE product_variants
        SET stock_quantity = COALESCE(stock_quantity, 0) + CASE id ${cases.join(' ')} ELSE 0 END,
            updated_at = NOW()
      WHERE id IN (?)`,
    [...params, effectiveDeltas.map(([variantId]) => variantId)]
  );
}

export async function decrementSnapshotQuantities(connection, items = []) {
  const quantities = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const snapshotId = Number(item?.product_snapshot_id);
    const quantity = Number(item?.quantite);
    if (!Number.isInteger(snapshotId) || snapshotId <= 0) continue;
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    quantities.set(snapshotId, (quantities.get(snapshotId) || 0) + quantity);
  }
  const snapshotIds = [...quantities.keys()].sort((a, b) => a - b);
  if (!snapshotIds.length) return;

  await connection.execute('SELECT id FROM product_snapshot WHERE id IN (?) FOR UPDATE', [snapshotIds]);
  const cases = [];
  const params = [];
  for (const snapshotId of snapshotIds) {
    cases.push('WHEN ? THEN GREATEST(quantite - ?, 0)');
    params.push(snapshotId, quantities.get(snapshotId));
  }
  await connection.query(
    `UPDATE product_snapshot
        SET quantite = CASE id ${cases.join(' ')} ELSE quantite END
      WHERE id IN (?)`,
    [...params, snapshotIds]
  );
}
