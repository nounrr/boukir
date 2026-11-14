/**
 * Where the customer lands after paying on the bank's page. By default it is the shop website's result page. An app
 * (the web build of the mobile app, or its deep link) can ask to come back to ITSELF with `return_url`, so that:
 *   - a paid order goes on to "continue shopping" in the app,
 *   - a paid credit balance goes back to "Mon solde".
 *
 * Only addresses of the shop's own apps are accepted (an open redirect would let anyone send customers elsewhere):
 * an origin allowed by the server's CORS list, or the app scheme, and always the fixed path /payment-result.
 */
import { getAllowedCorsOrigins } from './corsOrigins.js';

export const RETURN_PATH = '/payment-result';
const APP_SCHEME = 'boukirdiamond:';

export function sanitizeReturnUrl(value, allowedOrigins = getAllowedCorsOrigins()) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol === APP_SCHEME) {
    // boukirdiamond://payment-result : the host plays the role of the path.
    return url.host === RETURN_PATH.slice(1) && (url.pathname === '' || url.pathname === '/') ? `${APP_SCHEME}//${RETURN_PATH.slice(1)}` : null;
  }
  if (!['https:', 'http:'].includes(url.protocol)) return null;
  if (!allowedOrigins.has(url.origin)) return null;
  if (url.pathname.replace(/\/+$/, '') !== RETURN_PATH) return null;
  return `${url.origin}${RETURN_PATH}`;
}

/** base + query (undefined values are skipped). */
export function withParams(base, params) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') query.set(k, String(v));
  return `${base}?${query.toString()}`;
}

let schemaReady = null;
export function ensureReturnUrlSchema(db) {
  schemaReady ??= db
    .query(
      `CREATE TABLE IF NOT EXISTS payment_return_urls (
         oid VARCHAR(64) NOT NULL PRIMARY KEY,
         return_url VARCHAR(255) NOT NULL,
         created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    )
    .catch((error) => {
      schemaReady = null;
      throw error;
    });
  return schemaReady;
}

/** Never throws: a missing return address only means the customer lands on the website page, as before. */
export async function saveReturnUrl(db, oid, returnUrl) {
  if (!returnUrl) return;
  try {
    await ensureReturnUrlSchema(db);
    await db.query('INSERT INTO payment_return_urls (oid, return_url) VALUES (?, ?) ON DUPLICATE KEY UPDATE return_url = VALUES(return_url)', [oid, returnUrl]);
  } catch (error) {
    console.warn('Payment return address not saved:', error?.message || error);
  }
}

export async function loadReturnUrl(db, oid) {
  if (!oid) return null;
  try {
    await ensureReturnUrlSchema(db);
    const [rows] = await db.query('SELECT return_url FROM payment_return_urls WHERE oid = ? LIMIT 1', [oid]);
    return sanitizeReturnUrl(rows?.[0]?.return_url ?? '') ?? null;
  } catch {
    return null;
  }
}
