function normalizeOrigin(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  try {
    return new URL(text).origin;
  } catch {
    return text.replace(/\/$/, '');
  }
}

export function getAllowedCorsOrigins() {
  const configured = [
    process.env.CORS_ORIGINS,
    process.env.FRONTEND_URL,
    process.env.PUBLIC_BASE_URL,
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(','));

  if (process.env.NODE_ENV !== 'production') {
    configured.push('http://localhost:5173', 'http://localhost:5174');
  }

  return new Set(configured.map(normalizeOrigin).filter(Boolean));
}

export function isCorsOriginAllowed(origin, allowedOrigins = getAllowedCorsOrigins()) {
  if (!origin) return true;

  const normalized = normalizeOrigin(origin);
  if (allowedOrigins.has(normalized)) return true;
  if (process.env.NODE_ENV === 'production') return false;

  try {
    const url = new URL(normalized);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)
    );
  } catch {
    return false;
  }
}
