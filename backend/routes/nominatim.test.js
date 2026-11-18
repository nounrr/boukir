import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { buildReverseUrl, buildSearchUrl, createNominatimRouter } from './nominatim.js';

function serve(fetchImpl) {
  const app = express();
  app.use('/api/nominatim', createNominatimRouter({ fetchImpl, env: {} }));
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, base: `http://127.0.0.1:${server.address().port}/api/nominatim` }));
  });
}

test('search: Morocco by default, near the map centre, at most 10 results', () => {
  const url = new URL(buildSearchUrl({ q: ' Rue Moussa Ibn Noussair ', lat: '35.75', lng: '-5.84', limit: '50' }, {}));
  assert.equal(url.origin + url.pathname, 'https://nominatim.openstreetmap.org/search');
  assert.equal(url.searchParams.get('q'), 'Rue Moussa Ibn Noussair');
  assert.equal(url.searchParams.get('countrycodes'), 'ma');
  assert.equal(url.searchParams.get('limit'), '10');
  assert.equal(url.searchParams.get('addressdetails'), '1');
  assert.equal(url.searchParams.get('viewbox'), '-6.34,35.25,-5.34,36.25');
  assert.equal(url.searchParams.get('bounded'), '0');
});

test('search: no centre box without a centre, nothing for a one-letter query', () => {
  const url = new URL(buildSearchUrl({ q: 'Tanger' }, {}));
  assert.equal(url.searchParams.get('viewbox'), null);
  assert.equal(url.searchParams.get('limit'), '5');
  assert.equal(buildSearchUrl({ q: 'T' }, {}), null);
});

test('reverse: a valid point only, with the contact e-mail when configured', () => {
  const url = new URL(buildReverseUrl({ lat: '35.7532036', lng: '-5.8421462' }, { NOMINATIM_EMAIL: 'ops@example.com' }));
  assert.equal(url.searchParams.get('lat'), '35.7532036');
  assert.equal(url.searchParams.get('lon'), '-5.8421462');
  assert.equal(url.searchParams.get('email'), 'ops@example.com');
  assert.equal(buildReverseUrl({ lat: '', lng: '-5.8' }, {}), null);
  assert.equal(buildReverseUrl({ lat: '95', lng: '-5.8' }, {}), null);
});

test('routes: forward with an identifying User-Agent, cache the answer, pass rate limits through', async () => {
  const calls = [];
  let status = 200;
  const { server, base } = await serve(async (url, init) => {
    calls.push({ url, ua: init.headers['User-Agent'] });
    return { ok: status === 200, status, json: async () => ({ display_name: 'Tanger' }) };
  });
  try {
    const first = await fetch(`${base}/reverse?lat=35.75&lng=-5.84`);
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { display_name: 'Tanger' });
    await fetch(`${base}/reverse?lat=35.75&lng=-5.84`);
    assert.equal(calls.length, 1, 'the second identical lookup comes from the cache');
    assert.match(calls[0].ua, /boukir/);

    assert.equal((await fetch(`${base}/search?q=x`)).status, 400);
    status = 429;
    assert.equal((await fetch(`${base}/search?q=Tanger%20Med`)).status, 429);
    status = 500;
    assert.equal((await fetch(`${base}/search?q=Tanger%20Ville`)).status, 502);
  } finally {
    server.close();
  }
});
