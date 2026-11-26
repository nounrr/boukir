/**
 * Where an online order's delivery is, for its customer.
 *
 * An order put in a delivery run travels in that run's vehicle; while the run is in progress, the customer sees
 * the vehicle's last position (GPS box or driver's phone). Nothing is shown before the order leaves or after it is
 * delivered, and a position older than 15 minutes is not shown as live.
 * Privacy: a vehicle often carries several customers' orders, so the map shows it only within 3 km of this
 * customer's delivery point (never when the order has no delivery point); before, only the arrival time is given.
 */
import { haversineDistanceKm } from './geo.js';

const LIVE_MINUTES = 15;
/** Streets are not straight lines: the road is about 1.3 times the distance as the crow flies. */
const ROAD_FACTOR = 1.3;
/** Average speed of a delivery truck in town, stops included. */
const CITY_KMH = 25;
/** The vehicle appears on the customer's map within this road distance of the delivery point. */
export const SHOW_WITHIN_KM = 3;

const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);
/** "20 to 30 min" rather than a precise minute the estimate cannot promise. */
export function etaRange(minutes) {
  if (minutes <= 10) return [Math.max(1, minutes - 2), minutes + 3];
  return [round5(minutes * 0.8), round5(minutes * 1.25)];
}

/**
 * Distance to the delivery point and a rough arrival time; null without the order's coordinates.
 * Under 150 m the vehicle is "nearby" (it is at the door, or parking).
 */
export function arrivalEstimate(position, destination) {
  const km = position && destination ? haversineDistanceKm({ lat: position.latitude, lng: position.longitude }, destination) : null;
  if (km == null) return null;
  const road = km * ROAD_FACTOR;
  const minutes = Math.max(1, Math.round((road / CITY_KMH) * 60));
  const eta = minutes > 15 ? Math.round(minutes / 5) * 5 : minutes;
  return {
    distance_km: Math.round(road * 10) / 10,
    eta_minutes: eta,
    eta_range: etaRange(eta),
    nearby: km < 0.15,
  };
}

export function firstName(full) {
  const name = String(full ?? '').trim().split(/\s+/)[0];
  return name || null;
}

export async function orderTracking(db, orderId, destination = null) {
  const [[queue]] = await db.query(
    "SELECT id, status, run_id FROM delivery_queue WHERE bon_type = 'Ecommerce' AND bon_id = ? LIMIT 1",
    [orderId],
  );
  if (!queue) return { state: 'none' };
  if (queue.status === 'delivered') return { state: 'delivered' };
  if (queue.status !== 'in_progress' || !queue.run_id) return { state: 'waiting' };
  const [[run]] = await db.query(
    "SELECT id, vehicule_id, vehicule_nom, chauffeur_nom, started_at FROM delivery_runs WHERE id = ? AND status = 'in_progress' LIMIT 1",
    [queue.run_id],
  );
  if (!run) return { state: 'waiting' };
  const [[p]] = await db.query(
    `SELECT latitude, longitude, vitesse_kmh, cap, recorded_at,
            recorded_at >= NOW() - INTERVAL ${LIVE_MINUTES} MINUTE AS fresh
       FROM vehicule_positions WHERE vehicule_id = ? LIMIT 1`,
    [run.vehicule_id],
  );
  const position =
    p && Number(p.fresh) === 1
      ? {
          latitude: Number(p.latitude),
          longitude: Number(p.longitude),
          vitesse_kmh: p.vitesse_kmh == null ? null : Number(p.vitesse_kmh),
          cap: p.cap == null ? null : Number(p.cap),
          recorded_at: p.recorded_at,
        }
      : null;
  const arrival = arrivalEstimate(position, destination);
  const close = !!arrival && arrival.distance_km <= SHOW_WITHIN_KM;
  return {
    state: 'on_the_way',
    started_at: run.started_at,
    vehicule: run.vehicule_nom ?? null,
    chauffeur: firstName(run.chauffeur_nom),
    position: close ? position : null,
    // The map is held back while the vehicle is far (it may be delivering other customers first).
    far: !!position && !close,
    arrival,
  };
}
