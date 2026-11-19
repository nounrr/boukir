/**
 * Where one-time codes live: table contact_verification_codes, plus contacts.phone_verified.
 * Both are created on first use (same as the other ensure* helpers), and by the migration of 2026-11-19.
 */
import pool from '../db/pool.js';
import { getJwtSecret } from '../middleware/auth.js';
import {
  CODE_TTL_MINUTES,
  generateCode,
  hashCode,
  newRequestId,
  sendAllowed,
} from './otp.js';

let ready = null;

export function ensureOtpSchema(db = pool) {
  if (!ready) {
    ready = (async () => {
      await db.query(`CREATE TABLE IF NOT EXISTS contact_verification_codes (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        request_id VARCHAR(40) NOT NULL,
        purpose ENUM('register','verify','reset') NOT NULL,
        channel ENUM('email','phone') NOT NULL,
        target VARCHAR(255) NOT NULL,
        contact_id INT NULL,
        code_hash CHAR(64) NOT NULL,
        payload JSON NULL,
        attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
        expires_at DATETIME NOT NULL,
        consumed_at DATETIME NULL,
        ip VARCHAR(64) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_cvc_request (request_id),
        KEY idx_cvc_target (target, created_at),
        KEY idx_cvc_ip (ip, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      const [cols] = await db.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts' AND COLUMN_NAME = 'phone_verified'`,
      );
      if (!cols.length) await db.query('ALTER TABLE contacts ADD COLUMN phone_verified TINYINT(1) NOT NULL DEFAULT 0');
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

const secret = () => `${getJwtSecret()}:otp`;

/**
 * Creates a code for `target` and returns { request_id, code } (the caller sends the code), or
 * { blocked: true, retry_after } when too many were asked for.
 */
export async function createCode({ purpose, channel, target, contactId = null, payload = null, ip = null }, db = pool) {
  await ensureOtpSchema(db);
  const [recent] = await db.query(
    `SELECT created_at FROM contact_verification_codes
     WHERE target = ? AND created_at > (NOW() - INTERVAL 1 HOUR)`,
    [target],
  );
  const [[fromIp]] = await db.query(
    `SELECT COUNT(*) AS n FROM contact_verification_codes WHERE ip = ? AND created_at > (NOW() - INTERVAL 1 HOUR)`,
    [ip || ''],
  );
  // Times come back as the database's local time: compare them with the database's own clock.
  const [[clock]] = await db.query('SELECT NOW() AS now');
  const allowed = sendAllowed({ recent: recent.map((r) => r.created_at), fromIp: ip ? Number(fromIp.n) : 0, now: new Date(clock.now).getTime() });
  if (!allowed.ok) return { blocked: true, retry_after: allowed.retry_after };

  const requestId = newRequestId();
  const code = generateCode();
  // An older code for the same address and purpose stops working once a new one is sent.
  await db.query(
    `UPDATE contact_verification_codes SET consumed_at = NOW()
     WHERE target = ? AND purpose = ? AND consumed_at IS NULL`,
    [target, purpose],
  );
  await db.query(
    `INSERT INTO contact_verification_codes
       (request_id, purpose, channel, target, contact_id, code_hash, payload, expires_at, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW() + INTERVAL ? MINUTE, ?)`,
    [requestId, purpose, channel, target, contactId, hashCode(code, requestId, secret()), payload ? JSON.stringify(payload) : null, CODE_TTL_MINUTES, ip],
  );
  return { request_id: requestId, code };
}

/** The stored request, with `expires_at` turned into a real date and `payload` parsed. */
export async function findRequest(requestId, db = pool, { lock = false } = {}) {
  await ensureOtpSchema(db);
  const [rows] = await db.query(
    `SELECT *, TIMESTAMPDIFF(SECOND, NOW(), expires_at) AS seconds_left
     FROM contact_verification_codes WHERE request_id = ? LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [String(requestId || '').slice(0, 40)],
  );
  const row = rows[0];
  if (!row) return null;
  let payload = row.payload;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = null;
    }
  }
  return { ...row, payload, expires_at: new Date(Date.now() + Number(row.seconds_left) * 1000) };
}

export const otpSecret = secret;

export async function countAttempt(id, db = pool) {
  await db.query('UPDATE contact_verification_codes SET attempts = attempts + 1 WHERE id = ?', [id]);
}

export async function consume(id, db = pool) {
  await db.query('UPDATE contact_verification_codes SET consumed_at = NOW() WHERE id = ?', [id]);
}
