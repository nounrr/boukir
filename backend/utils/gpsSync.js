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

export const gpsState = { configured: false, lastSyncAt: null, lastError: null, vehicles: [], updated: 0 };

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
  for (const v of ours.filter((o) => o.gps_key)) {
    let p;
    try {
      p = await client.position(v.gps_key);
    } catch (error) {
      gpsState.lastError = `${v.nom}: ${error?.response?.status ?? ''} ${error?.message ?? error}`.trim();
      continue;
    }
    if (!p) continue;
    const at = p.recorded_at && p.recorded_at <= now() ? p.recorded_at : now();
    const [[last]] = await db.query('SELECT latitude, longitude, recorded_at FROM vehicule_positions WHERE vehicule_id = ?', [v.id]);
    await db.query(
      `INSERT INTO vehicule_positions (vehicule_id, latitude, longitude, vitesse_kmh, cap, contact, precision_m, source, employe_id, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 'boitier', NULL, ?)
       ON DUPLICATE KEY UPDATE latitude = VALUES(latitude), longitude = VALUES(longitude), vitesse_kmh = VALUES(vitesse_kmh), cap = VALUES(cap),
         contact = VALUES(contact), precision_m = NULL, source = 'boitier', employe_id = NULL, recorded_at = VALUES(recorded_at)`,
      [v.id, p.latitude, p.longitude, p.vitesse_kmh, p.cap, p.contact == null ? null : p.contact ? 1 : 0, at],
    );
    const moved = !last || Math.abs(Number(last.latitude) - p.latitude) > MOVE_EPSILON || Math.abs(Number(last.longitude) - p.longitude) > MOVE_EPSILON;
    if (moved) {
      await db.query('INSERT INTO vehicule_positions_historique (vehicule_id, latitude, longitude, vitesse_kmh, employe_id, recorded_at) VALUES (?, ?, ?, ?, NULL, ?)', [
        v.id, p.latitude, p.longitude, p.vitesse_kmh, at,
      ]);
    }
    // Customers this vehicle is now close to get their "the driver arrives" alert (once).
    await checkArrivals(v.id, p, { db }).catch((error) => console.warn('[allogps] arrival alert:', error?.message || error));
    updated += 1;
  }
  await db.query(`DELETE FROM vehicule_positions_historique WHERE recorded_at < NOW() - INTERVAL ${HISTORY_DAYS} DAY LIMIT 500`);
  gpsState.updated = updated;
  gpsState.lastSyncAt = now();
  return updated;
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
    try {
      const [[lock]] = await db.query("SELECT GET_LOCK('allogps_sync', 0) AS ok");
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
      resumeAt = Date.now() + BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)];
      failures += 1;
    } finally {
      if (locked) await db.query("SELECT RELEASE_LOCK('allogps_sync')").catch(() => {});
    }
  };
  tick();
  timer = setInterval(tick, EVERY_MS);
  timer.unref?.();
  console.log('📡 AlloGPS: suivi des véhicules toutes les 30 s');
}
