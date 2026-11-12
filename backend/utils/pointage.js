import { createHash, timingSafeEqual } from 'node:crypto';

export function validPointageId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

export function matchesPointageToken(supplied, expected) {
  if (typeof expected !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(expected)) return false;
  if (typeof supplied !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(supplied) || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

// V5 firmware sends either a scalar code or { attendanceId, attendanceStatus }.
// The ID is authoritative; translated labels must never determine the direction.
export function normalizeWdlinkAttendance(value) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    value = Object.hasOwn(value, 'attendanceId') ? value.attendanceId : null;
  }
  if (value == null) return '';
  if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error('Statut de pointage invalide');
  }
  const code = String(value).trim();
  if (code.length > 32) throw new Error('Statut de pointage invalide');
  return code;
}

// HTTP LAN V5.1.14, section 2.13. Never retain photos or biometric templates.
export function normalizeWdlinkPassage(body, config) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Passage invalide');
  if (body.deviceKey !== config.deviceKey) throw new Error('Appareil inconnu');
  const type = String(body.type || '');
  const match = /^(face|finger|faceAndFinger|faceAndcard|card|password|faceAndQrCode|cardAndPassword|qrCode|idNumber|idcard)_([012])$/.exec(type);
  if (!match) throw new Error('Type de reconnaissance non pris en charge');
  // Recognition failed, stranger, failed liveness: acknowledge without creating attendance.
  if (match[2] === '2' || String(body.identifyType || '1') !== '1' || String(body.aliveType) === '2'
      || ['STRANGERBABY', 'IDCARD'].includes(body.personId)) return null;
  if (!validPointageId(body.personId)) throw new Error('Identifiant employé invalide');
  const rawTime = String(body.time || '');
  if (!/^\d{13}$/.test(rawTime)) throw new Error('Horodatage milliseconde invalide');
  const timestamp = Number(rawTime);
  if (timestamp < Date.UTC(2020, 0, 1) || timestamp > Date.now() + 86400000) throw new Error('Date de pointage invalide');
  const attendance = normalizeWdlinkAttendance(body.attendance);
  const direction = (Object.hasOwn(config.attendanceMap || {}, attendance) ? config.attendanceMap[attendance] : null) || config.direction || 'inconnu';
  if (!['entree', 'sortie', 'inconnu'].includes(direction)) throw new Error('Configuration entrée/sortie invalide');
  const date = new Date(timestamp);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: config.timezone || 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(part => [part.type, part.value]));
  return {
    eventKey: createHash('sha256').update(JSON.stringify([body.deviceKey, body.personId, rawTime, type, attendance])).digest('hex'),
    deviceKey: body.deviceKey, personId: body.personId, timestamp,
    occurredAtUtc: date.toISOString().slice(0, 23).replace('T', ' '),
    localDate: `${parts.year}-${parts.month}-${parts.day}`,
    localTime: `${parts.hour}:${parts.minute}:${parts.second}`,
    timezone: config.timezone || 'Africa/Casablanca', method: match[1], direction, attendance,
  };
}

export async function ensurePointageSchema(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS pointage_device_config (
    id INT NOT NULL PRIMARY KEY, device_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    callback_token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    timezone VARCHAR(64) NOT NULL, direction VARCHAR(16) NOT NULL DEFAULT 'inconnu',
    attendance_map TEXT NOT NULL, local_ip VARCHAR(64) NOT NULL DEFAULT '', firmware VARCHAR(120) NOT NULL DEFAULT '',
    updated_by INT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.query(`CREATE TABLE IF NOT EXISTS pointage_identities (
    device_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    person_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    employe_id INT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (device_key, person_id), KEY idx_pointage_identity_employee (employe_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.query(`CREATE TABLE IF NOT EXISTS pointage_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    event_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    device_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    person_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    employe_id INT NULL, occurred_at_utc DATETIME(3) NOT NULL,
    local_date DATE NOT NULL, local_time TIME NOT NULL, timezone VARCHAR(64) NOT NULL,
    method VARCHAR(32) NOT NULL, direction ENUM('entree','sortie','inconnu') NOT NULL,
    attendance VARCHAR(32) NOT NULL DEFAULT '', received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_pointage_event (event_key), KEY idx_pointage_day (local_date, employe_id),
    KEY idx_pointage_person (device_key, person_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

export async function savePointageEvent(db, event) {
  // Atomic assignment + insert. Unique key makes concurrent callbacks/replays idempotent.
  await db.query(`INSERT INTO pointage_events
    (event_key, device_key, person_id, employe_id, occurred_at_utc, local_date, local_time, timezone, method, direction, attendance)
    SELECT ?, ?, ?, (SELECT i.employe_id FROM pointage_identities i JOIN employees e ON e.id = i.employe_id
      WHERE i.device_key = ? AND i.person_id = ? AND e.deleted_at IS NULL LIMIT 1), ?, ?, ?, ?, ?, ?, ?
    ON DUPLICATE KEY UPDATE event_key = VALUES(event_key)`,
  [event.eventKey, event.deviceKey, event.personId, event.deviceKey, event.personId,
    event.occurredAtUtc, event.localDate, event.localTime, event.timezone, event.method, event.direction, event.attendance]);
}
