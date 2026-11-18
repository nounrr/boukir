import { Router } from 'express';

/**
 * Address search and reverse geocoding (OpenStreetMap Nominatim), for the website's and the app's map pickers.
 *
 * Same paths, parameters and answers as the website's own Next.js routes (/api/nominatim/search and /reverse):
 * in production /api/* reaches this server, so the website's map search lands here too. Nominatim asks for an
 * identifying User-Agent, at most about one request per second, and caching: answers are kept for 10 minutes and
 * each address (IP) is limited.
 */

const UPSTREAM = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'boukir-api (Express)';
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;

const finite = (value) => {
  if (value == null || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Upstream URL of a search, or null when the query is too short. */
export function buildSearchUrl(params, env = process.env) {
  const q = String(params.q ?? '').trim();
  if (q.length < 2) return null;
  const url = new URL(`${UPSTREAM}/search`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('q', q.slice(0, 200));
  url.searchParams.set('addressdetails', '1');
  const limit = Math.min(10, Math.max(1, Number(params.limit) || 5));
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('countrycodes', String(params.countrycodes || 'ma').trim() || 'ma');
  // Results near the map's centre first (half a degree around it), without excluding the rest.
  const lat = finite(params.lat);
  const lng = finite(params.lng);
  if (lat != null && lng != null) {
    url.searchParams.set('viewbox', `${lng - 0.5},${lat - 0.5},${lng + 0.5},${lat + 0.5}`);
    url.searchParams.set('bounded', '0');
  }
  if (env.NOMINATIM_EMAIL) url.searchParams.set('email', env.NOMINATIM_EMAIL);
  return url.toString();
}

/** Upstream URL of a reverse lookup, or null when the point is not valid. */
export function buildReverseUrl(params, env = process.env) {
  const lat = finite(params.lat);
  const lng = finite(params.lng);
  if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const url = new URL(`${UPSTREAM}/reverse`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('addressdetails', '1');
  if (env.NOMINATIM_EMAIL) url.searchParams.set('email', env.NOMINATIM_EMAIL);
  return url.toString();
}

function createLimiter({ windowMs, max }) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = String(req.ip || req.socket?.remoteAddress || 'unknown');
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    bucket.count += 1;
    buckets.set(key, bucket);
    if (buckets.size > 10000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({ error: 'RATE_LIMITED' });
    }
    return next();
  };
}

export function createNominatimRouter({ fetchImpl = (...args) => fetch(...args), env = process.env } = {}) {
  const router = Router();
  const cache = new Map();
  const limiter = createLimiter({ windowMs: 60 * 1000, max: 30 });

  const forward = async (url, res) => {
    if (!url) return res.status(400).json({ error: 'INVALID_PARAMS' });
    const hit = cache.get(url);
    if (hit && hit.expiresAt > Date.now()) return res.json(hit.data);
    try {
      const upstream = await fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
      if (upstream.status === 429) return res.status(429).json({ error: 'RATE_LIMITED' });
      if (!upstream.ok) return res.status(502).json({ error: 'UPSTREAM_ERROR', status: upstream.status });
      const data = await upstream.json();
      cache.set(url, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
      return res.json(data);
    } catch (error) {
      console.error('Nominatim proxy error:', error?.message || error);
      return res.status(502).json({ error: 'FETCH_FAILED' });
    }
  };

  router.get('/search', limiter, (req, res) => forward(buildSearchUrl(req.query, env), res));
  router.get('/reverse', limiter, (req, res) => forward(buildReverseUrl(req.query, env), res));
  return router;
}

export default createNominatimRouter();
