import { createHash, randomBytes } from 'node:crypto';

const schemas = new WeakMap();
export const COUNT_SESSION_DDL = `CREATE TABLE IF NOT EXISTS inventory_count_sessions (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, title VARCHAR(160) NOT NULL,
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 is_closed TINYINT(1) NOT NULL DEFAULT 0, created_by INT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, closed_at TIMESTAMP NULL,
 UNIQUE KEY uniq_inventory_count_token (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
export const COUNT_ENTRY_DDL = `CREATE TABLE IF NOT EXISTS inventory_count_entries (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, session_id BIGINT UNSIGNED NOT NULL,
 product_id INT NOT NULL, variant_id INT NULL,
 entity_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 participant_name VARCHAR(100) NOT NULL,
 participant_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 quantity DECIMAL(18,3) NOT NULL,
 product_label VARCHAR(255) NOT NULL, variant_label VARCHAR(255) NULL, reference VARCHAR(255) NOT NULL DEFAULT '',
 request_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uniq_inventory_count_request (session_id, request_key),
 KEY idx_inventory_count_item (session_id, entity_key),
 KEY idx_inventory_count_person (session_id, participant_key),
 KEY idx_inventory_count_history (session_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
export function countError(message, status = 400) { return Object.assign(new Error(message), { status }); }
export function ensureInventoryCountSchema(db) {
 if (!schemas.has(db)) schemas.set(db, (async () => { await db.query(COUNT_SESSION_DDL); await db.query(COUNT_ENTRY_DDL); })().catch(error => { schemas.delete(db); throw error; }));
 return schemas.get(db);
}
export const hashCountToken = token => createHash('sha256').update(token).digest('hex');
export const validCountToken = token => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
export const countLink = token => `https://boukirdiamond.com/fr/comptage/${token}`;
export function positiveCountId(value) {
 if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !/^\d+$/.test(value))) throw countError('Identifiant invalide.');
 const id = Number(value); if (!Number.isSafeInteger(id) || id <= 0) throw countError('Identifiant invalide.'); return id;
}
export function parseCountName(value) {
 if (typeof value !== 'string' || value.length > 300 || /[\x00-\x1f\x7f]/.test(value)) throw countError('Indiquez votre nom complet (2 à 100 caractères).');
 const name = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
 if (name.length < 2 || name.length > 100) throw countError('Indiquez votre nom complet (2 à 100 caractères).');
 return { name, key: hashCountToken(name.toLocaleLowerCase('fr')) };
}
export function parseCountQuantity(value) {
 if (typeof value !== 'string' && typeof value !== 'number') throw countError('Quantité invalide.');
 const text = String(value).trim().replace(',', '.');
 if (!/^\d{1,9}(?:\.\d{1,3})?$/.test(text)) throw countError('Quantité positive ou nulle, avec 3 décimales maximum.');
 return Number(text).toFixed(3);
}
export function parseCountEntry(body) {
 const participant = parseCountName(body?.name);
 const productId = positiveCountId(body?.product_id);
 const variantId = body?.variant_id == null ? null : positiveCountId(body.variant_id);
 const quantity = parseCountQuantity(body?.quantity);
 if (typeof body?.request_key !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(body.request_key)) throw countError('Identifiant de saisie manquant. Réessayez.');
 return { participant, productId, variantId, quantity, requestKey: body.request_key, entityKey: `p:${productId}${variantId === null ? '' : ':v:' + variantId}` };
}
export function publicCountSession(row) { return { id: Number(row.id), title: row.title }; }
export function mapCountSession(row) {
 return { ...publicCountSession(row), is_closed: Number(row.is_closed) === 1, created_at: row.created_at,
 entry_count: Number(row.entry_count || 0), item_count: Number(row.item_count || 0), participant_count: Number(row.participant_count || 0), total_quantity: Number(row.total_quantity || 0) };
}
export async function createCountSession(db, title, userId = null) {
 if (typeof title !== 'string' || !title.trim() || title.trim().length > 160 || /[\x00-\x1f\x7f]/.test(title)) throw countError('Nom du comptage requis (160 caractères maximum).');
 const token = randomBytes(32).toString('base64url');
 const [result] = await db.query('INSERT INTO inventory_count_sessions (title, token_hash, created_by) VALUES (?, ?, ?)', [title.trim(), hashCountToken(token), userId]);
 const [[row]] = await db.query('SELECT * FROM inventory_count_sessions WHERE id = ?', [result.insertId]);
 return { session: mapCountSession(row), url: countLink(token) };
}
export async function findPublicCountSession(db, token) {
 if (!validCountToken(token)) throw countError('Lien de comptage indisponible.', 404);
 await ensureInventoryCountSchema(db);
 const [[row]] = await db.query('SELECT id, title, is_closed, token_hash FROM inventory_count_sessions WHERE token_hash = ? LIMIT 1', [hashCountToken(token)]);
 if (!row) throw countError('Lien de comptage indisponible.', 404);
 if (Number(row.is_closed) === 1) throw countError('Ce comptage est clôturé.', 410);
 return row;
}
export async function appendCountEntry(db, session, body) {
 const entry = parseCountEntry(body), connection = await db.getConnection();
 try {
  await connection.beginTransaction();
  const [[current]] = await connection.query('SELECT id, is_closed FROM inventory_count_sessions WHERE id = ? AND token_hash = ? FOR UPDATE', [session.id, session.token_hash]);
  if (!current) throw countError('Lien de comptage indisponible.', 404);
  if (Number(current.is_closed) === 1) throw countError('Ce comptage est clôturé.', 410);
  const [[saved]] = await connection.query('SELECT id, participant_key, product_id, variant_id, quantity FROM inventory_count_entries WHERE session_id = ? AND request_key = ? LIMIT 1', [session.id, entry.requestKey]);
  if (saved) {
   if (saved.participant_key !== entry.participant.key || Number(saved.product_id) !== entry.productId || (saved.variant_id == null ? null : Number(saved.variant_id)) !== entry.variantId || Number(saved.quantity) !== Number(entry.quantity)) throw countError('Cette saisie a déjà été enregistrée avec un autre contenu.', 409);
   await connection.commit(); return { ok: true, id: Number(saved.id), quantity: Number(saved.quantity), replayed: true };
  }
  let product;
  if (entry.variantId === null) {
   [[product]] = await connection.query(`SELECT p.id AS product_id, NULL AS variant_id, p.designation, NULL AS variant_name,
    COALESCE(NULLIF(p.reference_2, ''), CAST(p.id AS CHAR)) AS reference FROM products p WHERE p.id = ? AND COALESCE(p.is_deleted, 0) = 0 LIMIT 1`, [entry.productId]);
  } else {
   [[product]] = await connection.query(`SELECT p.id AS product_id, pv.id AS variant_id, p.designation, pv.variant_name,
    COALESCE(NULLIF(CONVERT(pv.reference USING utf8mb4) COLLATE utf8mb4_unicode_ci, ''), NULLIF(CONVERT(p.reference_2 USING utf8mb4) COLLATE utf8mb4_unicode_ci, ''), CAST(p.id AS CHAR)) AS reference
    FROM product_variants pv JOIN products p ON p.id = pv.product_id
    WHERE p.id = ? AND pv.id = ? AND COALESCE(p.is_deleted, 0) = 0 AND COALESCE(pv.is_deleted, 0) = 0 LIMIT 1`, [entry.productId, entry.variantId]);
  }
  if (!product) throw countError('Produit ou variante introuvable. Relancez la recherche.', 404);
  const [result] = await connection.query(`INSERT INTO inventory_count_entries
   (session_id, product_id, variant_id, entity_key, participant_name, participant_key, quantity, product_label, variant_label, reference, request_key)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [session.id, entry.productId, entry.variantId, entry.entityKey, entry.participant.name, entry.participant.key, entry.quantity,
   product.designation || `Produit #${entry.productId}`, product.variant_name || null, String(product.reference || ''), entry.requestKey]);
  await connection.commit(); return { ok: true, id: Number(result.insertId), quantity: Number(entry.quantity), replayed: false };
 } catch (error) { await connection.rollback(); throw error; }
 finally { connection.release(); }
}
export function buildCountSearch(q) {
 if (typeof q !== 'string' || q.length > 120) throw countError('Recherche trop longue.');
 const terms = q.trim().toLocaleLowerCase('fr').split(/\s+/).filter(Boolean).slice(0, 6);
 const escaped = terms.map(term => '%' + term.replace(/[=%_]/g, char => '=' + char) + '%');
 // The live catalogue mixes legacy collations between products and variants.
 // Normalize each text field before concatenation and UNION, without changing data.
 const text = sql => `CONVERT(${sql} USING utf8mb4) COLLATE utf8mb4_unicode_ci`;
 const expression = variant => `LOWER(CONCAT_WS(' ', ${text('p.designation')}, ${text('p.reference_2')}, CAST(p.id AS CHAR)${variant ? `, ${text('pv.variant_name')}, ${text('pv.reference')}` : ''}))`;
 const condition = variant => terms.length ? terms.map(() => `${expression(variant)} LIKE ? ESCAPE '='`).join(' AND ') : '1=1';
 const union = `SELECT p.id AS product_id, NULL AS variant_id, ${text("CONCAT('p:', p.id)")} AS entity_key,
   ${text('p.designation')} AS designation, ${text('NULL')} AS variant_name,
   COALESCE(NULLIF(${text('p.reference_2')}, ''), CAST(p.id AS CHAR)) AS reference, ${text('p.image_url')} AS image_url, ${text("'product'")} AS kind
   FROM products p WHERE COALESCE(p.is_deleted, 0) = 0 AND (${condition(false)})
   UNION ALL
   SELECT p.id AS product_id, pv.id AS variant_id, ${text("CONCAT('p:', p.id, ':v:', pv.id)")} AS entity_key,
   ${text('p.designation')} AS designation, ${text('pv.variant_name')} AS variant_name,
   COALESCE(NULLIF(${text('pv.reference')}, ''), NULLIF(${text('p.reference_2')}, ''), CAST(p.id AS CHAR)) AS reference,
   COALESCE(NULLIF(${text('pv.image_url')}, ''), ${text('p.image_url')}) AS image_url, ${text("'variant'")} AS kind
   FROM product_variants pv JOIN products p ON p.id = pv.product_id
   WHERE COALESCE(p.is_deleted, 0) = 0 AND COALESCE(pv.is_deleted, 0) = 0 AND (${condition(true)})`;
 return { union, params: [...escaped, ...escaped] };
}
export function groupCountSummary(rows) {
 const items = new Map();
 for (const row of rows) {
  if (!items.has(row.entity_key)) items.set(row.entity_key, { entity_key: row.entity_key, product_id: Number(row.product_id), variant_id: row.variant_id == null ? null : Number(row.variant_id), designation: row.designation, variant_name: row.variant_name || null, reference: String(row.reference || ''), quantity: 0, entry_count: 0, participants: [] });
  const item = items.get(row.entity_key), quantity = Number(row.quantity), count = Number(row.entry_count);
  item.quantity = Math.round((item.quantity + quantity) * 1000) / 1000; item.entry_count += count;
  item.participants.push({ name: row.name, quantity, entry_count: count });
 }
 return [...items.values()];
}
