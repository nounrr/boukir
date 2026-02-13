import { computeMouvementCalc } from './mouvementCalc.js';

const DEFAULTS = {
  freeProfitThreshold: 200,
  flatRate: 30,
  kg: {
    band1Max: 2000,
    band1Profit: 500,
    band2Max: 5000,
    band2Profit: 1000,
  },
};

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function hasKgItems(items = []) {
  if (!Array.isArray(items)) return false;
  return items.some((it) => toNumber(it?.kg ?? it?.product_kg ?? 0) > 0 && toNumber(it?.quantite ?? it?.quantity ?? it?.qty ?? 0) > 0);
}

function computeTotalKg(items = []) {
  if (!Array.isArray(items) || items.length === 0) return 0;
  return items.reduce((sum, it) => {
    const kgPerUnit = toNumber(it?.kg ?? it?.product_kg ?? 0);
    const quantity = toNumber(it?.quantite ?? it?.quantity ?? it?.qty ?? 0);
    if (!(kgPerUnit > 0) || !(quantity > 0)) return sum;
    return sum + kgPerUnit * quantity;
  }, 0);
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
  const { profit, costBase } = computeMouvementCalc({ type: 'Ecommerce', items });
  return {
    profit: toNumber(profit, 0),
    costBase: toNumber(costBase, 0),
  };
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
      totalKg: computeTotalKg(items),
    };
  }

  const containsKg = hasKgItems(items);
  if (containsKg) {
    const totalKg = computeTotalKg(items);

    // Phase 2 KG rules (delivery only):
    // - totalKg <= 2000 => free if profit >= 500
    // - totalKg <= 5000 => free if profit >= 1000
    // - totalKg > 5000 => always free
    // If thresholds not met, the shipping price should be computed from distance (phase 3).

    if (totalKg > DEFAULTS.kg.band2Max) {
      return {
        shippingCost: 0,
        isFreeShipping: true,
        reason: 'kg_over_5000',
        profit: null,
        containsKg,
        totalKg,
      };
    }

    const { profit, costBase } = computeEcommerceProfit(items);
    if (!(costBase > 0)) {
      return {
        shippingCost: toNumber(flatRate, DEFAULTS.flatRate),
        isFreeShipping: false,
        reason: 'missing_cost_data',
        profit: null,
        containsKg,
        totalKg,
      };
    }

    const requiredProfit = totalKg <= DEFAULTS.kg.band1Max
      ? DEFAULTS.kg.band1Profit
      : DEFAULTS.kg.band2Profit;

    const isFreeShipping = profit >= requiredProfit;
    if (isFreeShipping) {
      return {
        shippingCost: 0,
        isFreeShipping: true,
        reason: totalKg <= DEFAULTS.kg.band1Max ? 'kg_profit_band1_met' : 'kg_profit_band2_met',
        profit,
        containsKg,
        totalKg,
      };
    }

    // Distance-based pricing is pending; keep flatRate as a temporary fallback so checkout can proceed.
    return {
      shippingCost: toNumber(flatRate, DEFAULTS.flatRate),
      isFreeShipping: false,
      reason: 'kg_profit_not_met_distance_pending',
      profit,
      containsKg,
      totalKg,
    };
  }

  const { profit, costBase } = computeEcommerceProfit(items);
  // If we don't have reliable cost data, profit becomes meaningless (it can equal selling price).
  // In that case, do NOT grant free shipping.
  if (!(costBase > 0)) {
    return {
      shippingCost: toNumber(flatRate, DEFAULTS.flatRate),
      isFreeShipping: false,
      reason: 'missing_cost_data',
      profit: null,
      containsKg,
      totalKg: 0,
    };
  }

  const threshold = toNumber(freeProfitThreshold, DEFAULTS.freeProfitThreshold);
  const isFreeShipping = profit >= threshold;

  return {
    shippingCost: isFreeShipping ? 0 : toNumber(flatRate, DEFAULTS.flatRate),
    isFreeShipping,
    reason: isFreeShipping ? 'profit_threshold_met' : 'profit_threshold_not_met',
    profit,
    containsKg,
    totalKg: 0,
  };
}
