import { DEFAULT_VARIANT_ORDER_SQL } from './ecommerceDefaultVariant.js';

const snapshotChecks = new WeakMap();
export async function hasProductSnapshotTable(db) {
  if (!snapshotChecks.has(db)) {
    const pending = db.query(`SELECT COUNT(*) AS cnt FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'product_snapshot'`)
      .then(([rows]) => Number(rows?.[0]?.cnt || 0) > 0)
      .catch(error => { snapshotChecks.delete(db); throw error; });
    snapshotChecks.set(db, pending);
  }
  return snapshotChecks.get(db);
}

// Use the card's selected variant, validated snapshot and promotion for both lists.
export function ecommerceOfferPriceSql(snapshotEnabled) {
  const price = snapshotEnabled ? `COALESCE((
    SELECT NULLIF(ps.prix_vente, 0) FROM product_snapshot ps
    WHERE ps.product_id = p.id AND ps.variant_id IS NULL AND COALESCE(ps.en_validation, 0) <> 0
    ORDER BY CASE WHEN ps.quantite > 0 THEN 0 ELSE 1 END, ps.created_at ASC, ps.id ASC LIMIT 1
  ), p.prix_vente)` : 'p.prix_vente';
  const variantPrice = snapshotEnabled ? `COALESCE((
    SELECT NULLIF(ps.prix_vente, 0) FROM product_snapshot ps
    WHERE ps.variant_id = pv.id AND COALESCE(ps.en_validation, 0) <> 0
    ORDER BY CASE WHEN ps.quantite > 0 THEN 0 ELSE 1 END, ps.created_at ASC, ps.id ASC LIMIT 1
  ), pv.prix_vente)` : 'pv.prix_vente';
  const variantStock = snapshotEnabled ? `(SELECT COALESCE(SUM(ps.quantite), 0) FROM product_snapshot ps
    WHERE ps.variant_id = pv.id AND COALESCE(ps.en_validation, 0) <> 0)` : 'pv.stock_quantity';
  return `(CASE WHEN p.has_variants <> 0 AND p.is_obligatoire_variant = 1 THEN COALESCE((
    SELECT COALESCE(prix_vente, 0) FROM (
      SELECT pv.id, pv.variant_type, pv.variant_name, ${variantPrice} AS prix_vente, ${variantStock} AS stock_quantity
      FROM product_variants pv WHERE pv.product_id = p.id AND COALESCE(pv.is_deleted, 0) = 0
    ) effective_variants ORDER BY ${DEFAULT_VARIANT_ORDER_SQL} LIMIT 1
  ), ${price}) ELSE ${price} END) * (
    CASE WHEN p.pourcentage_promo > 0 AND p.pourcentage_promo <> 100
    THEN 1 - p.pourcentage_promo / 100 ELSE 1 END
  )`;
}
