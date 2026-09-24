import { canViewInternalPrices } from '../utils/internalPricePermissions.js';

const SENSITIVE_KEYS = new Set([
  'pa', 'cr', 'cout',
  'prixachat', 'coutrevient', 'coutrevientpourcentage',
  'prixgros', 'prixgrospourcentage', 'prixventepourcentage',
  'totalachat', 'totalachatrecalcule', 'valeurcost', 'totalcost',
  'marge', 'margebrute', 'margenette', 'profit', 'benefice',
  'purchaseprice', 'costprice',
]);

const normalizedKey = (key) => String(key).replace(/[_\s-]/g, '').toLowerCase();
const isSensitiveKey = (key) => {
  const name = normalizedKey(key);
  return SENSITIVE_KEYS.has(name) || [
    'prixachat', 'coutrevient', 'prixgros', 'totalachat',
    'valeurcost', 'totalcost', 'marge', 'profit', 'benefice',
    'purchaseprice', 'costprice',
  ].some((fragment) => name.includes(fragment));
};

export function stripInternalPrices(value) {
  if (Array.isArray(value)) return value.map(stripInternalPrices);
  if (value == null || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isSensitiveKey(key))
      .map(([key, nested]) => [key, stripInternalPrices(nested)])
  );
}

export function hideInternalPricesInApiResponses(req, res, next) {
  if (!req.path.startsWith('/api/') || !req.user?.role || canViewInternalPrices(req.user)) return next();
  const sendJson = res.json.bind(res);
  res.json = (payload) => sendJson(stripInternalPrices(payload));
  return next();
}
