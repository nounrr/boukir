import express from 'express';
import pool from '../db/pool.js';
import { requireRoles } from '../middleware/auth.js';
import { currentGpsState, ensureGpsColumn } from '../utils/gpsSync.js';
import { checkArrivals } from '../utils/deliveryAlerts.js';
import { tripStats } from '../utils/tripStats.js';

/**
 * Suivi GPS des véhicules.
 *
 * Le téléphone du chauffeur (application mobile, espace équipe) envoie la position du véhicule qu'il conduit ;
 * la direction voit la dernière position de chaque véhicule et son trajet récent. Les boîtiers AlloGPS sont lus
 * par le serveur toutes les 30 s (utils/gpsSync.js) et écrivent dans les mêmes tables (source « boitier ») ; un
 * véhicule équipé d'un boîtier ne prend plus la position du téléphone tant que le boîtier répond.
 *
 *  POST /api/vehicule-positions/:vehiculeId          enregistrer une position (tout employé connecté)
 *  GET  /api/vehicule-positions                      dernière position de chaque véhicule (direction)
 *  GET  /api/vehicule-positions/:vehiculeId/trajet   points des dernières heures (direction)
 *  GET  /api/vehicule-positions/gps                  état du suivi AlloGPS et véhicules du boîtier (direction)
 *  PUT  /api/vehicule-positions/gps/link             relier un de nos véhicules à un véhicule AlloGPS (direction)
 *  GET  /api/vehicule-positions/:vehiculeId/jour     un jour du véhicule : position, données du boîtier, trajet,
 *                                                    distance, vitesses, arrêts (?date=AAAA-MM-JJ, aujourd'hui par défaut)
 *  GET  /api/vehicule-positions/:vehiculeId/jours    les jours qui ont un trajet (30 derniers)
 *
 * L'historique est gardé 30 jours.
 */
const VIEWERS = ['PDG', 'ManagerPlus', 'Manager', 'ChefChauffeur'];
const LINKERS = ['PDG', 'ManagerPlus', 'Manager'];
/** While a GPS box has sent a position less than this long ago, the driver's phone does not replace it. */
const BOX_FRESH_MINUTES = 3;
const HISTORY_DAYS = 30;

let ready = null;
export function ensureVehiculePositionTables(db = pool) {
  if (!ready) {
    ready = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS vehicule_positions (
          vehicule_id INT NOT NULL PRIMARY KEY,
          latitude DECIMAL(10,7) NOT NULL,
          longitude DECIMAL(10,7) NOT NULL,
          vitesse_kmh DECIMAL(6,1) NULL,
          cap DECIMAL(5,1) NULL,
          precision_m DECIMAL(7,1) NULL,
          source VARCHAR(20) NOT NULL DEFAULT 'telephone',
          employe_id INT NULL,
          recorded_at DATETIME NOT NULL,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`);
      await db.query(`
        CREATE TABLE IF NOT EXISTS vehicule_positions_historique (
          id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          vehicule_id INT NOT NULL,
          latitude DECIMAL(10,7) NOT NULL,
          longitude DECIMAL(10,7) NOT NULL,
          vitesse_kmh DECIMAL(6,1) NULL,
          employe_id INT NULL,
          recorded_at DATETIME NOT NULL,
          INDEX idx_vehicule_date (vehicule_id, recorded_at)
        )`);
    })().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

const finite = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : NaN);

/**
 * Une position reçue, vérifiée : latitude et longitude réelles, vitesse en km/h (0 à 250), cap 0 à 360.
 * Renvoie null quand elle n'est pas exploitable.
 */
export function parsePosition(body) {
  const latitude = finite(body?.latitude);
  const longitude = finite(body?.longitude);
  if (latitude === null || longitude === null || Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  // (0, 0) est la réponse d'un GPS sans signal, pas une position.
  if (latitude === 0 && longitude === 0) return null;
  const within = (v, min, max) => (v === null || Number.isNaN(v) || v < min || v > max ? null : v);
  return {
    latitude: Math.round(latitude * 1e7) / 1e7,
    longitude: Math.round(longitude * 1e7) / 1e7,
    vitesse_kmh: within(finite(body?.vitesse_kmh), 0, 250),
    cap: within(finite(body?.cap), 0, 360),
    precision_m: within(finite(body?.precision_m), 0, 100000),
    source: body?.source === 'boitier' ? 'boitier' : 'telephone',
  };
}

const numOrNull = (v) => (v == null ? null : Number(v));

/** A day as AAAA-MM-JJ (today, on the server's clock, when none is given), or null when it is not a real date. */
export function dayOf(raw, now = new Date()) {
  if (raw == null || raw === '') {
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
  const text = String(raw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const d = new Date(`${text}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== text ? null : text;
}

const idOf = (raw) => {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const ensureAll = async (db) => {
  await ensureVehiculePositionTables(db);
  await ensureGpsColumn(db);
};

export function createVehiculePositionsRouter({ db = pool, ensure = ensureAll } = {}) {
  const router = express.Router();
  router.use(async (_req, _res, next) => {
    try {
      await ensure(db);
      next();
    } catch (error) {
      next(error);
    }
  });

  // Dernière position connue de chaque véhicule (les véhicules sans position sont listés aussi).
  router.get('/', requireRoles(...VIEWERS), async (_req, res, next) => {
    try {
      const [rows] = await db.query(`
        SELECT v.id, v.nom, v.immatriculation, v.gps_key,
               p.latitude, p.longitude, p.vitesse_kmh, p.cap, p.contact, p.precision_m, p.source, p.recorded_at,
               e.nom_complet AS chauffeur
          FROM vehicules v
          LEFT JOIN vehicule_positions p ON p.vehicule_id = v.id
          LEFT JOIN employees e ON e.id = p.employe_id
         ORDER BY v.nom ASC`);
      res.set('Cache-Control', 'no-store');
      res.json(
        rows.map((r) => ({
          id: r.id,
          nom: r.nom,
          immatriculation: r.immatriculation ?? null,
          gps: !!r.gps_key,
          position:
            r.latitude == null
              ? null
              : {
                  latitude: Number(r.latitude),
                  longitude: Number(r.longitude),
                  vitesse_kmh: r.vitesse_kmh == null ? null : Number(r.vitesse_kmh),
                  cap: r.cap == null ? null : Number(r.cap),
                  contact: r.contact == null ? null : Number(r.contact) === 1,
                  precision_m: r.precision_m == null ? null : Number(r.precision_m),
                  source: r.source,
                  recorded_at: r.recorded_at,
                  chauffeur: r.chauffeur ?? null,
                },
        })),
      );
    } catch (error) {
      next(error);
    }
  });

  // Suivi AlloGPS : configuré ou non, dernière lecture, et les véhicules du boîtier avec le nôtre qui leur est relié.
  router.get('/gps', requireRoles(...VIEWERS), async (_req, res, next) => {
    try {
      const [ours] = await db.query('SELECT id, nom, immatriculation, gps_key FROM vehicules WHERE deleted_at IS NULL ORDER BY nom ASC');
      const gpsState = await currentGpsState(db);
      res.set('Cache-Control', 'no-store');
      res.json({
        configured: gpsState.configured,
        last_sync_at: gpsState.lastSyncAt,
        last_error: gpsState.lastError,
        updated: gpsState.updated,
        vehicles: gpsState.vehicles.map((g) => {
          const linked = ours.find((o) => o.gps_key === g.key);
          const live = gpsState.live[g.key] ?? {};
          return {
            ...g,
            vehicule: linked ? { id: linked.id, nom: linked.nom, immatriculation: linked.immatriculation } : null,
            position: live.position ?? null,
            read_at: live.read_at ?? null,
            error: live.error ?? null,
          };
        }),
        // Our vehicles, to choose the one an AlloGPS vehicle is.
        ours: ours.map((o) => ({ id: o.id, nom: o.nom, immatriculation: o.immatriculation ?? null, gps_key: o.gps_key ?? null })),
      });
    } catch (error) {
      next(error);
    }
  });

  // Relier (ou délier, gps_key vide) un de nos véhicules à un véhicule AlloGPS.
  router.put('/gps/link', requireRoles(...LINKERS), async (req, res, next) => {
    try {
      const id = idOf(req.body?.vehicule_id);
      const key = req.body?.gps_key == null || req.body.gps_key === '' ? null : String(req.body.gps_key).trim().slice(0, 100);
      if (!id) return res.status(400).json({ message: 'Véhicule invalide' });
      const gpsState = await currentGpsState(db);
      if (key && gpsState.vehicles.length && !gpsState.vehicles.some((g) => g.key === key)) {
        return res.status(400).json({ message: "Ce véhicule n'existe pas chez AlloGPS" });
      }
      // Un boîtier ne suit qu'un véhicule : il est retiré de l'ancien avant d'être donné au nouveau.
      if (key) await db.query('UPDATE vehicules SET gps_key = NULL WHERE gps_key = ? AND id <> ?', [key, id]);
      const [result] = await db.query('UPDATE vehicules SET gps_key = ? WHERE id = ?', [key, id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Véhicule introuvable' });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  // Le trajet récent d'un véhicule (24 h par défaut, 7 jours au plus, 1000 points au plus).
  router.get('/:vehiculeId/trajet', requireRoles(...VIEWERS), async (req, res, next) => {
    try {
      const id = idOf(req.params.vehiculeId);
      if (!id) return res.status(400).json({ message: 'Véhicule invalide' });
      const hours = Math.min(168, Math.max(1, Number.parseInt(req.query.heures, 10) || 24));
      const [rows] = await db.query(
        `SELECT latitude, longitude, vitesse_kmh, recorded_at
           FROM vehicule_positions_historique
          WHERE vehicule_id = ? AND recorded_at >= NOW() - INTERVAL ? HOUR
          ORDER BY recorded_at ASC LIMIT 1000`,
        [id, hours],
      );
      res.set('Cache-Control', 'no-store');
      res.json(rows.map((r) => ({ latitude: Number(r.latitude), longitude: Number(r.longitude), vitesse_kmh: r.vitesse_kmh == null ? null : Number(r.vitesse_kmh), recorded_at: r.recorded_at })));
    } catch (error) {
      next(error);
    }
  });

  // Un jour du véhicule, tout ce qui est connu : le véhicule, sa dernière position, les données brutes du boîtier,
  // les points du jour et ce qu'on en tire (distance, vitesse max et moyenne, temps de conduite, arrêts).
  router.get('/:vehiculeId/jour', requireRoles(...VIEWERS), async (req, res, next) => {
    try {
      const id = idOf(req.params.vehiculeId);
      if (!id) return res.status(400).json({ message: 'Véhicule invalide' });
      const date = dayOf(req.query.date);
      if (!date) return res.status(400).json({ message: 'Date invalide (AAAA-MM-JJ)' });
      const [[v]] = await db.query('SELECT * FROM vehicules WHERE id = ?', [id]);
      if (!v) return res.status(404).json({ message: 'Véhicule introuvable' });
      const [[p]] = await db.query(
        'SELECT p.*, e.nom_complet AS chauffeur FROM vehicule_positions p LEFT JOIN employees e ON e.id = p.employe_id WHERE p.vehicule_id = ?',
        [id],
      );
      const [rows] = await db.query(
        `SELECT * FROM vehicule_positions_historique
          WHERE vehicule_id = ? AND recorded_at >= ? AND recorded_at < ? + INTERVAL 1 DAY
          ORDER BY recorded_at ASC LIMIT 5000`,
        [id, `${date} 00:00:00`, `${date} 00:00:00`],
      );
      const points = rows.map((r) => ({
        latitude: Number(r.latitude),
        longitude: Number(r.longitude),
        vitesse_kmh: numOrNull(r.vitesse_kmh),
        cap: numOrNull(r.cap),
        contact: r.contact == null ? null : Number(r.contact) === 1,
        recorded_at: r.recorded_at,
      }));
      const gpsState = await currentGpsState(db);
      const live = v.gps_key ? gpsState.live[v.gps_key] : null;
      const box = v.gps_key ? gpsState.vehicles.find((g) => g.key === v.gps_key) : null;
      res.set('Cache-Control', 'no-store');
      res.json({
        date,
        vehicule: {
          id: v.id,
          nom: v.nom,
          immatriculation: v.immatriculation ?? null,
          marque: v.marque ?? null,
          modele: v.modele ?? null,
          annee: v.annee ?? null,
          type: v.type_vehicule ?? null,
          statut: v.statut ?? null,
          gps_key: v.gps_key ?? null,
          boitier: box ? { name: box.name, plate: box.plate, agency: box.agency } : null,
        },
        position: p
          ? {
              latitude: Number(p.latitude),
              longitude: Number(p.longitude),
              vitesse_kmh: numOrNull(p.vitesse_kmh),
              cap: numOrNull(p.cap),
              contact: p.contact == null ? null : Number(p.contact) === 1,
              precision_m: numOrNull(p.precision_m),
              source: p.source,
              recorded_at: p.recorded_at,
              chauffeur: p.chauffeur ?? null,
            }
          : null,
        // What the box reported at its last reading: address, odometer, fuel… and every raw value.
        boitier: live ? { read_at: live.read_at ?? null, error: live.error ?? null, extra: live.position?.extra ?? null, details: live.details ?? [] } : null,
        points,
        stats: tripStats(points),
      });
    } catch (error) {
      next(error);
    }
  });

  // Les jours qui ont un trajet (30 derniers jours), du plus récent au plus ancien.
  router.get('/:vehiculeId/jours', requireRoles(...VIEWERS), async (req, res, next) => {
    try {
      const id = idOf(req.params.vehiculeId);
      if (!id) return res.status(400).json({ message: 'Véhicule invalide' });
      const [rows] = await db.query(
        `SELECT DATE_FORMAT(recorded_at, '%Y-%m-%d') AS jour, COUNT(*) AS points, MAX(vitesse_kmh) AS max_kmh
           FROM vehicule_positions_historique
          WHERE vehicule_id = ? AND recorded_at >= CURDATE() - INTERVAL ? DAY
          GROUP BY jour ORDER BY jour DESC`,
        [id, HISTORY_DAYS],
      );
      res.set('Cache-Control', 'no-store');
      res.json(rows.map((r) => ({ date: r.jour, points: Number(r.points), max_kmh: numOrNull(r.max_kmh) })));
    } catch (error) {
      next(error);
    }
  });

  // Une position envoyée par le téléphone du chauffeur (ou un boîtier).
  router.post('/:vehiculeId', async (req, res, next) => {
    try {
      // Les comptes clients n'ont pas de rôle : seuls les employés envoient des positions.
      if (!req.user?.role || req.user?.type_compte != null) return res.status(403).json({ message: 'Accès réservé aux employés' });
      const id = idOf(req.params.vehiculeId);
      const position = parsePosition(req.body);
      if (!id || !position) return res.status(400).json({ message: 'Position invalide' });
      const [[vehicule]] = await db.query('SELECT id, gps_key FROM vehicules WHERE id = ? LIMIT 1', [id]);
      if (!vehicule) return res.status(404).json({ message: 'Véhicule introuvable' });
      if (vehicule.gps_key) {
        // Le boîtier est plus précis et ne dépend pas du téléphone : sa position récente est gardée.
        const [[box]] = await db.query(
          `SELECT 1 AS ok FROM vehicule_positions WHERE vehicule_id = ? AND source = 'boitier' AND recorded_at >= NOW() - INTERVAL ${BOX_FRESH_MINUTES} MINUTE`,
          [id],
        );
        if (box) return res.status(202).json({ ok: true, ignored: 'boitier' });
      }
      const employe = Number(req.user.id) || null;
      await db.query(
        `INSERT INTO vehicule_positions (vehicule_id, latitude, longitude, vitesse_kmh, cap, precision_m, source, employe_id, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE latitude = VALUES(latitude), longitude = VALUES(longitude), vitesse_kmh = VALUES(vitesse_kmh), cap = VALUES(cap),
           precision_m = VALUES(precision_m), source = VALUES(source), employe_id = VALUES(employe_id), recorded_at = VALUES(recorded_at)`,
        [id, position.latitude, position.longitude, position.vitesse_kmh, position.cap, position.precision_m, position.source, employe],
      );
      await db.query('INSERT INTO vehicule_positions_historique (vehicule_id, latitude, longitude, vitesse_kmh, employe_id, recorded_at) VALUES (?, ?, ?, ?, ?, NOW())', [
        id,
        position.latitude,
        position.longitude,
        position.vitesse_kmh,
        employe,
      ]);
      // L'historique ne grossit pas sans fin : les points de plus de 30 jours partent au fil de l'eau.
      await db.query(`DELETE FROM vehicule_positions_historique WHERE recorded_at < NOW() - INTERVAL ${HISTORY_DAYS} DAY LIMIT 200`);
      res.status(201).json({ ok: true });
      // After answering: customers the vehicle is now close to get their "the driver arrives" alert.
      checkArrivals(id, position, { db }).catch(() => {});
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export default createVehiculePositionsRouter();
