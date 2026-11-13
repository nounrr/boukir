import { Router, json } from 'express';
import pool from '../db/pool.js';
import { buildDailyPresence, isCalendarDate } from '../utils/pointageDaily.js';
import { pointageLocalDay, setPointageRequirement } from '../utils/pointageRequirements.js';
import { ensureAbsenceSchema } from '../utils/absences.js';
import { decodePointagePhoto, savePointagePhoto } from '../utils/pointagePhotos.js';
import { createHash, randomBytes } from 'node:crypto';
import { verifyToken, requireRole } from '../middleware/auth.js';
import { requireAbsencePermission } from '../utils/absencePermissions.js';
import { ensurePointageSchema, matchesPointageToken, normalizeWdlinkPassage, savePointageEvent, validPointageId } from '../utils/pointage.js';

export function readWdlinkConfig(env = process.env) {
  const deviceKey = env.WDLINK_DEVICE_KEY || '';
  const token = env.WDLINK_CALLBACK_TOKEN || '';
  const timezone = env.WDLINK_TIMEZONE || 'Africa/Casablanca';
  const direction = env.WDLINK_DIRECTION || 'inconnu';
  let attendanceMap;
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
    attendanceMap = JSON.parse(env.WDLINK_ATTENDANCE_MAP || '{}');
  } catch { return null; }
  if (!validPointageId(deviceKey) || !matchesPointageToken(token, token)
      || !['entree', 'sortie', 'inconnu'].includes(direction)
      || !attendanceMap || typeof attendanceMap !== 'object' || Array.isArray(attendanceMap)
      || Object.values(attendanceMap).some(value => !['entree', 'sortie'].includes(value))) return null;
  return { deviceKey, token, timezone, direction, attendanceMap };
}

export function createPointageRouters(db = pool, providedConfig) {
  const callback = Router();
  callback.use(json({ limit: '4mb' }));
  const admin = Router();
  let ready;
  function ensureSchema() {
    if (!ready) ready = ensurePointageSchema(db).catch(error => { ready = undefined; throw error; });
    return ready;
  }

  async function getConfig() {
    if (providedConfig) return providedConfig();
    await ensureSchema();
    const [[row]] = await db.query('SELECT * FROM pointage_device_config WHERE id = 1');
    if (!row) return readWdlinkConfig();
    const parsed = readWdlinkConfig({ WDLINK_DEVICE_KEY: row.device_key, WDLINK_CALLBACK_TOKEN: 'x'.repeat(43),
      WDLINK_TIMEZONE: row.timezone, WDLINK_DIRECTION: row.direction, WDLINK_ATTENDANCE_MAP: row.attendance_map });
    return parsed ? { ...parsed, token: undefined, tokenHash: row.callback_token_hash,
      localIp: row.local_ip, firmware: row.firmware } : null;
  }

  // Mounted before JWT middleware and request logging. The secret is never sent in query strings.
  callback.post('/:token', async (req, res) => {
    let config;
    try { config = await getConfig(); } catch { return res.status(503).json({ result: 0, success: false }); }
    if (!config) return res.status(503).json({ result: 0, success: false });
    const supplied = req.params.token;
    const authorized = config.tokenHash
      ? /^[A-Za-z0-9_-]{43,128}$/.test(supplied) && matchesPointageToken(createHash('sha256').update(supplied).digest('hex'), config.tokenHash)
      : matchesPointageToken(supplied, config.token);
    if (!authorized) return res.status(401).json({ result: 0, success: false });
    let event;
    try { event = normalizeWdlinkPassage(req.body, config); }
    catch { return res.status(400).json({ result: 0, success: false }); }
    try {
      if (event) {
        await ensureSchema();
        await savePointageEvent(db, event);
        await savePointagePhoto(db, event.eventKey, decodePointagePhoto(req.body.base64));
      }
      // Exact acknowledgement required by SDK section 2.13; only after durable insertion.
      return res.json({ result: 1, success: true });
    } catch {
      return res.status(503).json({ result: 0, success: false });
    }
  });

  callback.use((_req, res) => res.status(404).json({ result: 0, success: false }));
  callback.use((error, _req, res, _next) => res.status(error.status === 413 ? 413 : 400).json({ result: 0, success: false }));

  admin.use(verifyToken, requireAbsencePermission('gestion'));
  admin.use(async (_req, _res, next) => {
    try { await ensureSchema(); next(); } catch (error) { next(error); }
  });
  admin.patch('/employees/:id/requirement', requireRole('PDG'), async (req, res, next) => {
    const id = Number(req.params.id);
    if (!/^\d+$/.test(req.params.id) || !Number.isSafeInteger(id) || id <= 0 || typeof req.body?.obligatoire !== 'boolean') {
      return res.status(400).json({ message: 'Employé et case obligatoire valides requis.' });
    }
    try {
      const config = await getConfig();
      const today = pointageLocalDay(new Date(), config?.timezone || 'Africa/Casablanca');
      res.json(await setPointageRequirement(db, id, req.body.obligatoire, req.user.id, today));
    } catch (error) { if (error.status) return res.status(error.status).json({ message: error.message }); next(error); }
  });
  admin.get('/daily', async (req, res, next) => {
    try {
      const config = await getConfig();
      const timezone = config?.timezone || 'Africa/Casablanca';
      const now = new Date(), today = pointageLocalDay(now, timezone);
      const month = String(req.query.month || today.slice(0, 7));
      const day = req.query.day ? String(req.query.day) : '';
      const status = req.query.status ? String(req.query.status) : '';
      const employeeId = req.query.employe_id == null || req.query.employe_id === '' ? null : Number(req.query.employe_id);
      const search = String(req.query.search || '').trim();
      const page = Number(req.query.page || 1), limit = 50;
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 2020
          || (day && (!isCalendarDate(day) || !day.startsWith(month + '-')))
          || (status && !['absent', 'present', 'termine'].includes(status))
          || (employeeId !== null && (!Number.isSafeInteger(employeeId) || employeeId <= 0))
          || search.length > 200 || !Number.isSafeInteger(page) || page < 1 || page > 100000) {
        return res.status(400).json({ message: 'Filtres de présence invalides.' });
      }
      await ensureAbsenceSchema(db);
      const from = month + '-01';
      const [employeesResult, periodsResult, eventsResult, absencesResult] = await Promise.all([
        db.query(`SELECT id, nom_complet, cin, role, pointage_obligatoire,
          DATE_FORMAT(date_embauche, '%Y-%m-%d') AS date_embauche,
          DATE_FORMAT(deleted_at, '%Y-%m-%d') AS deleted_at FROM employees`),
        db.query(`SELECT employe_id, DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
          DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date FROM pointage_requirement_periods
          WHERE start_date < DATE_ADD(?, INTERVAL 1 MONTH) AND (end_date IS NULL OR end_date >= ?)`, [from, from]),
        db.query(`SELECT p.id, p.employe_id, p.direction,
          DATE_FORMAT(p.local_date, '%Y-%m-%d') AS local_date, TIME_FORMAT(p.local_time, '%H:%i:%s') AS local_time,
          DATE_FORMAT(p.occurred_at_utc, '%Y-%m-%d %H:%i:%s.%f') AS occurred_at_utc,
          EXISTS(SELECT 1 FROM pointage_event_photos photo WHERE photo.event_id = p.id) AS has_photo
          FROM pointage_events p WHERE p.local_date >= ? AND p.local_date < DATE_ADD(?, INTERVAL 1 MONTH)`, [from, from]),
        db.query(`SELECT id, employe_id, DATE_FORMAT(date_absence, '%Y-%m-%d') AS date_absence, type_absence, motif
          FROM employe_absences WHERE date_absence >= ? AND date_absence < DATE_ADD(?, INTERVAL 1 MONTH)`, [from, from]),
      ]);
      const report = buildDailyPresence({ month, employees: employeesResult[0], periods: periodsResult[0],
        events: eventsResult[0], absences: absencesResult[0], now, timezone });
      const needle = search.toLocaleLowerCase('fr');
      const filtered = report.data.filter(row => (!day || row.date_pointage === day)
        && (employeeId === null || row.employe_id === employeeId)
        && (!needle || `${row.nom_complet || ''} ${row.cin} ${row.role || ''}`.toLocaleLowerCase('fr').includes(needle)));
      const summary = filtered.reduce((totals, row) => {
        totals[row.statut]++; totals.temps_travail_minutes += row.temps_travail_minutes; return totals;
      }, { absent: 0, present: 0, termine: 0, temps_travail_minutes: 0 });
      const visible = status ? filtered.filter(row => row.statut === status) : filtered;
      const displayedIds = new Set(report.data.map(row => row.employe_id));
      res.set('Cache-Control', 'no-store');
      res.json({ ...report, data: visible.slice((page - 1) * limit, page * limit),
        pagination: { page, limit, total: visible.length }, summary,
        employees: employeesResult[0].filter(employee => !employee.deleted_at || displayedIds.has(Number(employee.id)))
          .map(employee => ({ id: Number(employee.id), nom_complet: employee.nom_complet, cin: employee.cin }))
          .sort((a, b) => (a.nom_complet || a.cin).localeCompare(b.nom_complet || b.cin, 'fr')),
      });
    } catch (error) { next(error); }
  });
  admin.get('/status', async (_req, res, next) => {
    try {
      const config = await getConfig();
      const [[last]] = await db.query('SELECT MAX(received_at) AS last_received_at FROM pointage_events');
      res.json({ configured: Boolean(config), device_key: config?.deviceKey || null,
        timezone: config?.timezone || 'Africa/Casablanca', direction: config?.direction || 'inconnu',
        attendance_map: config?.attendanceMap || {}, last_received_at: last?.last_received_at || null });
    } catch (error) { next(error); }
  });
  admin.get('/config', requireRole('PDG'), async (_req, res, next) => {
    try {
      const config = await getConfig();
      res.set('Cache-Control', 'no-store');
      res.json({ device_key: config?.deviceKey || '', timezone: config?.timezone || 'Africa/Casablanca',
        direction: config?.direction || 'inconnu', attendance_map: config?.attendanceMap || {},
        local_ip: config?.localIp || '', firmware: config?.firmware || '', configured: Boolean(config),
        public_origin: 'https://boukirdiamond.com' });
    } catch (error) { next(error); }
  });
  admin.put('/config', requireRole('PDG'), async (req, res, next) => {
    const body = req.body || {};
    const parsed = readWdlinkConfig({ WDLINK_DEVICE_KEY: body.device_key, WDLINK_CALLBACK_TOKEN: 'x'.repeat(43),
      WDLINK_TIMEZONE: body.timezone, WDLINK_DIRECTION: body.direction,
      WDLINK_ATTENDANCE_MAP: JSON.stringify(body.attendance_map ?? {}) });
    if (!parsed || typeof body.device_key !== 'string' || typeof body.local_ip !== 'string'
        || body.local_ip.length > 64 || typeof body.firmware !== 'string' || body.firmware.length > 120
        || (body.rotate_token !== undefined && typeof body.rotate_token !== 'boolean')) {
      return res.status(400).json({ message: 'Paramètres de pointeuse invalides.' });
    }
    let conn;
    try {
      conn = await db.getConnection();
      await conn.beginTransaction();
      // Lock the singleton even on first setup, so concurrent saves cannot lose the generated secret.
      await conn.query(`INSERT INTO pointage_device_config
        (id, device_key, callback_token_hash, timezone, direction, attendance_map) VALUES (1, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE id = id`, [parsed.deviceKey, '0'.repeat(64), parsed.timezone, parsed.direction, JSON.stringify(parsed.attendanceMap)]);
      const [[current]] = await conn.query('SELECT * FROM pointage_device_config WHERE id = 1 FOR UPDATE');
      const token = current.callback_token_hash === '0'.repeat(64) || body.rotate_token || current.device_key !== parsed.deviceKey
        ? randomBytes(32).toString('base64url') : null;
      const hash = token ? createHash('sha256').update(token).digest('hex') : current.callback_token_hash;
      await conn.query(`UPDATE pointage_device_config SET device_key = ?, callback_token_hash = ?, timezone = ?,
        direction = ?, attendance_map = ?, local_ip = ?, firmware = ?, updated_by = ? WHERE id = 1`,
      [parsed.deviceKey, hash, parsed.timezone, parsed.direction, JSON.stringify(parsed.attendanceMap), body.local_ip.trim(), body.firmware.trim(), req.user.id]);
      await conn.commit();
      res.set('Cache-Control', 'no-store');
      res.json({ saved: true, callback_url: token ? `https://boukirdiamond.com/api/pointage/wdlink/callback/${token}` : null });
    } catch (error) { if (conn) await conn.rollback(); next(error); }
    finally { conn?.release(); }
  });
  admin.get('/identities', async (_req, res, next) => {
    try {
      const [rows] = await db.query(`SELECT i.device_key, i.person_id, i.employe_id, e.nom_complet
        FROM pointage_identities i LEFT JOIN employees e ON e.id = i.employe_id ORDER BY i.person_id`);
      res.json(rows);
    } catch (error) { next(error); }
  });
  admin.put('/identities', async (req, res, next) => {
    const { device_key, person_id, employe_id } = req.body || {};
    let config;
    try { config = await getConfig(); } catch (error) { return next(error); }
    if (!config || device_key !== config.deviceKey || !validPointageId(person_id)
        || !Number.isSafeInteger(employe_id) || employe_id <= 0) {
      return res.status(400).json({ message: 'Appareil, identifiant ou employé invalide.' });
    }
    let conn;
    try {
      conn = await db.getConnection();
      await conn.beginTransaction();
      const [[employee]] = await conn.query('SELECT id FROM employees WHERE id = ? AND deleted_at IS NULL LIMIT 1', [employe_id]);
      if (!employee) { await conn.rollback(); return res.status(404).json({ message: 'Employé introuvable.' }); }
      await conn.query(`INSERT INTO pointage_identities (device_key, person_id, employe_id) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE person_id = VALUES(person_id)`, [device_key, person_id, employe_id]);
      const [[existing]] = await conn.query('SELECT employe_id FROM pointage_identities WHERE device_key = ? AND person_id = ? FOR UPDATE', [device_key, person_id]);
      if (Number(existing.employe_id) !== employe_id) {
        await conn.rollback();
        return res.status(409).json({ message: 'Cet identifiant est déjà associé à un autre employé.' });
      }
      await conn.query(`UPDATE pointage_events SET employe_id = ? WHERE device_key = ? AND person_id = ? AND employe_id IS NULL`, [employe_id, device_key, person_id]);
      await conn.commit();
      res.json({ device_key, person_id, employe_id });
    } catch (error) { if (conn) await conn.rollback(); next(error); }
    finally { conn?.release(); }
  });
  admin.get('/events/:id/photo', async (req, res, next) => {
    const id = Number(req.params.id);
    if (!/^\d+$/.test(req.params.id) || !Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'Pointage invalide.' });
    }
    try {
      const [[photo]] = await db.query('SELECT mime, image FROM pointage_event_photos WHERE event_id = ? LIMIT 1', [id]);
      if (!photo || !['image/jpeg', 'image/png'].includes(photo.mime)) return res.status(404).json({ message: 'Photo indisponible.' });
      res.set({ 'Content-Type': photo.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
      res.send(photo.image);
    } catch (error) { next(error); }
  });
  admin.get('/events', async (req, res, next) => {
    const month = String(req.query.month || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 2020) {
      return res.status(400).json({ message: 'Mois requis au format AAAA-MM.' });
    }
    const page = Number(req.query.page || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return res.status(400).json({ message: 'Page invalide.' });
    const from = `${month}-01`;
    try {
      const params = [from, from];
      const where = 'p.local_date >= ? AND p.local_date < DATE_ADD(?, INTERVAL 1 MONTH)';
      const [[count]] = await db.query(`SELECT COUNT(*) AS total FROM pointage_events p WHERE ${where}`, params);
      const [rows] = await db.query(`SELECT p.id, p.device_key, p.person_id, p.employe_id, e.nom_complet,
        DATE_FORMAT(p.local_date, '%Y-%m-%d') AS date_pointage, TIME_FORMAT(p.local_time, '%H:%i:%s') AS heure_pointage,
        p.timezone, p.method, p.direction, p.attendance, p.received_at,
        EXISTS(SELECT 1 FROM pointage_event_photos photo WHERE photo.event_id = p.id) AS has_photo
        FROM pointage_events p LEFT JOIN employees e ON e.id = p.employe_id
        WHERE ${where} ORDER BY p.occurred_at_utc DESC, p.id DESC LIMIT 100 OFFSET ?`, [...params, (page - 1) * 100]);
      res.json({ data: rows, pagination: { page, limit: 100, total: Number(count.total) } });
    } catch (error) { next(error); }
  });
  return { callback, admin };
}

const routers = createPointageRouters();
export const wdlinkCallbackRouter = routers.callback;
export default routers.admin;
