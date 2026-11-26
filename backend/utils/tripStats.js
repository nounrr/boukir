/**
 * A vehicle's day, from its GPS points: distance, top and average speed, time on the road, and the stops.
 *
 * Points come in time order: { latitude, longitude, vitesse_kmh, recorded_at }. A gap of more than 15 minutes
 * between two points (box off, no signal) counts neither as distance nor as driving; a jump faster than 200 km/h is a bad fix
 * and is left out of the distance. A stop is a stay of 5 minutes or more within 100 m.
 */
const R_KM = 6371;
const GAP_MS = 15 * 60000;
const STOP_MS = 5 * 60000;
const STOP_RADIUS_KM = 0.1;
const MOVING_KMH = 5;
const MAX_KMH = 200;

const rad = (d) => (d * Math.PI) / 180;
export function distanceKm(a, b) {
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

const timeOf = (p) => new Date(p.recorded_at).getTime();

export function tripStats(points) {
  const pts = (points ?? []).filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Number.isFinite(timeOf(p)));
  const empty = { points: pts.length, distance_km: 0, max_kmh: null, avg_kmh: null, driving_minutes: 0, stopped_minutes: 0, first_at: pts[0]?.recorded_at ?? null, last_at: pts.at(-1)?.recorded_at ?? null, stops: [] };
  if (pts.length < 2) return empty;

  let distance = 0;
  let drivingMs = 0;
  let max = null;
  let computedMax = 0;
  for (const p of pts) if (p.vitesse_kmh != null && Number.isFinite(p.vitesse_kmh)) max = Math.max(max ?? 0, p.vitesse_kmh);
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    const ms = timeOf(b) - timeOf(a);
    if (ms <= 0) continue;
    const km = distanceKm(a, b);
    const kmh = km / (ms / 3600000);
    if (kmh > MAX_KMH) continue;
    if (ms <= GAP_MS) {
      distance += km;
      const moving = kmh >= MOVING_KMH || (b.vitesse_kmh ?? 0) >= MOVING_KMH;
      if (moving) drivingMs += ms;
    }
    // After a gap (box off, no signal) the road taken is unknown: neither distance nor driving time is counted.
    if (ms <= GAP_MS) computedMax = Math.max(computedMax, kmh);
  }
  // The speed the box reports; from the points themselves when it reports none.
  if (max == null && computedMax > 0) max = computedMax;

  // Stops: from a point, as long as the next ones stay within 100 m.
  const stops = [];
  let i = 0;
  while (i < pts.length) {
    let j = i;
    while (j + 1 < pts.length && distanceKm(pts[i], pts[j + 1]) <= STOP_RADIUS_KM) j += 1;
    const ms = timeOf(pts[j]) - timeOf(pts[i]);
    if (j > i && ms >= STOP_MS) {
      stops.push({ latitude: pts[i].latitude, longitude: pts[i].longitude, from: pts[i].recorded_at, to: pts[j].recorded_at, minutes: Math.round(ms / 60000) });
      i = j + 1;
    } else {
      i += 1;
    }
  }

  const spanMs = timeOf(pts.at(-1)) - timeOf(pts[0]);
  const drivingMinutes = Math.round(drivingMs / 60000);
  return {
    points: pts.length,
    distance_km: Math.round(distance * 10) / 10,
    max_kmh: max == null ? null : Math.round(max),
    avg_kmh: drivingMs > 0 ? Math.round((distance / (drivingMs / 3600000)) * 10) / 10 : null,
    driving_minutes: drivingMinutes,
    stopped_minutes: stops.reduce((s, x) => s + x.minutes, 0),
    span_minutes: Math.round(spanMs / 60000),
    first_at: pts[0].recorded_at,
    last_at: pts.at(-1).recorded_at,
    stops,
  };
}
