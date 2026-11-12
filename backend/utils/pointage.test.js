import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { normalizeWdlinkPassage, matchesPointageToken, savePointageEvent } from './pointage.js';
import { createPointageRouters, readWdlinkConfig } from '../routes/pointage.js';

const config = { deviceKey: 'TEST505', token: 'a'.repeat(43), timezone: 'Africa/Casablanca', attendanceMap: { 1: 'entree', 2: 'sortie' } };
const passage = { deviceKey: 'TEST505', personId: 'employee-001', time: String(Date.UTC(2026, 6, 10, 23, 15, 30)), type: 'face_0', attendance: '1', identifyType: '1', aliveType: '1' };

test('SDK face/fingerprint callbacks keep exact local day/time and explicit attendance direction', () => {
  const event = normalizeWdlinkPassage(passage, config);
  assert.equal(event.localDate, '2026-07-11');
  assert.equal(event.localTime, '00:15:30');
  assert.equal(event.occurredAtUtc, '2026-07-10 23:15:30.000');
  assert.equal(event.direction, 'entree');
  const exit = normalizeWdlinkPassage({ ...passage, type: 'finger_0', attendance: '2' }, config);
  assert.equal(exit.method, 'finger');
  assert.equal(exit.direction, 'sortie');
  assert.equal(normalizeWdlinkPassage({ ...passage, attendance: '99' }, config).direction, 'inconnu');
  assert.equal(normalizeWdlinkPassage({ ...passage, attendance: 'constructor' }, config).direction, 'inconnu');
  assert.equal(normalizeWdlinkPassage(passage, { ...config, attendanceMap: {}, direction: 'sortie' }).direction, 'sortie');
});

test('failed recognition, strangers and liveness failures never become attendance', () => {
  for (const patch of [{ type: 'face_2' }, { type: 'finger_2' }, { identifyType: '2' }, { aliveType: '2' }, { personId: 'STRANGERBABY' }]) {
    assert.equal(normalizeWdlinkPassage({ ...passage, ...patch }, config), null);
  }
  assert.throws(() => normalizeWdlinkPassage({ ...passage, deviceKey: 'unknown' }, config));
  assert.throws(() => normalizeWdlinkPassage({ ...passage, time: '123' }, config));
  assert.throws(() => normalizeWdlinkPassage({ ...passage, time: '9999999999999' }, config));
  assert.throws(() => normalizeWdlinkPassage({ ...passage, type: 'openDoor_0' }, config));
});

test('replayed callbacks have stable keys and contain no biometric data', async () => {
  const event = normalizeWdlinkPassage({ ...passage, base64: 'secret-photo', feature: 'secret-fingerprint', path: '/private.jpg' }, config);
  assert.equal(event.eventKey, normalizeWdlinkPassage(passage, config).eventKey);
  assert.notEqual(event.eventKey, normalizeWdlinkPassage({ ...passage, time: String(Number(passage.time) + 1) }, config).eventKey);
  let written;
  await savePointageEvent({ query: async (sql, params) => { written = { sql, params }; } }, event);
  assert.match(written.sql, /ON DUPLICATE KEY UPDATE/);
  assert.doesNotMatch(JSON.stringify({ event, written }), /secret-photo|secret-fingerprint|private.jpg/);
});

test('configuration and callback token fail closed', () => {
  assert.equal(readWdlinkConfig({}), null);
  assert.equal(matchesPointageToken('a'.repeat(43), ''), false);
  assert.equal(matchesPointageToken('é'.repeat(43), config.token), false);
  assert.equal(matchesPointageToken(config.token, config.token), true);
  const env = { WDLINK_DEVICE_KEY: config.deviceKey, WDLINK_CALLBACK_TOKEN: config.token };
  assert.ok(readWdlinkConfig(env));
  for (const patch of [{ WDLINK_TIMEZONE: 'invalid' }, { WDLINK_ATTENDANCE_MAP: '{' }, { WDLINK_ATTENDANCE_MAP: '[]' }, { WDLINK_ATTENDANCE_MAP: '{"1":"fake"}' }]) assert.equal(readWdlinkConfig({ ...env, ...patch }), null);
});

test('HTTP receiver authenticates, acknowledges only durable saves, and retries database failures', async t => {
  const saved = new Set();
  let fail = false;
  const db = { query: async (sql, params) => {
    if (sql.startsWith('INSERT INTO pointage_events')) {
      if (fail) throw new Error('offline');
      saved.add(params[0]);
    }
    return [{}];
  } };
  const { callback, admin } = createPointageRouters(db, () => config);
  const app = express();
  app.use('/callback', callback);
  app.use('/admin', admin);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (body = passage, token = config.token) => fetch(`${url}/callback/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post(passage, 'wrong')).status, 401);
  assert.equal(saved.size, 0);
  assert.deepEqual(await (await post()).json(), { result: 1, success: true });
  assert.deepEqual(await (await post()).json(), { result: 1, success: true });
  assert.equal(saved.size, 1);
  assert.deepEqual(await (await post({ ...passage, type: 'face_2' })).json(), { result: 1, success: true });
  assert.equal(saved.size, 1);
  assert.equal((await post({ ...passage, time: 'broken' })).status, 400);
  fail = true;
  const failed = await post({ ...passage, type: 'finger_0' });
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { result: 0, success: false });
  assert.equal((await fetch(`${url}/admin/events?month=2026-07`)).status, 401);
  const malformed = await fetch(`${url}/callback/${config.token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
});

test('PDG settings persist editable connection fields, hide secrets and rotate callback authentication', async t => {
  let row;
  let snapshot;
  const query = async (sql, params = []) => {
    if (sql.includes('INSERT INTO pointage_device_config') && !row) {
      row = { device_key: params[0], callback_token_hash: params[1], timezone: params[2], direction: params[3], attendance_map: params[4] };
    }
    if (sql.includes('UPDATE pointage_device_config SET')) {
      row = { device_key: params[0], callback_token_hash: params[1], timezone: params[2], direction: params[3], attendance_map: params[4], local_ip: params[5], firmware: params[6] };
    }
    if (sql.includes('SELECT * FROM pointage_device_config')) return [row ? [{ ...row }] : []];
    return [[]];
  };
  const conn = { query, beginTransaction: async () => { snapshot = row && { ...row }; }, commit: async () => {}, rollback: async () => { row = snapshot; }, release() {} };
  const db = { query, getConnection: async () => conn };
  const { callback, admin } = createPointageRouters(db);
  const app = express();
  app.use('/callback', callback);
  app.use(express.json());
  // Fixture for the identity already verified by the application's global middleware.
  app.use((req, _res, next) => { req.user = { id: 1, role: req.headers['x-test-role'] || 'PDG', acces_gestion_absences: 1, _currentUserValidated: true }; next(); });
  app.use('/admin', admin);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  const settings = { device_key: config.deviceKey, local_ip: '192.168.1.99', firmware: 'WDU505PROFP-test', timezone: 'Africa/Casablanca', direction: 'inconnu', attendance_map: { 1: 'entree', 2: 'sortie' } };
  const save = (body = settings, role = 'PDG') => fetch(`${url}/admin/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-test-role': role }, body: JSON.stringify(body) });
  assert.equal((await save(settings, 'Manager')).status, 403);
  assert.equal((await fetch(`${url}/admin/config`, { headers: { 'x-test-role': 'Manager' } })).status, 403);
  assert.equal((await save({ ...settings, direction: 'guess' })).status, 400);
  const first = await (await save()).json();
  assert.match(first.callback_url, /^https:\/\/backoffice\.boukirdiamond\.com\/api\/pointage\/wdlink\/callback\/[A-Za-z0-9_-]{43}$/);
  const token = first.callback_url.split('/').at(-1);
  assert.notEqual(row.callback_token_hash, token);
  const stored = await (await fetch(`${url}/admin/config`)).json();
  assert.equal(stored.local_ip, settings.local_ip);
  assert.equal(stored.firmware, settings.firmware);
  assert.equal(stored.configured, true);
  assert.doesNotMatch(JSON.stringify(stored), /token|callback_token_hash/);
  assert.equal((await (await save({ ...settings, firmware: 'new-version' })).json()).callback_url, null);
  const post = token => fetch(`${url}/callback/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(passage) });
  assert.equal((await post(token)).status, 200);
  const rotated = await (await save({ ...settings, rotate_token: true })).json();
  assert.notEqual(rotated.callback_url, first.callback_url);
  assert.equal((await post(token)).status, 401);
  assert.equal((await post(rotated.callback_url.split('/').at(-1))).status, 200);
});
