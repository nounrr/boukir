/**
 * AlloGPS: the GPS boxes fitted in the company's vehicles.
 *
 *   ALLOGPS_BASE_URL    https://s5.allogps.com:5556
 *   ALLOGPS_ACCOUNT_ID  the account id given by AlloGPS (used by /list/{id})
 *   ALLOGPS_EMAIL / ALLOGPS_PASSWORD   the API login
 *
 * POST /auth/login gives a JWT; GET /list/{id} lists the agencies and their vehicles; GET /gps/{key} gives a
 * vehicle's position. The answers' exact field names are not documented, so the readers below accept the usual
 * spellings (lat/latitude, lng/lon/longitude, speed/vitesse…) and ignore what they do not recognise.
 */
import axios from 'axios';

export function allogpsConfigured(env = process.env) {
  return !!(env.ALLOGPS_BASE_URL && env.ALLOGPS_ACCOUNT_ID && env.ALLOGPS_EMAIL && env.ALLOGPS_PASSWORD);
}

const lower = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v]));
const first = (o, names) => {
  for (const n of names) if (o[n] !== undefined && o[n] !== null && o[n] !== '') return o[n];
  return undefined;
};
const num = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** The JWT in a login answer, wherever the service puts it. */
export function tokenFrom(body) {
  if (!body || typeof body !== 'object') return null;
  const o = lower(body);
  const direct = first(o, ['token', 'accesstoken', 'access_token', 'jwt', 'id_token']);
  if (typeof direct === 'string') return direct;
  for (const v of Object.values(o)) if (v && typeof v === 'object') { const t = tokenFrom(v); if (t) return t; }
  return null;
}

/** When a JWT expires (ms since epoch), or null when it does not say. */
export function tokenExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    return Number.isFinite(payload.exp) ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Plates and names compared loosely: "12345-A-6", "12345 | A | 6" and "12345A6" are the same plate. */
export function plateKey(value) {
  return String(value ?? '').toUpperCase().replace(/[^0-9A-Z؀-ۿ]/g, '');
}

const KEY_FIELDS = ['key', 'gps_key', 'gpskey', 'id_key', 'imei', 'deviceid', 'device_id', 'device', 'uid', 'id', '_id'];
const NAME_FIELDS = ['name', 'nom', 'label', 'vehicle', 'vehicule', 'vehiclename', 'vehicle_name', 'alias', 'title'];
const PLATE_FIELDS = ['plate', 'immatriculation', 'matricule', 'registration', 'plaque', 'plate_number', 'platenumber', 'licenseplate'];

/**
 * The vehicles in a /list answer: [{ key, name, plate, agency }]. Agencies hold their vehicles in an array; a
 * vehicle is an object with a key (the id to pass to /gps/{key}) and a name or a plate.
 */
export function vehiclesFrom(body) {
  const found = new Map();
  const walk = (node, agency) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item, agency);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const o = lower(node);
    const hasChildren = Object.values(o).some((v) => Array.isArray(v) && v.some((x) => x && typeof x === 'object'));
    const key = first(o, KEY_FIELDS);
    const name = first(o, NAME_FIELDS);
    const plate = first(o, PLATE_FIELDS);
    if (!hasChildren && key !== undefined && (name !== undefined || plate !== undefined) && typeof key !== 'object') {
      const k = String(key);
      if (!found.has(k)) found.set(k, { key: k, name: name != null ? String(name) : null, plate: plate != null ? String(plate) : null, agency: agency ?? null });
      return;
    }
    const label = first(o, ['agency', 'agence', 'name', 'nom', 'label']);
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, typeof label === 'string' ? label : agency);
  };
  walk(body, null);
  return [...found.values()];
}

/** A date from the service (ISO text, "YYYY-MM-DD HH:mm:ss", or seconds / milliseconds since epoch). */
export function dateFrom(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (Number.isFinite(n) && String(value).trim() !== '') {
    const ms = n > 1e12 ? n : n > 1e9 ? n * 1000 : null;
    return ms ? new Date(ms) : null;
  }
  const d = new Date(String(value).includes('T') ? String(value) : String(value).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The position in a /gps answer: { latitude, longitude, vitesse_kmh, cap, recorded_at, contact } or null.
 * When the answer holds several points, the most recent one is kept.
 */
export function positionFrom(body) {
  const candidates = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    const o = lower(node);
    const lat = num(first(o, ['lat', 'latitude', 'y']));
    const lng = num(first(o, ['lng', 'lon', 'long', 'longitude', 'x']));
    if (lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)) {
      const speed = num(first(o, ['speed', 'vitesse', 'speed_kmh', 'kmh']));
      const heading = num(first(o, ['heading', 'course', 'angle', 'direction', 'cap', 'bearing']));
      const ignition = first(o, ['ignition', 'acc', 'contact', 'engine', 'moteur']);
      candidates.push({
        latitude: Math.round(lat * 1e7) / 1e7,
        longitude: Math.round(lng * 1e7) / 1e7,
        vitesse_kmh: speed !== null && speed >= 0 && speed <= 250 ? speed : null,
        cap: heading !== null && heading >= 0 && heading <= 360 ? heading : null,
        recorded_at: dateFrom(first(o, ['gps_time', 'gpstime', 'datetime', 'date_time', 'timestamp', 'time', 'date', 'fixtime', 'updated_at', 'last_update', 'lastupdate'])),
        contact: ignition === undefined ? null : ['1', 'true', 'on', 'yes'].includes(String(ignition).toLowerCase()),
      });
      return;
    }
    Object.values(o).forEach((v) => v && typeof v === 'object' && walk(v));
  };
  walk(body);
  if (!candidates.length) return null;
  return candidates.sort((a, b) => (b.recorded_at?.getTime() ?? 0) - (a.recorded_at?.getTime() ?? 0))[0];
}

/** A small client that logs in when needed and logs in again when the token is refused. */
export function createAllogpsClient(env = process.env, http = axios) {
  let token = null;
  let expiresAt = 0;
  const base = String(env.ALLOGPS_BASE_URL || '').replace(/\/+$/, '');

  async function login() {
    const res = await http.post(`${base}/auth/login`, { email: env.ALLOGPS_EMAIL, password: env.ALLOGPS_PASSWORD }, { timeout: 15000 });
    token = tokenFrom(res.data);
    if (!token) throw new Error('AlloGPS : connexion sans jeton dans la réponse');
    // A minute of margin before the token's own expiry; 50 minutes when the token does not say.
    expiresAt = (tokenExpiry(token) ?? Date.now() + 51 * 60000) - 60000;
    return token;
  }

  async function get(path) {
    if (!token || Date.now() >= expiresAt) await login();
    try {
      return (await http.get(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 })).data;
    } catch (error) {
      if (error?.response?.status !== 401 && error?.response?.status !== 403) throw error;
      await login();
      return (await http.get(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 })).data;
    }
  }

  return {
    listRaw: () => get(`/list/${encodeURIComponent(env.ALLOGPS_ACCOUNT_ID)}`),
    gpsRaw: (key) => get(`/gps/${encodeURIComponent(key)}`),
    async vehicles() {
      return vehiclesFrom(await this.listRaw());
    },
    async position(key) {
      return positionFrom(await this.gpsRaw(key));
    },
  };
}
