import { test } from 'node:test';
import assert from 'node:assert/strict';
import cors from 'cors';
import { getAllowedCorsOrigins, isCorsOriginAllowed } from '../utils/corsOrigins.js';

test('production origins and actual CORS preflight middleware', () => {
  const saved = { ...process.env };
  try {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS = 'https://admin.example.com,*';
    delete process.env.FRONTEND_URL;
    delete process.env.PUBLIC_BASE_URL;
    const allowed = getAllowedCorsOrigins();
    for (const origin of ['https://boukirdiamond.com', 'https://www.boukirdiamond.com', 'https://admin.example.com']) {
      assert.equal(isCorsOriginAllowed(origin, allowed), true);
      const headers = {};
      let ended = false;
      cors({ origin: (value, cb) => cb(null, isCorsOriginAllowed(value, allowed)), credentials: true })(
        { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization,content-type,platform' } },
        { setHeader: (k, v) => { headers[k.toLowerCase()] = v; }, getHeader: k => headers[k.toLowerCase()], end: () => { ended = true; } },
        () => assert.fail('preflight should finish before auth'),
      );
      assert.equal(ended, true);
      assert.equal(headers['access-control-allow-origin'], origin);
      assert.equal(headers['access-control-allow-credentials'], 'true');
      assert.equal(headers['access-control-allow-headers'], 'authorization,content-type,platform');
      assert.match(headers.vary, /Origin/);
    }
    for (const origin of ['null', '*', 'https://evil.example', 'https://boukirdiamond.com.evil.example', 'https://boukirdiamond.com/path', 'http://localhost:3002']) {
      assert.equal(isCorsOriginAllowed(origin, allowed), false, origin);
    }
    assert.equal(isCorsOriginAllowed(undefined, allowed), true);
  } finally { process.env = saved; }
});
