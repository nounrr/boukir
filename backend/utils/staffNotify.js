import { sendExpoPush } from './customerNotify.js';
import { isExpoPushToken } from './pushTokens.js';
import { staffEventText, staffEventTexts } from './staffEvents.js';

// The pool is loaded on first use so this module (and its tests) work without a database configured.
const getPool = async () => (await import('../db/pool.js')).default;

/**
 * Expo push tokens of the team's phones (one employee can have several devices).
 * The table is created on first use, like the customers' one.
 */
let ensured = null;

export async function ensureStaffPushSchema(dbArg) {
  const db = dbArg ?? (await getPool());
  ensured ??= db
    .query(
      `CREATE TABLE IF NOT EXISTS staff_push_tokens (
         id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
         employee_id INT NOT NULL,
         token VARCHAR(255) NOT NULL,
         platform VARCHAR(16) NULL,
         locale VARCHAR(8) NULL,
         created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         UNIQUE KEY uq_staff_push_token (token),
         KEY idx_staff_push_employee (employee_id)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    )
    .catch((error) => {
      ensured = null;
      throw error;
    });
  return ensured;
}

export async function saveStaffToken(employeeId, { token, platform = null, locale = null }, dbArg) {
  const db = dbArg ?? (await getPool());
  await ensureStaffPushSchema(db);
  // The same phone may be used by another employee later: the token follows the latest one signed in.
  await db.query(
    `INSERT INTO staff_push_tokens (employee_id, token, platform, locale)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE employee_id = VALUES(employee_id), platform = VALUES(platform), locale = VALUES(locale)`,
    [employeeId, token, platform, locale]
  );
}

export async function removeStaffToken(token, employeeId = null, dbArg) {
  const db = dbArg ?? (await getPool());
  await ensureStaffPushSchema(db);
  if (employeeId != null) await db.query('DELETE FROM staff_push_tokens WHERE token = ? AND employee_id = ?', [token, employeeId]);
  else await db.query('DELETE FROM staff_push_tokens WHERE token = ?', [token]);
}

/** The name shown as the author of an action. */
export async function employeeName(id, dbArg) {
  if (!id) return null;
  try {
    const db = dbArg ?? (await getPool());
    const [rows] = await db.query('SELECT nom_complet FROM employees WHERE id = ? LIMIT 1', [id]);
    return rows?.[0]?.nom_complet ?? null;
  } catch {
    return null;
  }
}

/** Phones of the employees who hold one of the roles or are named, the author of the action excepted. */
export async function staffTokens({ roles = [], userIds = [], exceptId = null }, dbArg) {
  if (!roles.length && !userIds.length) return [];
  const db = dbArg ?? (await getPool());
  await ensureStaffPushSchema(db);
  const where = [];
  const params = [];
  if (roles.length) {
    where.push(`e.role IN (${roles.map(() => '?').join(', ')})`);
    params.push(...roles);
  }
  if (userIds.length) {
    where.push(`e.id IN (${userIds.map(() => '?').join(', ')})`);
    params.push(...userIds);
  }
  let sql = `SELECT t.token, t.locale
               FROM staff_push_tokens t
               JOIN employees e ON e.id = t.employee_id AND e.deleted_at IS NULL
              WHERE (${where.join(' OR ')})`;
  if (exceptId != null) {
    sql += ' AND e.id <> ?';
    params.push(exceptId);
  }
  const [rows] = await db.query(sql, params);
  return rows;
}

/**
 * Tells the team about an important action, live and on their phones:
 *  - a Socket.IO event `staff:notification` for an open app (the text comes in every language, each app shows its own);
 *  - an Expo push notification for a closed app.
 * The person who did the action is not told. Never throws: a notification must not make a successful operation fail.
 */
export async function notifyStaff(event, { actorId = null } = {}, deps = {}) {
  if (!event) return { sent: 0 };
  const roles = event.roles ?? [];
  const userIds = (event.userIds ?? []).filter((id) => id !== actorId);
  const payload = { kind: event.kind, text: staffEventTexts(event), href: event.href ?? null, data: event.data ?? {}, at: new Date().toISOString() };
  try {
    const emit = deps.emit ?? (await import('../socket/socketServer.js')).emitToStaff;
    emit({ roles, userIds, exceptId: actorId }, 'staff:notification', payload);
  } catch (error) {
    console.warn('Staff socket notification failed:', error?.message || error);
  }
  try {
    const rows = (await (deps.tokensOf ?? staffTokens)({ roles, userIds, exceptId: actorId })).filter((row) => isExpoPushToken(row.token));
    if (!rows.length) return { sent: 0 };
    const send = deps.send ?? ((messages) => sendExpoPush(messages, { onDead: (token) => removeStaffToken(token) }));
    return await send(
      rows.map((row) => ({ to: row.token, ...staffEventText(event, row.locale), sound: 'default', priority: 'high', channelId: 'team', data: { href: payload.href, kind: payload.kind, ...payload.data } }))
    );
  } catch (error) {
    console.warn('Staff push notification failed:', error?.message || error);
    return { sent: 0 };
  }
}
