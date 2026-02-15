function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeLatLng(input) {
  if (!input) return null;

  // Allow { lat, lng } or { latitude, longitude } or { lat, lon }
  const candidate = typeof input === 'object' ? input : null;
  if (!candidate) return null;

  const lat = toNumber(candidate.lat ?? candidate.latitude);
  const lng = toNumber(candidate.lng ?? candidate.lon ?? candidate.longitude);

  if (lat == null || lng == null) return null;
  if (lat < -90 || lat > 90) return null;
  if (lng < -180 || lng > 180) return null;

  return { lat, lng };
}

export function haversineDistanceKm(a, b) {
  const p1 = normalizeLatLng(a);
  const p2 = normalizeLatLng(b);
  if (!p1 || !p2) return null;

  const R = 6371; // Earth radius in km
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(p2.lat - p1.lat);
  const dLng = toRad(p2.lng - p1.lng);
  const lat1 = toRad(p1.lat);
  const lat2 = toRad(p2.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.asin(Math.min(1, Math.sqrt(h)));

  return R * c;
}

export function getDefaultStoreLocation() {
  // From provided Google Maps URL: .../@35.7532036,-5.8421462,...
  return { lat: 35.7532036, lng: -5.8421462 };
}

export function getStoreLocationFromEnv(env = process.env) {
  const lat = toNumber(env.STORE_LAT);
  const lng = toNumber(env.STORE_LNG);
  if (lat == null || lng == null) return null;
  if (lat < -90 || lat > 90) return null;
  if (lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function getStoreLocation(env = process.env) {
  return getStoreLocationFromEnv(env) || getDefaultStoreLocation();
}
