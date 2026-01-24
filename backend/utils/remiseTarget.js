import pool from '../db/pool.js';

function toBool(v, defaultValue = false) {
  if (v === undefined || v === null) return defaultValue;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'oui'].includes(s)) return true;
  if (['0', 'false', 'no', 'non'].includes(s)) return false;
  return defaultValue;
}

function toId(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

export async function resolveRemiseTarget(params) {
  const {
    db = pool,
    clientId,
    remiseIsClient,
    remiseId,
    remiseClientNom,
  } = params || {};

  // If remise_is_client is omitted, treat it as "no client remise".
  // This prevents requiring client_id when the caller is not applying any remise.
  const isClient = toBool(remiseIsClient, false);

  if (isClient) {
    const cid = toId(clientId);
    if (!cid) {
      return {
        remise_is_client: 1,
        remise_id: null,
        error: 'client_id requis quand remise_is_client = true',
      };
    }
    return { remise_is_client: 1, remise_id: cid };
  }

  const explicitId = toId(remiseId);
  if (explicitId) {
    return { remise_is_client: 0, remise_id: explicitId };
  }

  const name = String(remiseClientNom || '').trim();
  if (!name) {
    // Pas de cible remise renseignée
    return { remise_is_client: 0, remise_id: null };
  }

  // Find by name (case-insensitive)
  const [rows] = await db.execute(
    `SELECT id FROM client_remises WHERE TRIM(LOWER(nom)) = TRIM(LOWER(?)) LIMIT 1`,
    [name]
  );
  if (rows && rows.length) {
    return { remise_is_client: 0, remise_id: Number(rows[0].id) };
  }

  // Create
  const [ins] = await db.execute(
    `INSERT INTO client_remises (nom, type) VALUES (?, 'client-remise')`,
    [name]
  );

  return { remise_is_client: 0, remise_id: Number(ins.insertId) };
}
