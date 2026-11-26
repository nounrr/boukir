import assert from 'node:assert/strict';
import test from 'node:test';
import { createAllogpsClient, detailsFrom, plateKey, positionFrom, tokenFrom, vehiclesFrom } from './allogps.js';
import { autoLinks } from './gpsSync.js';

test('AlloGPS: the token is found wherever the login answer puts it', () => {
  assert.equal(tokenFrom({ token: 'a.b.c' }), 'a.b.c');
  assert.equal(tokenFrom({ data: { accessToken: 'x.y.z' } }), 'x.y.z');
  assert.equal(tokenFrom({ message: 'ok' }), null);
});

test('AlloGPS: vehicles are read from agencies, with their key, name and plate', () => {
  const list = { agencies: [
    { name: 'Tanger', vehicles: [{ key: '02c750be', name: 'Camion 1', plate: '12345-A-6' }, { id: 'ff01', matricule: '777 | B | 1' }] },
    { agence: 'Tetouan', cars: [{ imei: '3569', label: 'Fourgon' }] },
  ] };
  assert.deepEqual(vehiclesFrom(list), [
    { key: '02c750be', name: 'Camion 1', plate: '12345-A-6', agency: 'Tanger' },
    { key: 'ff01', name: null, plate: '777 | B | 1', agency: 'Tanger' },
    { key: '3569', name: 'Fourgon', plate: null, agency: 'Tetouan' },
  ]);
});

test('AlloGPS: a position is read whatever the field names, the latest point wins, (0,0) is ignored', () => {
  const { extra, ...core } = positionFrom({ data: { lat: '35.7595', lng: '-5.8340', speed: 42, angle: 90, gps_time: '2026-11-26 10:00:00', ignition: 1, odometer: 123456, address: 'Route de Tétouan', battery: '12.6' } });
  assert.deepEqual(core, { latitude: 35.7595, longitude: -5.834, vitesse_kmh: 42, cap: 90, recorded_at: new Date('2026-11-26T10:00:00'), contact: true });
  assert.equal(extra.kilometrage_km, 123456);
  assert.equal(extra.adresse, 'Route de Tétouan');
  assert.equal(extra.batterie_v, 12.6);
  assert.equal(extra.carburant, null);
  const latest = positionFrom([{ latitude: 35.1, longitude: -5.1, timestamp: 1795000000 }, { latitude: 35.2, longitude: -5.2, timestamp: 1795000600 }]);
  assert.equal(latest.latitude, 35.2);
  assert.equal(positionFrom({ lat: 0, lng: 0 }), null);
  assert.equal(positionFrom({ message: 'no data' }), null);
});

test('AlloGPS: our vehicles are linked by plate, each box to one vehicle only', () => {
  assert.equal(plateKey('12345-A-6'), plateKey('12345 | a | 6'));
  const ours = [{ id: 1, immatriculation: '12345-A-6', gps_key: null }, { id: 2, immatriculation: '99999-B-1', gps_key: null }, { id: 3, immatriculation: '777-B-1', gps_key: 'ff01' }];
  const gps = [{ key: '02c7', name: 'Camion', plate: '12345 A 6' }, { key: 'ff01', name: '777 B 1', plate: null }];
  assert.deepEqual(autoLinks(ours, gps), [{ vehicule_id: 1, gps_key: '02c7' }]);
});

test('AlloGPS: the client logs in, sends the token, and logs in again when it is refused', async () => {
  const calls = [];
  let logins = 0;
  const http = {
    post: async (url) => { calls.push(`POST ${url}`); logins += 1; return { data: { token: `t${logins}` } }; },
    get: async (url, { headers }) => {
      calls.push(`GET ${url} ${headers.Authorization}`);
      if (headers.Authorization === 'Bearer t1') throw Object.assign(new Error('expired'), { response: { status: 401 } });
      return { data: { lat: 35.7, lng: -5.8 } };
    },
  };
  const client = createAllogpsClient({ ALLOGPS_BASE_URL: 'https://gps.test:5556/', ALLOGPS_ACCOUNT_ID: 'BDC_1', ALLOGPS_EMAIL: 'a', ALLOGPS_PASSWORD: 'b' }, http);
  const p = await client.position('abc');
  assert.equal(p.latitude, 35.7);
  assert.deepEqual(calls, ['POST https://gps.test:5556/auth/login', 'GET https://gps.test:5556/gps/abc Bearer t1', 'POST https://gps.test:5556/auth/login', 'GET https://gps.test:5556/gps/abc Bearer t2']);
});

test('order tracking: the vehicle is shown only while the order is on its way, and only a recent position', async () => {
  const { orderTracking, firstName } = await import('./orderTracking.js');
  const fake = (queue, run, pos) => ({ query: async (sql) => (/delivery_queue/.test(sql) ? [[queue].filter(Boolean)] : /delivery_runs/.test(sql) ? [[run].filter(Boolean)] : [[pos].filter(Boolean)]) });
  assert.deepEqual(await orderTracking(fake(null), 1), { state: 'none' });
  assert.deepEqual(await orderTracking(fake({ status: 'waiting' }), 1), { state: 'waiting' });
  assert.deepEqual(await orderTracking(fake({ status: 'delivered' }), 1), { state: 'delivered' });
  const run = { id: 7, vehicule_id: 3, vehicule_nom: 'Camion 1', chauffeur_nom: 'Karim El Amrani', started_at: 'x' };
  // No delivery point: the vehicle is never put on the map (it may be delivering others first).
  const hidden = await orderTracking(fake({ status: 'in_progress', run_id: 7 }, run, { latitude: '35.7', longitude: '-5.8', vitesse_kmh: '30', cap: null, recorded_at: 'y', fresh: 1 }), 1);
  assert.equal(hidden.position, null);
  assert.equal(hidden.far, true);
  const live = await orderTracking(fake({ status: 'in_progress', run_id: 7 }, run, { latitude: '35.7', longitude: '-5.8', vitesse_kmh: '30', cap: null, recorded_at: 'y', fresh: 1 }), 1, { lat: 35.71, lng: -5.8 });
  assert.equal(live.state, 'on_the_way');
  assert.equal(live.chauffeur, 'Karim');
  assert.equal(live.position.latitude, 35.7);
  const stale = await orderTracking(fake({ status: 'in_progress', run_id: 7 }, run, { latitude: '35.7', longitude: '-5.8', fresh: 0 }), 1);
  assert.equal(stale.position, null);
  assert.equal(firstName('  '), null);
});

test('order tracking: distance and arrival time to the delivery point', async () => {
  const { arrivalEstimate } = await import('./orderTracking.js');
  assert.equal(arrivalEstimate(null, { lat: 1, lng: 1 }), null);
  assert.equal(arrivalEstimate({ latitude: 35.76, longitude: -5.81 }, null), null);
  const far = arrivalEstimate({ latitude: 35.7672, longitude: -5.8102 }, { lat: 35.7395, lng: -5.8902 });
  assert.ok(far.distance_km > 8 && far.distance_km < 11, String(far.distance_km));
  assert.equal(far.eta_minutes % 5, 0);
  assert.equal(far.nearby, false);
  assert.deepEqual(arrivalEstimate({ latitude: 35.7672, longitude: -5.8102 }, { lat: 35.7675, lng: -5.8103 }), { distance_km: 0, eta_minutes: 1, eta_range: [1, 4], nearby: true });
  assert.deepEqual(far.eta_range, [far.eta_minutes >= 20 ? Math.max(5, Math.round((far.eta_minutes * 0.8) / 5) * 5) : 0, Math.max(5, Math.round((far.eta_minutes * 1.25) / 5) * 5)]);
});

test('delivery alerts: departure for each online order, one "arriving" alert when close', async () => {
  const { notifyDeparture, checkArrivals, deliveryMessage } = await import('./deliveryAlerts.js');
  const sent = [];
  const notify = async (id, msg) => sent.push([id, msg.title, msg.body]);
  const localeOf = async () => 'fr';
  const rows = [{ queue_id: 5, near_notified_at: null, id: 9, order_number: 'BD-9', user_id: 42, shipping_lat: '35.7672', shipping_lng: '-5.8102', delivery_method: 'delivery' }];
  let marked = 0;
  const db = { query: async (sql) => (/information_schema/.test(sql) ? [[{ n: 1 }]] : /UPDATE delivery_queue/.test(sql) ? [{ affectedRows: marked++ === 0 ? 1 : 0 }] : [rows]) };
  assert.equal(await notifyDeparture(1, { db, notify, localeOf }), 1);
  assert.deepEqual(sent[0], [42, 'Votre commande est en route', "La commande BD-9 vient de partir. Suivez le livreur dans l'app."]);
  // Far away: nothing. Close: one alert; the same position again: no second alert.
  assert.equal(await checkArrivals(3, { latitude: 35.9, longitude: -5.5 }, { db, notify, localeOf }), 0);
  assert.equal(await checkArrivals(3, { latitude: 35.7690, longitude: -5.8110 }, { db, notify, localeOf }), 1);
  assert.equal(await checkArrivals(3, { latitude: 35.7690, longitude: -5.8110 }, { db, notify, localeOf }), 0);
  assert.match(sent[1][2], /BD-9 : arrivée dans ~1 min/);
  assert.equal(deliveryMessage({ kind: 'arriving', number: 'X', minutes: 4, locale: 'ar' }).title, 'السائق يقترب');
});

test('AlloGPS: every value of an answer is listed, the last point of a list, never a token', () => {
  const details = detailsFrom({ token: 'abc', data: { speed: 42, sensors: { fuel: 30 }, points: [{ lat: 1 }, { lat: 2 }] } });
  assert.deepEqual(details, [
    { champ: 'data.speed', valeur: '42' },
    { champ: 'data.sensors.fuel', valeur: '30' },
    { champ: 'data.points.lat', valeur: '2' },
  ]);
});

test('AlloGPS: a server process that does not read AlloGPS shows the reading saved by the one that does', async () => {
  const { currentGpsState } = await import('./gpsSync.js');
  const saved = { lastSyncAt: '2026-11-26T10:00:00.000Z', lastError: null, vehicles: [{ key: 'A1', name: 'Camion' }], live: { A1: { position: { latitude: 35.7 } } }, updated: 1 };
  const db = { query: async (sql) => (/FROM gps_etat/.test(sql) ? [[{ data: JSON.stringify(saved) }]] : [[{ n: 1 }]]) };
  const state = await currentGpsState(db, Date.parse('2026-11-26T10:00:30Z'));
  assert.equal(state.vehicles[0].name, 'Camion');
  assert.equal(state.live.A1.position.latitude, 35.7);
  assert.ok(state.lastSyncAt instanceof Date);
});
