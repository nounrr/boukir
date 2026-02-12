import { computeMouvementCalc } from './mouvementCalc.js';

const DEFAULTS = {
  freeProfitThreshold: 200,
  flatRate: 30,
};

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function hasKgItems(items = []) {
  if (!Array.isArray(items)) return false;
  return items.some((it) => toNumber(it?.kg ?? it?.product_kg ?? 0) > 0);
}

/**
 * Computes order profit ("marge/bénéfice") using the same formula as backoffice.
 *
 * Expected item keys:
 * - quantite (or qty)
 * - prix_unitaire
 * - cout_revient (preferred) or prix_achat
 */
export function computeEcommerceProfit(items = []) {
  const { profit } = computeMouvementCalc({ type: 'Ecommerce', items });
  return toNumber(profit, 0);
}

/**
 * Phase 1 shipping rules (non-KG orders):
 * - If profit >= 200 => shipping free
 * - Else => shipping 30 DH
 * - Pickup always 0
 *
 * For orders containing KG products, we currently DO NOT apply the free-shipping-by-profit rule.
 * Until phase 2 is implemented, we default to the flat rate to avoid undercharging.
 */
export function calculateEcommerceShipping({
  deliveryMethod = 'delivery',
  items = [],
  freeProfitThreshold = DEFAULTS.freeProfitThreshold,
  flatRate = DEFAULTS.flatRate,
} = {}) {
  const normalizedDeliveryMethod = String(deliveryMethod || 'delivery').trim();

  if (normalizedDeliveryMethod === 'pickup') {
    return {
      shippingCost: 0,
      isFreeShipping: true,
      reason: 'pickup',
      profit: null,
      containsKg: hasKgItems(items),
    };
  }

  const containsKg = hasKgItems(items);
  if (containsKg) {
    return {
      shippingCost: toNumber(flatRate, 30),
      isFreeShipping: false,
      reason: 'kg_items_phase2_pending',
      profit: null,
      containsKg,
    };
  }

  const profit = computeEcommerceProfit(items);
  const threshold = toNumber(freeProfitThreshold, DEFAULTS.freeProfitThreshold);
  const isFreeShipping = profit >= threshold;

  return {
    shippingCost: isFreeShipping ? 0 : toNumber(flatRate, DEFAULTS.flatRate),
    isFreeShipping,
    reason: isFreeShipping ? 'profit_threshold_met' : 'profit_threshold_not_met',
    profit,
    containsKg,
  };
}
