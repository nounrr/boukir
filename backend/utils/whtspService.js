const stripQuotes = (v) => {
  if (v == null) return '';
  const s = String(v).trim();
  // handle accidental quotes in .env like "key"
  return s.replace(/^['"]|['"]$/g, '');
};

export const isWhtspServiceConfigured = () => {
  const baseUrl = stripQuotes(process.env.WHTSP_SERVICE_BASE_URL);
  const apiKey = stripQuotes(process.env.WHTSP_SERVICE_API_KEY);
  return Boolean(baseUrl && apiKey);
};

const getConfig = () => {
  const baseUrl = stripQuotes(process.env.WHTSP_SERVICE_BASE_URL);
  const apiKey = stripQuotes(process.env.WHTSP_SERVICE_API_KEY);
  if (!baseUrl) throw new Error('WHTSP_SERVICE_BASE_URL manquant');
  if (!apiKey) throw new Error('WHTSP_SERVICE_API_KEY manquant');
  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey };
};

const fetchJson = async (url, { method = 'GET', headers = {}, body, timeoutMs = 20000 } = {}) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      signal: ctrl.signal,
    });

    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }

    if (!res.ok) {
      const msg = json?.error || json?.message || `WHTSP service error (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.payload = json;
      throw err;
    }

    return json;
  } finally {
    clearTimeout(t);
  }
};

export const getWhtspStatus = async () => {
  const { baseUrl, apiKey } = getConfig();
  // /status does not require api key (but safe to send anyway)
  return fetchJson(`${baseUrl}/status`, {
    headers: { 'x-api-key': apiKey },
    timeoutMs: 8000,
  });
};

export const sendWhtspText = async ({ phone, text } = {}) => {
  if (!phone) throw new Error('phone requis');
  if (!text) throw new Error('text requis');
  const { baseUrl, apiKey } = getConfig();
  return fetchJson(`${baseUrl}/send-text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({ phone, text }),
  });
};

export const sendWhtspMedia = async ({ phone, caption, mediaUrl, filename, mimetype, base64 } = {}) => {
  if (!phone) throw new Error('phone requis');
  if (!mediaUrl && !base64) throw new Error('mediaUrl ou base64 requis');
  const { baseUrl, apiKey } = getConfig();
  return fetchJson(`${baseUrl}/send-media`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({ phone, caption, mediaUrl, filename, mimetype, base64 }),
  });
};
