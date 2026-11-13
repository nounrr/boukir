/**
 * Product lines of the documents of a customer's statement, in ONE round trip per source (not one request per
 * document). They are what the back-office customer sheet shows under each bon: designation, quantity, unit price,
 * discount and line total. Cost prices never leave here.
 */

const money = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

/** One SQL row -> the line the app shows. */
export function normalizeLine(row) {
  const quantity = Number(row.quantite);
  const unitPrice = money(row.prix_unitaire);
  const discount = money(row.remise_montant);
  const total = row.total != null ? money(row.total) : money(quantity * unitPrice - discount);
  return {
    id: Number(row.id) || null,
    designation: [row.designation, row.variant_name].filter(Boolean).join(' · '),
    unit: row.unit_name || null,
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unit_price: unitPrice,
    discount_percent: money(row.remise_pourcentage),
    discount_amount: discount,
    total,
  };
}

/** `IN (?)` queries per statement source. Ownership is already guaranteed: the ids come from the customer's own timeline. */
export const LINE_QUERIES = Object.freeze({
  BON_ECOMMERCE: `SELECT oi.order_id AS doc_id, oi.id, oi.product_name AS designation, oi.variant_name, oi.unit_name,
                         oi.quantity AS quantite, oi.unit_price AS prix_unitaire, oi.discount_percentage AS remise_pourcentage,
                         oi.discount_amount AS remise_montant, oi.subtotal AS total
                  FROM ecommerce_order_items oi WHERE oi.order_id IN (?) ORDER BY oi.id`,
  BON_SORTIE: `SELECT si.bon_sortie_id AS doc_id, si.id, p.designation, NULL AS variant_name, NULL AS unit_name,
                      si.quantite, si.prix_unitaire, si.remise_pourcentage, si.remise_montant, si.total
               FROM sortie_items si LEFT JOIN products p ON p.id = si.product_id
               WHERE si.bon_sortie_id IN (?) ORDER BY si.id`,
  AVOIR_CLIENT: `SELECT i.avoir_client_id AS doc_id, i.id, p.designation, NULL AS variant_name, NULL AS unit_name,
                        i.quantite, i.prix_unitaire, i.remise_pourcentage, i.remise_montant, i.total
                 FROM avoir_client_items i LEFT JOIN products p ON p.id = i.product_id
                 WHERE i.avoir_client_id IN (?) ORDER BY i.id`,
  AVOIR_ECOMMERCE: `SELECT i.avoir_ecommerce_id AS doc_id, i.id, p.designation, NULL AS variant_name, NULL AS unit_name,
                           i.quantite, i.prix_unitaire, i.remise_pourcentage, i.remise_montant, i.total
                    FROM avoir_ecommerce_items i LEFT JOIN products p ON p.id = i.product_id
                    WHERE i.avoir_ecommerce_id IN (?) ORDER BY i.id`,
});

/**
 * `rows` are the timeline rows ({ source, doc_id }). Returns Map("SOURCE:id" -> lines[]). A source whose query fails
 * (older schema) is skipped: its documents simply have no lines, the statement still loads.
 */
export async function loadStatementLines(db, rows, { onError = () => {} } = {}) {
  const bySource = new Map();
  for (const r of rows) {
    if (!LINE_QUERIES[r.source] || r.doc_id == null) continue;
    if (!bySource.has(r.source)) bySource.set(r.source, []);
    bySource.get(r.source).push(Number(r.doc_id));
  }
  const lines = new Map();
  for (const [source, ids] of bySource) {
    try {
      const [found] = await db.query(LINE_QUERIES[source], [ids]);
      for (const row of found) {
        const key = `${source}:${row.doc_id}`;
        if (!lines.has(key)) lines.set(key, []);
        lines.get(key).push(normalizeLine(row));
      }
    } catch (error) {
      onError(source, error);
    }
  }
  return lines;
}
