const FINAL_BACKOFFICE_STATUSES = [
  'Validé', 'Valide', 'Livré', 'Livre', 'Payé', 'Paye', 'Facturé', 'Facture',
];

// Production schemas contain a mix of utf8mb4_0900_ai_ci and
// utf8mb4_unicode_ci columns. MySQL requires every character column at the
// same position in a UNION to have a compatible collation, so normalize the
// SKU catalog's text projections explicitly.
const UNION_COLLATION = 'utf8mb4_unicode_ci';

function unionText(expression) {
  return `(CONVERT(${expression} USING utf8mb4) COLLATE ${UNION_COLLATION})`;
}

function unionNullText() {
  return `(CAST(NULL AS CHAR CHARACTER SET utf8mb4) COLLATE ${UNION_COLLATION})`;
}

export const SLOW_MOVING_STOCK_LIMITS = Object.freeze({
  min: 1,
  max: 100,
  default: 20,
});

export function parsePositiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= max ? parsed : fallback;
}

export function isSlowMovingCandidate(stockCurrent, soldQuantity, threshold) {
  return Number(stockCurrent) > 0 && Number(soldQuantity || 0) <= Number(threshold);
}

export function skuKindsForProduct({ hasVariants, mandatoryVariants }) {
  if (!hasVariants) return ['parent'];
  return mandatoryVariants ? ['variant'] : ['parent', 'variant'];
}

function buildBaseCte() {
  const statuses = FINAL_BACKOFFICE_STATUSES.map(() => '?').join(', ');
  return `
    WITH stock_by_sku AS (
      SELECT
        ps.product_id,
        ps.variant_id,
        COUNT(*) AS snapshot_count,
        SUM(ps.quantite) AS snapshot_stock
      FROM product_snapshot ps
      GROUP BY ps.product_id, ps.variant_id
    ),
    sku_catalog AS (
      SELECT
        p.id AS product_id,
        NULL AS variant_id,
        ${unionText("'parent'")} AS sku_type,
        ${unionText('CAST(p.id AS CHAR)')} AS product_reference,
        ${unionText('p.reference_2')} AS reference_2,
        ${unionText('p.designation')} AS designation,
        ${unionNullText()} AS variant_name,
        ${unionNullText()} AS variant_reference,
        ${unionText('p.image_url')} AS image_url,
        CASE
          WHEN parent_stock.snapshot_count > 0 THEN parent_stock.snapshot_stock
          ELSE COALESCE(p.quantite, 0)
        END AS stock_current
      FROM products p
      LEFT JOIN stock_by_sku parent_stock
        ON parent_stock.product_id = p.id
       AND parent_stock.variant_id <=> NULL
      WHERE COALESCE(p.is_deleted, 0) = 0
        AND COALESCE(p.non_stockable, 0) = 0
        AND COALESCE(p.est_service, 0) = 0
        AND (COALESCE(p.has_variants, 0) = 0 OR COALESCE(p.is_obligatoire_variant, 0) = 0)

      UNION ALL

      SELECT
        p.id AS product_id,
        pv.id AS variant_id,
        ${unionText("'variant'")} AS sku_type,
        ${unionText('CAST(p.id AS CHAR)')} AS product_reference,
        ${unionText('p.reference_2')} AS reference_2,
        ${unionText('p.designation')} AS designation,
        ${unionText('pv.variant_name')} AS variant_name,
        ${unionText('pv.reference')} AS variant_reference,
        ${unionText("COALESCE(NULLIF(pv.image_url, ''), p.image_url)")} AS image_url,
        CASE
          WHEN variant_stock.snapshot_count > 0 THEN variant_stock.snapshot_stock
          ELSE COALESCE(pv.stock_quantity, 0)
        END AS stock_current
      FROM products p
      INNER JOIN product_variants pv
        ON pv.product_id = p.id
       AND COALESCE(pv.is_deleted, 0) = 0
      LEFT JOIN stock_by_sku variant_stock
        ON variant_stock.product_id = p.id
       AND variant_stock.variant_id <=> pv.id
      WHERE COALESCE(p.is_deleted, 0) = 0
        AND COALESCE(p.non_stockable, 0) = 0
        AND COALESCE(p.est_service, 0) = 0
        AND COALESCE(p.has_variants, 0) = 1
    ),
    sales_events AS (
      SELECT
        si.product_id,
        COALESCE(si.variant_id, ps.variant_id) AS variant_id,
        si.quantite AS sold_quantity,
        bs.date_creation AS sold_at
      FROM bons_sortie bs
      INNER JOIN sortie_items si ON si.bon_sortie_id = bs.id
      LEFT JOIN product_snapshot ps ON ps.id = si.product_snapshot_id
      WHERE bs.statut IN (${statuses})
        AND COALESCE(si.is_indisponible, 0) = 0

      UNION ALL

      SELECT
        ci.product_id,
        COALESCE(ci.variant_id, ps.variant_id) AS variant_id,
        ci.quantite AS sold_quantity,
        bc.date_creation AS sold_at
      FROM bons_comptant bc
      INNER JOIN comptant_items ci ON ci.bon_comptant_id = bc.id
      LEFT JOIN product_snapshot ps ON ps.id = ci.product_snapshot_id
      WHERE bc.statut IN (${statuses})
        AND COALESCE(ci.is_indisponible, 0) = 0

      UNION ALL

      SELECT
        eoi.product_id,
        COALESCE(eoi.variant_id, ps.variant_id) AS variant_id,
        eoi.quantity AS sold_quantity,
        eo.delivered_at AS sold_at
      FROM ecommerce_orders eo
      INNER JOIN ecommerce_order_items eoi ON eoi.order_id = eo.id
      LEFT JOIN product_snapshot ps ON ps.id = eoi.product_snapshot_id
      WHERE eo.status = 'delivered'
        AND eo.delivered_at IS NOT NULL
        AND COALESCE(eoi.is_indisponible, 0) = 0
    ),
    sales_by_sku AS (
      SELECT
        product_id,
        variant_id,
        SUM(CASE WHEN sold_at >= ? THEN sold_quantity ELSE 0 END) AS sold_quantity,
        MAX(sold_at) AS last_sale_at
      FROM sales_events
      GROUP BY product_id, variant_id
    ),
    enriched AS (
      SELECT
        sku.*,
        COALESCE(sales.sold_quantity, 0) AS sold_quantity,
        sales.last_sale_at
      FROM sku_catalog sku
      LEFT JOIN sales_by_sku sales
        ON sales.product_id = sku.product_id
       AND sales.variant_id <=> sku.variant_id
    ),
    filtered AS (
      SELECT *
      FROM enriched
      WHERE stock_current > 0
        AND sold_quantity <= ?
        AND (
          ? = ''
          OR product_reference LIKE CONCAT('%', ?, '%')
          OR COALESCE(reference_2, '') LIKE CONCAT('%', ?, '%')
          OR COALESCE(designation, '') LIKE CONCAT('%', ?, '%')
          OR COALESCE(variant_reference, '') LIKE CONCAT('%', ?, '%')
          OR COALESCE(variant_name, '') LIKE CONCAT('%', ?, '%')
        )
    )`;
}

export function buildSlowMovingStockQueries({ periodStart, salesThreshold, q = '', limit, offset }) {
  const search = String(q || '').trim();
  const statusParams = [...FINAL_BACKOFFICE_STATUSES, ...FINAL_BACKOFFICE_STATUSES];
  const commonParams = [
    ...statusParams,
    periodStart,
    salesThreshold,
    search,
    search,
    search,
    search,
    search,
    search,
  ];
  const cte = buildBaseCte();

  return {
    dataSql: `${cte}
      SELECT *
      FROM filtered
      ORDER BY sold_quantity ASC, stock_current DESC, product_id ASC, variant_id ASC
      LIMIT ? OFFSET ?`,
    dataParams: [...commonParams, limit, offset],
    summarySql: `${cte}
      SELECT
        COUNT(*) AS skuCount,
        COUNT(DISTINCT product_id) AS productCount,
        COALESCE(SUM(stock_current), 0) AS totalStock,
        COALESCE(SUM(CASE WHEN sold_quantity = 0 THEN 1 ELSE 0 END), 0) AS zeroSalesCount
      FROM filtered`,
    summaryParams: commonParams,
  };
}

export { FINAL_BACKOFFICE_STATUSES };
