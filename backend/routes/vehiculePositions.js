import express from 'express';
import pool from '../db/pool.js';
import { requireRoles } from '../middleware/auth.js';
import { ensureGpsColumn, gpsState } from '../utils/gpsSync.js';
import { checkArrivals } from '../utils/deliveryAlerts.js';

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
      const [ours] = await db.query('SELECT id, nom, immatriculation, gps_key FROM vehicules WHERE gps_key IS NOT NULL');
      res.set('Cache-Control', 'no-store');
      res.json({
        configured: gpsState.configured,
        last_sync_at: gpsState.lastSyncAt,
        last_error: gpsState.lastError,
        updated: gpsState.updated,
        vehicles: gpsState.vehicles.map((g) => {
          const linked = ours.find((o) => o.gps_key === g.key);
          return { ...g, vehicule: linked ? { id: linked.id, nom: linked.nom, immatriculation: linked.immatriculation } : null };
        }),
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
