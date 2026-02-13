export async function getLastBonCommandeMaps(connection, items) {
  const normalizedItems = Array.isArray(items) ? items : [];

  const productIds = Array.from(
    new Set(normalizedItems.map(it => it?.product_id).filter(Boolean).map(Number))
  );

  const variantIds = Array.from(
    new Set(normalizedItems.map(it => it?.variant_id).filter(v => v != null && v !== '').map(Number))
  );

  const productMap = new Map();      // product_id → last_boncommande_id
  const variantMap = new Map();      // variant_id → last_boncommande_id
  const prixAchatMap = new Map();    // product_id → prix_achat (current)

  if (productIds.length > 0) {
    const [rows] = await connection.execute(
      `SELECT id, last_boncommande_id, prix_achat FROM products WHERE id IN (${productIds.map(() => '?').join(',')})`,
      productIds
    );
    for (const r of rows || []) {
      productMap.set(Number(r.id), r.last_boncommande_id ?? null);
      prixAchatMap.set(Number(r.id), r.prix_achat ?? null);
    }
  }

  if (variantIds.length > 0) {
    const [rows] = await connection.execute(
      `SELECT id, last_boncommande_id FROM product_variants WHERE id IN (${variantIds.map(() => '?').join(',')})`,
      variantIds
    );
    for (const r of rows || []) variantMap.set(Number(r.id), r.last_boncommande_id ?? null);
  }

  return { productMap, variantMap, prixAchatMap };
}
