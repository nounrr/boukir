/**
 * Filtres avancés de la liste paginée des bons : période de création et fourchette de montant.
 * Les valeurs invalides sont ignorées (jamais d'erreur, jamais de SQL injecté :
 * seules des expressions de la configuration serveur sont utilisées, les valeurs passent en paramètres).
 */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const isoDay = (value) => {
  const text = String(value ?? '').trim();
  if (!ISO_DAY.test(text)) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : text;
};

const amount = (value) => {
  const text = String(value ?? '').trim().replace(',', '.');
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 && n <= 1e12 ? n : null;
};

export function buildAdvancedBonFilters(query, cfg) {
  const where = [];
  const params = [];
  const dateExpr = cfg?.dateExpr || 'COALESCE(b.date_creation, b.created_at)';
  const amountExpr = cfg?.amountExpr;

  let from = isoDay(query?.dateFrom);
  let to = isoDay(query?.dateTo);
  if (from && to && from > to) [from, to] = [to, from];
  if (from) {
    where.push(`${dateExpr} >= ?`);
    params.push(`${from} 00:00:00`);
  }
  if (to) {
    where.push(`${dateExpr} < DATE_ADD(?, INTERVAL 1 DAY)`);
    params.push(to);
  }

  if (amountExpr) {
    let min = amount(query?.amountMin);
    let max = amount(query?.amountMax);
    if (min != null && max != null && min > max) [min, max] = [max, min];
    if (min != null) {
      where.push(`COALESCE(${amountExpr}, 0) >= ?`);
      params.push(min);
    }
    if (max != null) {
      where.push(`COALESCE(${amountExpr}, 0) <= ?`);
      params.push(max);
    }
  }

  return { where, params };
}
