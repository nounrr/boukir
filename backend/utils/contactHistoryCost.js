// History costs are per selected sale unit, just like prix_unitaire.
// The weighted snapshot cost remains in the product's base unit until conversion.
export const historyItemCostExpr = (itemAlias, { snapshotAlias = 'ps' } = {}) => `(COALESCE((
  SELECT SUM(COALESCE(ps_avg.cout_revient, 0) * ci_avg.quantite) / NULLIF(SUM(ci_avg.quantite), 0)
  FROM product_snapshot ps_avg
  JOIN commande_items ci_avg ON ci_avg.product_snapshot_id = ps_avg.id
  WHERE ps_avg.product_id = ${itemAlias}.product_id
    AND ((${snapshotAlias ? `COALESCE(${itemAlias}.variant_id, ${snapshotAlias}.variant_id)` : `${itemAlias}.variant_id`} IS NULL AND ps_avg.variant_id IS NULL)
      OR ps_avg.variant_id <=> ${snapshotAlias ? `COALESCE(${itemAlias}.variant_id, ${snapshotAlias}.variant_id)` : `${itemAlias}.variant_id`})
    AND ci_avg.quantite IS NOT NULL
    AND ci_avg.quantite <> 0
    AND ps_avg.cout_revient IS NOT NULL
), (
  SELECT COALESCE(pv_cost.cout_revient, pv_cost.prix_achat)
  FROM product_variants pv_cost
  WHERE pv_cost.id = ${itemAlias}.variant_id
  LIMIT 1
), p.cout_revient, ${snapshotAlias ? `${snapshotAlias}.cout_revient, ` : ''}p.prix_achat, ${snapshotAlias ? `${snapshotAlias}.prix_achat, ` : ''}0) * COALESCE(pu.conversion_factor, 1))`;
