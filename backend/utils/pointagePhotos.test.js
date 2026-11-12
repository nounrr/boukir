import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { decodePointagePhoto, savePointagePhoto, MAX_POINTAGE_PHOTO_BYTES } from './pointagePhotos.js';
import { createPointageRouters } from '../routes/pointage.js';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE9sAAAAASUVORK5CYII=';

test('photos accept bounded JPEG/PNG bytes and reject active content, URLs and malformed input', () => {
  const photo = decodePointagePhoto(png);
  assert.equal(photo.mime, 'image/png');
  assert.deepEqual(decodePointagePhoto('data:image/png;base64,' + png).image, Buffer.from(png, 'base64'));
  for (const value of [null, {}, '', 'https://example.com/photo.jpg', '%%%bad%%%', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64'), 'A'.repeat(MAX_POINTAGE_PHOTO_BYTES * 2)]) {
    assert.equal(decodePointagePhoto(value), null);
  }
});

test('saving photos attaches them only to existing events and does not overwrite snapshots on replay', async () => {
  let saved;
  await savePointagePhoto({ query: async (sql, params) => { saved = { sql, params }; } }, 'event-key', decodePointagePhoto(png));
  assert.match(saved.sql, /SELECT id, \?, \? FROM pointage_events WHERE event_key = \?/);
  assert.match(saved.sql, /ON DUPLICATE KEY UPDATE event_id = VALUES\(event_id\)/);
  assert.equal(saved.params[0], 'image/png');
  assert.equal(saved.params[2], 'event-key');
  await savePointagePhoto({ query: () => assert.fail('No write for missing photo') }, 'event-key', null);
});

test('callback photos remain private, require pointage rights and exclude refused recognitions', async t => {
  let photo;
  const db = { query: async (sql, params) => {
    if (sql.startsWith('INSERT INTO pointage_event_photos')) photo ||= { mime: params[0], image: params[1] };
    if (sql.startsWith('SELECT mime, image')) return [Number(params[0]) === 42 && photo ? [photo] : []];
    return [[]];
  } };
  const config = { deviceKey: 'TEST', token: 'a'.repeat(43), timezone: 'Africa/Casablanca', attendanceMap: { 1: 'entree' } };
  const { callback, admin } = createPointageRouters(db, () => config);
  const app = express();
  app.use('/callback', callback);
  app.use((req, _res, next) => {
    if (req.headers['x-test-role']) req.user = { id: 1, role: req.headers['x-test-role'], _currentUserValidated: true };
    next();
  });
  app.use('/admin', admin);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  const body = { deviceKey: 'TEST', personId: '001', type: 'face_0', time: String(Date.UTC(2026, 6, 1)), attendance: 1, base64: png };
  const post = (payload, token = config.token) => fetch(`${url}/callback/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal((await post(body, 'wrong')).status, 401);
  assert.equal((await post({ ...body, type: 'face_2' })).status, 200);
  assert.equal(photo, undefined);
  assert.equal((await post(body)).status, 200);
  assert.equal((await post({ ...body, base64: '' })).status, 200);
  const requestPhoto = (role, id = 42) => fetch(`${url}/admin/events/${id}/photo`, { headers: role ? { 'x-test-role': role } : {} });
  assert.equal((await requestPhoto()).status, 401);
  assert.equal((await requestPhoto('Manager')).status, 403);
  assert.equal((await requestPhoto('PDG', 99)).status, 404);
  assert.equal((await requestPhoto('PDG', 'bad')).status, 400);
  const image = await requestPhoto('PDG');
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('Content-Type'), 'image/png');
  assert.match(image.headers.get('Cache-Control'), /no-store/);
  assert.equal(image.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), Buffer.from(png, 'base64'));
});
