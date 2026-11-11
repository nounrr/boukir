export function calculatePurchaseIncrease(reference, purchasePrice, factor = 1) {
  const previous = Number(reference.prix_achat);
  const next = Number(purchasePrice) / Number(factor);
  if (!(previous > 0) || !(factor > 0) || !Number.isFinite(next) || next <= previous) return null;
  const ratio = next / previous;
  const previousCost = Number(reference.cout_revient ?? previous * (1 + Number(reference.cout_revient_pourcentage || 0) / 100));
  const previousWholesale = Number(reference.prix_gros ?? previous * (1 + Number(reference.prix_gros_pourcentage || 0) / 100));
  return {
    previous_purchase_price: previous,
    purchase_price: next,
    percentage: (ratio - 1) * 100,
    previous_sale_price: Number(reference.prix_vente || 0),
    previous_sale_price_2: Number(reference.prix_vente_2 || 0),
    previous_cost_price: previousCost,
    previous_wholesale_price: previousWholesale,
    sale_price: Number((Number(reference.prix_vente || 0) * ratio).toFixed(4)),
    sale_price_2: Number((Number(reference.prix_vente_2 || 0) * ratio).toFixed(4)),
    cost_price: Number((previousCost * ratio).toFixed(4)),
    wholesale_price: Number((previousWholesale * ratio).toFixed(4)),
    cost_percentage: Math.min(999.99, Math.max(-999.99, Number(((previousCost / previous - 1) * 100).toFixed(2)))),
    wholesale_percentage: Math.min(999.99, Math.max(-999.99, Number(((previousWholesale / previous - 1) * 100).toFixed(2)))),
  };
}

export async function getPurchaseIncrease(connection, item) {
  const [products] = await connection.query(`
    SELECT p.est_service,
      COALESCE(pv.prix_achat, p.prix_achat) AS prix_achat,
      COALESCE(pv.prix_vente, p.prix_vente) AS prix_vente,
      COALESCE(pv.prix_vente_2, p.prix_vente_2) AS prix_vente_2,
      COALESCE(pv.cout_revient, p.cout_revient) AS cout_revient,
      COALESCE(pv.prix_gros, p.prix_gros) AS prix_gros,
      COALESCE(pv.cout_revient_pourcentage, p.cout_revient_pourcentage) AS cout_revient_pourcentage,
      COALESCE(pv.prix_gros_pourcentage, p.prix_gros_pourcentage) AS prix_gros_pourcentage
    FROM products p
    LEFT JOIN product_variants pv ON pv.id = ? AND pv.product_id = p.id
    WHERE p.id = ? AND (? IS NULL OR pv.id IS NOT NULL)
  `, [item.variant_id || null, item.product_id, item.variant_id || null]);
  if (!products.length || Number(products[0].est_service)) return null;
  const [snapshots] = await connection.query(
    `SELECT prix_achat, prix_vente, prix_vente_2, cout_revient, prix_gros,
      cout_revient_pourcentage, prix_gros_pourcentage
     FROM product_snapshot WHERE product_id = ? AND variant_id <=> ? ORDER BY created_at DESC, id DESC LIMIT 1`,
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
