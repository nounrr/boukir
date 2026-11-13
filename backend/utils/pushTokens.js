// The pool is loaded on first use so this module (and its tests) work without a database configured.
const getPool = async () => (await import('../db/pool.js')).default;

/**
 * Expo push tokens of the customers' phones (one customer can have several devices).
 * The table is created on first use, like the other small e-commerce tables.
 */
let ensured = null;

export async function ensurePushTokensSchema(dbArg) {
  const db = dbArg ?? (await getPool());
  ensured ??= db
    .query(
      `CREATE TABLE IF NOT EXISTS customer_push_tokens (
         id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
         contact_id INT NOT NULL,
         token VARCHAR(255) NOT NULL,
         platform VARCHAR(16) NULL,
         locale VARCHAR(8) NULL,
         created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         UNIQUE KEY uq_customer_push_token (token),
         KEY idx_customer_push_contact (contact_id)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    )
    .catch((error) => {
      ensured = null;
      throw error;
    });
  return ensured;
}

/** Expo tokens look like ExponentPushToken[xxxx] (or ExpoPushToken[xxxx]). */
export const isExpoPushToken = (value) => typeof value === 'string' && /^Expo(nent)?PushToken\[[^\]\s]+\]$/.test(value);

export async function saveToken(contactId, { token, platform = null, locale = null }, dbArg) {
  const db = dbArg ?? (await getPool());
  await ensurePushTokensSchema(db);
  // The same phone may be used by another account later: the token follows the latest signed-in customer.
  await db.query(
    `INSERT INTO customer_push_tokens (contact_id, token, platform, locale)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE contact_id = VALUES(contact_id), platform = VALUES(platform), locale = VALUES(locale)`,
    [contactId, token, platform, locale]
  );
}

export async function removeToken(token, contactId = null, dbArg) {
  const db = dbArg ?? (await getPool());
  await ensurePushTokensSchema(db);
  if (contactId != null) await db.query('DELETE FROM customer_push_tokens WHERE token = ? AND contact_id = ?', [token, contactId]);
  else await db.query('DELETE FROM customer_push_tokens WHERE token = ?', [token]);
}

export async function tokensOf(contactId, dbArg) {
  const db = dbArg ?? (await getPool());
  await ensurePushTokensSchema(db);
  const [rows] = await db.query('SELECT token FROM customer_push_tokens WHERE contact_id = ?', [contactId]);
  return rows.map((r) => r.token);
}
