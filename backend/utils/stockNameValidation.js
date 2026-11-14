// Stock is paginated by product, with product/variant rows expanded afterwards.
// Select every product that still has at least one entity without a Correct review.
export const UNVALIDATED_STOCK_NAME_SQL = `(
  NOT EXISTS (
    SELECT 1 FROM product_name_corrections pnc_stock
    WHERE pnc_stock.matched_product_id = p.id
      AND COALESCE(pnc_stock.matched_variant_id, 0) = 0
      AND pnc_stock.review_status = 'correct'
  )
  OR EXISTS (
    SELECT 1 FROM product_variants pv_unreviewed
    WHERE pv_unreviewed.product_id = p.id AND COALESCE(pv_unreviewed.is_deleted, 0) = 0
      AND NOT EXISTS (
        SELECT 1 FROM product_name_corrections pnc_stock_variant
        WHERE pnc_stock_variant.matched_product_id = p.id
          AND pnc_stock_variant.matched_variant_id = pv_unreviewed.id
          AND pnc_stock_variant.review_status = 'correct'
      )
  )
)`;

export function stockNameValidationSql({ missingImage = false } = {}) {
  if (!missingImage) return UNVALIDATED_STOCK_NAME_SQL;
  return UNVALIDATED_STOCK_NAME_SQL
    .replace('  NOT EXISTS (', "  NULLIF(TRIM(p.image_url), '') IS NULL AND NOT EXISTS (")
    .replace('AND COALESCE(pv_unreviewed.is_deleted, 0) = 0', "AND COALESCE(pv_unreviewed.is_deleted, 0) = 0 AND NULLIF(TRIM(pv_unreviewed.image_url), '') IS NULL");
}

export async function hasNameCorrectionsTable(db) {
  const [rows] = await db.query(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_name_corrections' LIMIT 1`
  );
  return rows.length > 0;
}

export function markStockNameValidation(products, corrections) {
  const approved = new Set(corrections.map(row => `${Number(row.matched_product_id)}:${Number(row.matched_variant_id || 0)}`));
  for (const product of products) {
    product.name_validation_filter = true;
    product.name_validation_correct = approved.has(`${Number(product.id)}:0`);
    for (const variant of product.variants || []) {
      variant.name_validation_correct = approved.has(`${Number(product.id)}:${Number(variant.id)}`);
    }
  }
  return products;
}

export async function loadStockNameValidation(db, products, tableExists) {
  if (!products.length) return products;
  const [rows] = tableExists ? await db.query(
    `SELECT DISTINCT matched_product_id, matched_variant_id FROM product_name_corrections
     WHERE review_status = 'correct' AND matched_product_id IN (?)`,
    [products.map(product => Number(product.id))]
  ) : [[]];
  return markStockNameValidation(products, rows);
}
