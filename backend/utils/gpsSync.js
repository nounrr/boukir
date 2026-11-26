/**
 * Brings the AlloGPS boxes' positions into vehicule_positions (source "boitier"), so everything that already shows
 * the fleet (app, back-office, delivery tracking, customers' order tracking) uses them without change.
 *
 * Every 30 s: the AlloGPS vehicle list (re-read every 10 minutes), then the position of each vehicle linked to one
 * of ours. A vehicle is linked by vehicules.gps_key: set by hand from the back-office or the app, or found
 * automatically when the AlloGPS name or plate matches our vehicle's plate.
 * A MySQL lock keeps the work to one server process when several run (pm2 cluster).
 * When AlloGPS does not answer, the next tries wait longer (1, 2, 5, then 10 minutes) and the same error is logged
 * once, not every 30 s. History older than 30 days is removed as the reading goes.
 */
import pool from '../db/pool.js';
import { ensureVehiculePositionTables } from '../routes/vehiculePositions.js';
import { allogpsConfigured, createAllogpsClient, plateKey } from './allogps.js';
import { checkArrivals } from './deliveryAlerts.js';

const EVERY_MS = 30000;
const LIST_EVERY_MS = 10 * 60000;
const BACKOFF_MS = [60000, 120000, 300000, 600000];
const HISTORY_DAYS = 30;

/** live: the last reading of every AlloGPS vehicle, linked or not: { [key]: { position, details, read_at, error } }. */
export const gpsState = { configured: false, lastSyncAt: null, lastError: null, vehicles: [], live: {}, updated: 0 };
/** At most this many AlloGPS vehicles are read each round. */
const MAX_READ = 80;

let columnReady = null;
export function ensureGpsColumn(db = pool) {
  if (!columnReady) {
    columnReady = (async () => {
      const [[col]] = await db.query(`SELECT COUNT(*) AS n FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicules' AND COLUMN_NAME = 'gps_key'`);
      if (!Number(col.n)) await db.query('ALTER TABLE vehicules ADD COLUMN gps_key VARCHAR(100) NULL, ADD UNIQUE KEY uq_vehicules_gps_key (gps_key)');
      // Engine on / off, as the box reports it (null for a phone).
      const [[ign]] = await db.query(`SELECT COUNT(*) AS n FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicule_positions' AND COLUMN_NAME = 'contact'`);
      if (!Number(ign.n)) await db.query('ALTER TABLE vehicule_positions ADD COLUMN contact TINYINT(1) NULL AFTER cap');
      // The trip keeps the heading and the engine too, for the day's detail.
      const [[hist]] = await db.query(`SELECT COUNT(*) AS n FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicule_positions_historique' AND COLUMN_NAME = 'cap'`);
      if (!Number(hist.n)) await db.query('ALTER TABLE vehicule_positions_historique ADD COLUMN cap DECIMAL(5,1) NULL AFTER vitesse_kmh, ADD COLUMN contact TINYINT(1) NULL AFTER cap');
      // The last reading, shared by every server process (only one of them reads AlloGPS).
      await db.query(`CREATE TABLE IF NOT EXISTS gps_etat (
        id TINYINT NOT NULL PRIMARY KEY,
        data LONGTEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`);
    })().catch((error) => {
      columnReady = null;
      throw error;
    });
  }
  return columnReady;
}

/** Our vehicles without a GPS link, matched to an AlloGPS vehicle whose plate or name is their plate. */
export function autoLinks(ours, gpsVehicles) {
  const taken = new Set(ours.map((v) => v.gps_key).filter(Boolean));
  const links = [];
  for (const v of ours) {
    if (v.gps_key) continue;
    const plate = plateKey(v.immatriculation);
    if (plate.length < 4) continue;
    const match = gpsVehicles.find((g) => !taken.has(g.key) && (plateKey(g.plate) === plate || plateKey(g.name).includes(plate)));
    if (match) {
      taken.add(match.key);
      links.push({ vehicule_id: v.id, gps_key: match.key });
    }
  }
  return links;
}

/** A position older than this is kept as the last known one but not added to the trip again. */
const MOVE_EPSILON = 0.00005; // about 5 m

export async function syncOnce({ db = pool, client = createAllogpsClient(), now = () => new Date() } = {}) {
  await ensureVehiculePositionTables(db);
  await ensureGpsColumn(db);
  if (!gpsState.vehicles.length || !gpsState.listedAt || now() - gpsState.listedAt > LIST_EVERY_MS) {
    gpsState.vehicles = await client.vehicles();
    gpsState.listedAt = now();
  }
  const [ours] = await db.query('SELECT id, nom, immatriculation, gps_key FROM vehicules WHERE deleted_at IS NULL');
  for (const link of autoLinks(ours, gpsState.vehicles)) {
    await db.query('UPDATE vehicules SET gps_key = ? WHERE id = ? AND gps_key IS NULL', [link.gps_key, link.vehicule_id]);
    const v = ours.find((o) => o.id === link.vehicule_id);
    if (v) v.gps_key = link.gps_key;
  }
  let updated = 0;
  const byKey = new Map(ours.filter((o) => o.gps_key).map((o) => [o.gps_key, o]));
  // Every AlloGPS vehicle is read (the GPS page shows them all), and every one of ours that has a box.
  const keys = [...new Set([...gpsState.vehicles.map((g) => g.key), ...byKey.keys()])].slice(0, MAX_READ);
  const live = {};
  for (const key of keys) {
    const v = byKey.get(key);
    let p;
    try {
      const reading = await client.reading(key);
      p = reading.position;
      live[key] = { position: p, details: reading.details, read_at: now(), error: null };
    } catch (error) {
      const message = `${error?.response?.status ?? ''} ${error?.message ?? error}`.trim();
      live[key] = { ...(gpsState.live[key] ?? {}), error: message };
      gpsState.lastError = `${v?.nom ?? key}: ${message}`;
      continue;
    }
    if (!p || !v) continue;
    const at = p.recorded_at && p.recorded_at <= now() ? p.recorded_at : now();
    const contact = p.contact == null ? null : p.contact ? 1 : 0;
    const [[last]] = await db.query('SELECT latitude, longitude, recorded_at FROM vehicule_positions_historique WHERE vehicule_id = ? ORDER BY recorded_at DESC LIMIT 1', [v.id]);
    await db.query(
      `INSERT INTO vehicule_positions (vehicule_id, latitude, longitude, vitesse_kmh, cap, contact, precision_m, source, employe_id, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 'boitier', NULL, ?)
       ON DUPLICATE KEY UPDATE latitude = VALUES(latitude), longitude = VALUES(longitude), vitesse_kmh = VALUES(vitesse_kmh), cap = VALUES(cap),
         contact = VALUES(contact), precision_m = NULL, source = 'boitier', employe_id = NULL, recorded_at = VALUES(recorded_at)`,
      [v.id, p.latitude, p.longitude, p.vitesse_kmh, p.cap, contact, at],
    );
    const moved = !last || Math.abs(Number(last.latitude) - p.latitude) > MOVE_EPSILON || Math.abs(Number(last.longitude) - p.longitude) > MOVE_EPSILON;
    // A still vehicle still gets a point every 5 minutes, so the day shows how long it stood where.
    const stale = last && at - new Date(last.recorded_at) >= 5 * 60000;
    if (moved || stale) {
      await db.query('INSERT INTO vehicule_positions_historique (vehicule_id, latitude, longitude, vitesse_kmh, cap, contact, employe_id, recorded_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)', [
        v.id, p.latitude, p.longitude, p.vitesse_kmh, p.cap, contact, at,
      ]);
    }
    // Customers this vehicle is now close to get their "the driver arrives" alert (once).
    await checkArrivals(v.id, p, { db }).catch((error) => console.warn('[allogps] arrival alert:', error?.message || error));
    updated += 1;
  }
  gpsState.live = live;
  await db.query(`DELETE FROM vehicule_positions_historique WHERE recorded_at < NOW() - INTERVAL ${HISTORY_DAYS} DAY LIMIT 500`);
  gpsState.updated = updated;
  gpsState.lastSyncAt = now();
  await saveGpsState(db);
  return updated;
}

/** Writes the last reading where the other server processes can read it. */
export async function saveGpsState(db = pool) {
  const data = JSON.stringify({ lastSyncAt: gpsState.lastSyncAt, lastError: gpsState.lastError, vehicles: gpsState.vehicles, live: gpsState.live, updated: gpsState.updated });
  await db.query('INSERT INTO gps_etat (id, data) VALUES (1, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)', [data]);
}

/**
 * The last reading: this process's own when it is the one reading AlloGPS (fresh), else the one saved by the
 * process that reads it. Dates come back as Date objects.
 */
export async function currentGpsState(db = pool, now = Date.now()) {
  const own = gpsState.lastSyncAt && now - new Date(gpsState.lastSyncAt).getTime() < 90000;
  if (own) return gpsState;
  try {
    await ensureGpsColumn(db);
    const [[row]] = await db.query('SELECT data FROM gps_etat WHERE id = 1');
    if (!row) return gpsState;
    const saved = JSON.parse(row.data);
    return {
      ...gpsState,
      lastSyncAt: saved.lastSyncAt ? new Date(saved.lastSyncAt) : null,
      lastError: saved.lastError ?? null,
      vehicles: Array.isArray(saved.vehicles) ? saved.vehicles : [],
      live: saved.live && typeof saved.live === 'object' ? saved.live : {},
      updated: Number(saved.updated) || 0,
    };
  } catch {
    return gpsState;
  }
}

let timer = null;
export function startGpsSync({ db = pool } = {}) {
  gpsState.configured = allogpsConfigured();
  if (!gpsState.configured || process.env.ALLOGPS_SYNC === '0' || timer) return;
  const client = createAllogpsClient();
  let failures = 0;
  let resumeAt = 0;
  const tick = async () => {
    if (Date.now() < resumeAt) return;
    let locked = false;
    // MySQL's named lock belongs to one connection: it is taken and released on the same one (a pool would hand
    // the release to another connection, the lock would stay held, and the reading would stop after one round).
    const conn = typeof db.getConnection === 'function' ? await db.getConnection().catch(() => null) : null;
    const lockDb = conn ?? db;
    try {
      const [[lock]] = await lockDb.query("SELECT GET_LOCK('allogps_sync', 0) AS ok");
      locked = Number(lock?.ok) === 1;
      if (!locked) return;
      await syncOnce({ db, client });
      if (failures) console.log('[allogps] reading again');
      failures = 0;
      gpsState.lastError = null;
    } catch (error) {
      const message = `${error?.response?.status ?? ''} ${error?.code ?? ''} ${error?.message ?? error}`.trim();
      // The same failure is logged once; the next tries are spaced out until AlloGPS answers again.
      if (message !== gpsState.lastError) console.error('[allogps] sync failed:', message);
      gpsState.lastError = message;
      await saveGpsState(db).catch(() => {});
      resumeAt = Date.now() + BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)];
      failures += 1;
    } finally {
      if (locked) await lockDb.query("SELECT RELEASE_LOCK('allogps_sync')").catch(() => {});
      conn?.release();
    }
  };
  tick();
  timer = setInterval(tick, EVERY_MS);
  timer.unref?.();
  console.log('📡 AlloGPS: suivi des véhicules toutes les 30 s');
}
