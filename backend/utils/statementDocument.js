/**
 * Detail of one document of a customer's credit statement (store purchase, credit note, payment...), limited to what
 * the customer may see: products with quantity, unit price, discount and line total. Cost prices never leave here.
 */

const money = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

export const STATEMENT_DOCUMENT_SOURCES = Object.freeze(['BON_SORTIE', 'AVOIR_CLIENT', 'AVOIR_ECOMMERCE', 'PAYMENT']);

/** One SQL row of `*_items` joined with products -> the line the app shows. */
export function normalizeLine(row) {
  const quantity = Number(row.quantite);
  const unitPrice = money(row.prix_unitaire);
  const discount = money(row.remise_montant);
  const total = row.total != null ? money(row.total) : money(quantity * unitPrice - discount);
  return {
    id: Number(row.id) || null,
    designation: row.designation || '',
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unit_price: unitPrice,
    discount_percent: money(row.remise_pourcentage),
    discount_amount: discount,
    total,
  };
}

/** The SQL to run per source: ownership is part of the WHERE, so a customer can only open their own documents. */
export const STATEMENT_DOCUMENT_QUERIES = Object.freeze({
  BON_SORTIE: {
    header: `SELECT bs.id, CONCAT('BS', bs.id) AS ref, bs.created_at AS date, bs.statut, bs.montant_total AS total,
                    bs.adresse_livraison AS address
             FROM bons_sortie bs
             WHERE bs.id = ? AND bs.client_id = ? AND LOWER(COALESCE(bs.statut, '')) NOT IN ('annulé','annule')`,
    items: `SELECT si.id, p.designation, si.quantite, si.prix_unitaire, si.remise_pourcentage, si.remise_montant, si.total
            FROM sortie_items si LEFT JOIN products p ON p.id = si.product_id
            WHERE si.bon_sortie_id = ? ORDER BY si.id`,
  },
  AVOIR_CLIENT: {
    header: `SELECT ac.id, CONCAT('AVC', ac.id) AS ref, ac.created_at AS date, ac.statut, ac.montant_total AS total, NULL AS address
             FROM avoirs_client ac
             WHERE ac.id = ? AND ac.client_id = ? AND LOWER(COALESCE(ac.statut, '')) NOT IN ('annulé','annule')`,
    items: `SELECT i.id, p.designation, i.quantite, i.prix_unitaire, i.remise_pourcentage, i.remise_montant, i.total
            FROM avoir_client_items i LEFT JOIN products p ON p.id = i.product_id
            WHERE i.avoir_client_id = ? ORDER BY i.id`,
  },
  AVOIR_ECOMMERCE: {
    header: `SELECT ae.id, COALESCE(ae.order_number, CONCAT('AE', ae.id)) AS ref, ae.date_creation AS date, ae.statut,
                    ae.montant_total AS total, NULL AS address
             FROM avoirs_ecommerce ae
             JOIN ecommerce_orders o ON o.id = ae.ecommerce_order_id
             WHERE ae.id = ? AND o.user_id = ? AND LOWER(COALESCE(ae.statut, '')) NOT IN ('annulé','annule')`,
    items: `SELECT i.id, p.designation, i.quantite, i.prix_unitaire, i.remise_pourcentage, i.remise_montant, i.total
            FROM avoir_ecommerce_items i LEFT JOIN products p ON p.id = i.product_id
            WHERE i.avoir_ecommerce_id = ? ORDER BY i.id`,
  },
  PAYMENT: {
    header: `SELECT p.id, COALESCE(p.numero, CONCAT('PAY', p.id)) AS ref, p.created_at AS date, p.statut, p.montant_total AS total,
                    p.mode_paiement, NULL AS address
             FROM payments p
             WHERE p.id = ? AND p.type_paiement = 'Client' AND p.contact_id = ?
               AND LOWER(COALESCE(p.statut, '')) NOT IN ('refusé','refuse','annulé','annule')`,
    items: null,
  },
});

export async function loadStatementDocument(db, source, id, contactId) {
  const queries = STATEMENT_DOCUMENT_QUERIES[source];
  if (!queries) return { error: 'Type de document invalide', status: 400 };
  const [headers] = await db.query(queries.header, [id, contactId]);
  const header = headers?.[0];
  if (!header) return { error: 'Document introuvable', status: 404 };
  let lines = [];
  if (queries.items) {
    const [rows] = await db.query(queries.items, [id]);
    lines = rows.map(normalizeLine);
  }
  return {
    document: {
      source,
      id: Number(header.id),
      ref: header.ref,
      date: header.date,
      status: header.statut,
      total: money(header.total),
      payment_method: header.mode_paiement ?? null,
      address: header.address ?? null,
      items: lines,
    },
  };
}
