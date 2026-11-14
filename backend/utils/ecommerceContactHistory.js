import { historyItemCostExpr } from './contactHistoryCost.js';

const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = value => Math.round(value * 1000) / 1000;
const flag = value => value === true || value === 1 || value === '1';
const active = new Set(['pending', 'confirmed', 'processing', 'shipped', 'delivered']);
const statuses = { pending: 'En attente', confirmed: 'Confirmé', processing: 'En préparation', shipped: 'Expédié', delivered: 'Livré' };

// The financed amount already excludes the loyalty balance spent at checkout.
// Account payments are separate ledger entries and must not be subtracted here again.
export function ecommerceDebtSql(alias = 'o') {
  const p = alias ? `${alias}.` : '';
  return `GREATEST(0, COALESCE(${p}solde_amount, ${p}total_amount - COALESCE(${p}remise_used_amount, 0), 0))`;
}

export function normalizeEcommerceHistory(orders) {
  return orders.filter(order => active.has(order.status)).map(order => {
    let source;
    try { source = typeof order.items === 'string' ? JSON.parse(order.items) : order.items; } catch { source = []; }
    const items = (Array.isArray(source) ? source : []).filter(item => item?.id).map(item => {
      const quantity = number(item.quantity);
      const total = number(item.subtotal ?? quantity * number(item.unit_price));
      const remise = number(item.remise_amount);
      const cost = number(item.cout_revient);
      return { ...item, history_ecommerce: true, quantite: quantity, prix_unitaire: number(item.unit_price),
        designation: item.product_name || item.designation || '', reference: String(item.product_id ?? ''),
        product_reference: String(item.product_id ?? ''), total, remise_montant: quantity ? remise / quantity : 0,
        remise_pourcentage: 0, history_benefice: flag(item.rappel_non_calcule) || flag(item.est_service) ? 0 : round(total - cost * quantity - remise) };
    });
    const adjustment = (key, label, total, benefice = 0) => {
      if (!total) return;
      items.push({ id: `${key}-${order.id}`, history_ecommerce: true, history_adjustment: true,
        designation: label, reference: key.toUpperCase(), product_reference: key.toUpperCase(),
        quantite: 0, prix_unitaire: 0, total, remise_montant: 0, remise_pourcentage: 0,
        history_benefice: benefice, cout_revient: 0 });
    };
    const discount = number(order.promo_discount_amount);
    adjustment('promo', 'Réduction de la commande', -discount, -discount);
    adjustment('livraison', 'Frais de livraison', number(order.shipping_cost));
    adjustment('taxe', 'Taxes', number(order.tax_amount));
    const total = number(order.total_amount);
    adjustment('ajustement', items.length ? 'Ajustement de la commande' : 'Commande sans détail produit', round(total - items.reduce((sum, item) => sum + item.total, 0)));
    const financed = flag(order.is_solde)
      ? Math.max(0, number(order.solde_amount ?? total - number(order.remise_used_amount))) : 0;
    let allocated = 0;
    items.forEach((item, index) => {
      item.balance_amount = index === items.length - 1 ? round(financed - allocated)
        : total ? round(item.total * financed / total) : 0;
      allocated = round(allocated + item.balance_amount);
    });
    return { ...order, type: 'Ecommerce', client_id: order.user_id,
      numero: order.order_number || `ECO${order.id}`, date_creation: order.created_at,
      statut: statuses[order.status], montant_total: total, balance_amount: financed,
      adresse_livraison: [order.shipping_address_line1, order.shipping_address_line2, order.shipping_city].filter(Boolean).join(', '), items };
  });
}

export const ECOMMERCE_CONTACT_HISTORY_SQL = `
  SELECT eo.*, COALESCE(JSON_ARRAYAGG(CASE WHEN oi.id IS NULL THEN NULL ELSE JSON_OBJECT(
    'id', oi.id, 'product_id', oi.product_id, 'variant_id', oi.variant_id, 'unit_id', oi.unit_id,
    'product_name', COALESCE(NULLIF(oi.product_name, ''), p.designation),
    'variant_name', COALESCE(oi.variant_name, pv.variant_name), 'unit_name', COALESCE(oi.unit_name, pu.unit_name),
    'product_image_url', COALESCE(pv.image_url, p.image_url),
    'est_service', p.est_service, 'rappel_non_calcule', p.rappel_non_calcule,
    'quantity', oi.quantity, 'unit_price', oi.unit_price, 'subtotal', oi.subtotal,
    'remise_amount', oi.remise_amount, 'cout_revient', ${historyItemCostExpr('oi', { snapshotAlias: null })}
  ) END), JSON_ARRAY()) AS items
  FROM ecommerce_orders eo
  LEFT JOIN ecommerce_order_items oi ON oi.order_id = eo.id
  LEFT JOIN products p ON p.id = oi.product_id
  LEFT JOIN product_variants pv ON pv.id = oi.variant_id AND pv.product_id = oi.product_id
  LEFT JOIN product_units pu ON pu.id = oi.unit_id AND pu.product_id = oi.product_id
  WHERE eo.user_id = ?
  GROUP BY eo.id ORDER BY eo.created_at ASC, eo.id ASC
`;
