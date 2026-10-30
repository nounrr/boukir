export function calculatePurchaseIncrease(reference, purchasePrice, factor = 1) {
  const previous = Number(reference.prix_achat);
  const next = Number(purchasePrice) / Number(factor);
  if (!(previous > 0) || !(factor > 0) || !Number.isFinite(next) || next <= previous) return null;
  const ratio = next / previous;
  return {
    previous_purchase_price: previous,
    purchase_price: next,
    percentage: (ratio - 1) * 100,
    previous_sale_price: Number(reference.prix_vente || 0),
    previous_sale_price_2: Number(reference.prix_vente_2 || 0),
    sale_price: Number((Number(reference.prix_vente || 0) * ratio).toFixed(4)),
    sale_price_2: Number((Number(reference.prix_vente_2 || 0) * ratio).toFixed(4)),
  };
}

export async function getPurchaseIncrease(connection, item) {
  const [products] = await connection.query('SELECT prix_achat, prix_vente, prix_vente_2, est_service FROM products WHERE id = ?', [item.product_id]);
  if (!products.length || Number(products[0].est_service)) return null;
  const [snapshots] = await connection.query(
    'SELECT prix_achat, prix_vente, prix_vente_2 FROM product_snapshot WHERE product_id = ? AND variant_id <=> ? ORDER BY created_at DESC, id DESC LIMIT 1',
    [item.product_id, item.variant_id || null]
  );
  let factor = 1;
  if (item.unit_id) {
    const [units] = await connection.query('SELECT conversion_factor FROM product_units WHERE id = ? AND product_id = ?', [item.unit_id, item.product_id]);
    if (!units.length) throw new Error('Unité du produit invalide');
    factor = Number(units[0].conversion_factor);
  }
  return calculatePurchaseIncrease(snapshots[0] || products[0], item.prix_unitaire, factor);
}
