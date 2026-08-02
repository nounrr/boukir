const FINAL_BACKOFFICE_STATUSES = [
  'Validé', 'Valide', 'Livré', 'Livre', 'Payé', 'Paye', 'Facturé', 'Facture',
];

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

function catalogSearchSql(fields) {
  return `(
    ? = ''
    OR ${fields.map((field) => `${field} LIKE CONCAT('%', ?, '%')`).join('\n    OR ')}
  )`;
}

function catalogSearchParams(search, fieldCount) {
  return [search, ...Array(fieldCount).fill(search)];
}

function buildParentCatalogQuery(search) {
  const fields = ['CAST(p.id AS CHAR)', "COALESCE(p.reference_2, '')", "COALESCE(p.designation, '')"];

  return {
    sql: `
      SELECT
        p.id AS product_id,
        NULL AS variant_id,
        'parent' AS sku_type,
        CAST(p.id AS CHAR) AS product_reference,
        p.reference_2,
        p.designation,
        NULL AS variant_name,
        NULL AS variant_reference,
        p.image_url,
        CASE
          WHEN COALESCE(parent_stock.snapshot_count, 0) > 0 THEN COALESCE(parent_stock.snapshot_stock, 0)
          ELSE COALESCE(p.quantite, 0)
        END AS stock_current
      FROM products p
      LEFT JOIN (
        SELECT
          ps.product_id,
          COUNT(*) AS snapshot_count,
          SUM(ps.quantite) AS snapshot_stock
        FROM product_snapshot ps
        WHERE ps.variant_id IS NULL
        GROUP BY ps.product_id
      ) parent_stock ON parent_stock.product_id = p.id
      WHERE COALESCE(p.is_deleted, 0) = 0
        AND COALESCE(p.non_stockable, 0) = 0
        AND COALESCE(p.est_service, 0) = 0
        AND (COALESCE(p.has_variants, 0) = 0 OR COALESCE(p.is_obligatoire_variant, 0) = 0)
        AND ${catalogSearchSql(fields)}`,
    params: catalogSearchParams(search, fields.length),
  };
}

function buildVariantCatalogQuery(search) {
  const fields = [
    'CAST(p.id AS CHAR)',
    "COALESCE(p.reference_2, '')",
    "COALESCE(p.designation, '')",
    "COALESCE(pv.reference, '')",
    "COALESCE(pv.variant_name, '')",
  ];

  return {
    sql: `
      SELECT
        p.id AS product_id,
        pv.id AS variant_id,
        'variant' AS sku_type,
        CAST(p.id AS CHAR) AS product_reference,
        p.reference_2,
        p.designation,
        pv.variant_name,
        pv.reference AS variant_reference,
        COALESCE(NULLIF(pv.image_url, ''), p.image_url) AS image_url,
        CASE
          WHEN COALESCE(variant_stock.snapshot_count, 0) > 0 THEN COALESCE(variant_stock.snapshot_stock, 0)
          ELSE COALESCE(pv.stock_quantity, 0)
        END AS stock_current
      FROM products p
      INNER JOIN product_variants pv
        ON pv.product_id = p.id
       AND COALESCE(pv.is_deleted, 0) = 0
      LEFT JOIN (
        SELECT
          ps.product_id,
          ps.variant_id,
          COUNT(*) AS snapshot_count,
          SUM(ps.quantite) AS snapshot_stock
        FROM product_snapshot ps
        WHERE ps.variant_id IS NOT NULL
        GROUP BY ps.product_id, ps.variant_id
      ) variant_stock
        ON variant_stock.product_id = p.id
       AND variant_stock.variant_id = pv.id
      WHERE COALESCE(p.is_deleted, 0) = 0
        AND COALESCE(p.non_stockable, 0) = 0
        AND COALESCE(p.est_service, 0) = 0
        AND COALESCE(p.has_variants, 0) = 1
        AND ${catalogSearchSql(fields)}`,
    params: catalogSearchParams(search, fields.length),
  };
}

function buildBackofficeSalesQuery({ headerTable, itemTable, itemForeignKey, periodStart }) {
  const statuses = FINAL_BACKOFFICE_STATUSES.map(() => '?').join(', ');

  return {
    sql: `
      SELECT
        item.product_id,
        COALESCE(item.variant_id, ps.variant_id) AS variant_id,
        SUM(CASE WHEN header.date_creation >= ? THEN item.quantite ELSE 0 END) AS sold_quantity,
        MAX(header.date_creation) AS last_sale_at
      FROM ${headerTable} header
      INNER JOIN ${itemTable} item ON item.${itemForeignKey} = header.id
      LEFT JOIN product_snapshot ps ON ps.id = item.product_snapshot_id
      WHERE header.statut IN (${statuses})
        AND COALESCE(item.is_indisponible, 0) = 0
      GROUP BY item.product_id, COALESCE(item.variant_id, ps.variant_id)`,
    params: [periodStart, ...FINAL_BACKOFFICE_STATUSES],
  };
}

function buildEcommerceSalesQuery(periodStart) {
  return {
    sql: `
      SELECT
        eoi.product_id,
        COALESCE(eoi.variant_id, ps.variant_id) AS variant_id,
        SUM(CASE WHEN eo.delivered_at >= ? THEN eoi.quantity ELSE 0 END) AS sold_quantity,
        MAX(eo.delivered_at) AS last_sale_at
      FROM ecommerce_orders eo
      INNER JOIN ecommerce_order_items eoi ON eoi.order_id = eo.id
      LEFT JOIN product_snapshot ps ON ps.id = eoi.product_snapshot_id
      WHERE eo.status = 'delivered'
        AND eo.delivered_at IS NOT NULL
        AND COALESCE(eoi.is_indisponible, 0) = 0
      GROUP BY eoi.product_id, COALESCE(eoi.variant_id, ps.variant_id)`,
    params: [periodStart],
  };
}

export function buildSlowMovingStockQueries({ periodStart, q = '' }) {
  const search = String(q || '').trim();

  return {
    parentCatalog: buildParentCatalogQuery(search),
    variantCatalog: buildVariantCatalogQuery(search),
    sortieSales: buildBackofficeSalesQuery({
      headerTable: 'bons_sortie',
      itemTable: 'sortie_items',
      itemForeignKey: 'bon_sortie_id',
      periodStart,
    }),
    comptantSales: buildBackofficeSalesQuery({
      headerTable: 'bons_comptant',
      itemTable: 'comptant_items',
      itemForeignKey: 'bon_comptant_id',
      periodStart,
    }),
    ecommerceSales: buildEcommerceSalesQuery(periodStart),
  };
}

function skuKey(productId, variantId) {
  return `${Number(productId)}:${variantId == null ? 'parent' : Number(variantId)}`;
}

function latestDate(current, candidate) {
  if (!candidate) return current || null;
  if (!current) return candidate;
  return new Date(candidate).getTime() > new Date(current).getTime() ? candidate : current;
}

export function assembleSlowMovingStock({ catalogRows, salesRows, salesThreshold, page, limit }) {
  const salesBySku = new Map();

  for (const row of salesRows) {
    const key = skuKey(row.product_id, row.variant_id);
    const current = salesBySku.get(key) || { sold_quantity: 0, last_sale_at: null };
    current.sold_quantity += Number(row.sold_quantity || 0);
    current.last_sale_at = latestDate(current.last_sale_at, row.last_sale_at);
    salesBySku.set(key, current);
  }

  const filteredRows = catalogRows
    .map((row) => {
      const sales = salesBySku.get(skuKey(row.product_id, row.variant_id));
      return {
        ...row,
        stock_current: Number(row.stock_current || 0),
        sold_quantity: Number(sales?.sold_quantity || 0),
        last_sale_at: sales?.last_sale_at || null,
      };
    })
    .filter((row) => isSlowMovingCandidate(row.stock_current, row.sold_quantity, salesThreshold))
    .sort((left, right) => (
      left.sold_quantity - right.sold_quantity
      || right.stock_current - left.stock_current
      || Number(left.product_id) - Number(right.product_id)
      || (left.variant_id == null ? -1 : Number(left.variant_id))
        - (right.variant_id == null ? -1 : Number(right.variant_id))
    ));

  const total = filteredRows.length;
  const offset = (page - 1) * limit;
  const data = filteredRows.slice(offset, offset + limit);

  return {
    data,
    summary: {
      skuCount: total,
      productCount: new Set(filteredRows.map((row) => Number(row.product_id))).size,
      totalStock: filteredRows.reduce((sum, row) => sum + row.stock_current, 0),
      zeroSalesCount: filteredRows.reduce((sum, row) => sum + (row.sold_quantity === 0 ? 1 : 0), 0),
    },
    total,
  };
}

export { FINAL_BACKOFFICE_STATUSES };
