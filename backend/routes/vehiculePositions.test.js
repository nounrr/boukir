import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createVehiculePositionsRouter, parsePosition } from './vehiculePositions.js';

/** A stand-in database: it records every statement and answers the few the routes read. */
function fakeDb({ vehicles = [{ id: 3 }], fleet = [], trail = [] } = {}) {
  const seen = [];
  return {
    seen,
    query: async (sql, params = []) => {
      seen.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (/SELECT id(, gps_key)? FROM vehicules/.test(sql)) return [vehicles.filter((v) => v.id === params[0])];
      if (/FROM vehicules v/.test(sql)) return [fleet];
      if (/FROM vehicule_positions_historique\s+WHERE/.test(sql)) return [trail];
      return [{ affectedRows: 1 }];
    },
  };
}

async function serve(db, user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => ((req.user = user), next()));
  app.use('/positions', createVehiculePositionsRouter({ db, ensure: async () => {} }));
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/positions` }));
  });
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const tanger = { latitude: 35.7595, longitude: -5.834, vitesse_kmh: 42.4, cap: 180, precision_m: 12 };

test('checks a position before keeping it', () => {
  assert.deepEqual(parsePosition(tanger), { latitude: 35.7595, longitude: -5.834, vitesse_kmh: 42.4, cap: 180, precision_m: 12, source: 'telephone' });
  assert.equal(parsePosition({ latitude: 91, longitude: 0 }), null);
  assert.equal(parsePosition({ latitude: 35, longitude: 200 }), null);
  assert.equal(parsePosition({ latitude: 'abc', longitude: -5 }), null);
  assert.equal(parsePosition({ latitude: 0, longitude: 0 }), null);
  assert.equal(parsePosition({}), null);
  // An impossible speed or heading is dropped, the position is kept.
  assert.deepEqual(parsePosition({ latitude: 35, longitude: -5, vitesse_kmh: 900, cap: -4 }), { latitude: 35, longitude: -5, vitesse_kmh: null, cap: null, precision_m: null, source: 'telephone' });
  assert.equal(parsePosition({ ...tanger, source: 'boitier' }).source, 'boitier');
  assert.equal(parsePosition({ ...tanger, source: 'autre' }).source, 'telephone');
});

test("a driver's phone records the vehicle's position, latest and history", async () => {
  const db = fakeDb();
  const { server, url } = await serve(db, { id: 12, role: 'Chauffeur' });
  try {
    const res = await post(`${url}/3`, tanger);
    assert.equal(res.status, 201);
    const latest = db.seen.find((q) => q.sql.startsWith('INSERT INTO vehicule_positions ('));
    assert.deepEqual(latest.params, [3, 35.7595, -5.834, 42.4, 180, 12, 'telephone', 12]);
    assert.ok(db.seen.some((q) => q.sql.startsWith('INSERT INTO vehicule_positions_historique')));
    assert.ok(db.seen.some((q) => /DELETE FROM vehicule_positions_historique .*30 DAY/.test(q.sql)));
  } finally {
    server.close();
  }
});

test('refuses a bad position, an unknown vehicle and anyone who is not staff', async () => {
  const staff = await serve(fakeDb(), { id: 12, role: 'Chauffeur' });
  try {
    assert.equal((await post(`${staff.url}/3`, { latitude: 999, longitude: 0 })).status, 400);
    assert.equal((await post(`${staff.url}/abc`, tanger)).status, 400);
    assert.equal((await post(`${staff.url}/99`, tanger)).status, 404);
  } finally {
    staff.server.close();
  }
  for (const user of [undefined, { id: 5 }, { id: 6, role: 'x', type_compte: 'Client' }]) {
    const db = fakeDb();
    const { server, url } = await serve(db, user);
    try {
      assert.equal((await post(`${url}/3`, tanger)).status, 403);
      assert.equal(db.seen.length, 0);
    } finally {
      server.close();
    }
  }
});

test('shows the fleet to the management, with and without a position', async () => {
  const fleet = [
    { id: 3, nom: 'Camion 3', immatriculation: '1234-A-40', latitude: '35.7595000', longitude: '-5.8340000', vitesse_kmh: '42.4', cap: null, precision_m: '12.0', source: 'telephone', recorded_at: '2026-11-19T10:00:00.000Z', chauffeur: 'Karim' },
    { id: 4, nom: 'Fourgon', immatriculation: null, latitude: null },
  ];
  const { server, url } = await serve(fakeDb({ fleet }), { id: 1, role: 'PDG' });
  try {
    const res = await fetch(url);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const body = await res.json();
    assert.deepEqual(body[0].position, { latitude: 35.7595, longitude: -5.834, vitesse_kmh: 42.4, cap: null, contact: null, precision_m: 12, source: 'telephone', recorded_at: '2026-11-19T10:00:00.000Z', chauffeur: 'Karim' });
    assert.deepEqual(body[1], { id: 4, nom: 'Fourgon', immatriculation: null, gps: false, position: null });
  } finally {
    server.close();
  }
});

test('keeps the map and the trail from the other roles', async () => {
  for (const role of ['Employé', 'Chauffeur']) {
    const { server, url } = await serve(fakeDb(), { id: 9, role });
    try {
      assert.equal((await fetch(url)).status, 403);
      assert.equal((await fetch(`${url}/3/trajet`)).status, 403);
    } finally {
      server.close();
    }
  }
});

test('gives the recent trail, bounded', async () => {
  const db = fakeDb({ trail: [{ latitude: '35.76', longitude: '-5.83', vitesse_kmh: null, recorded_at: 'a' }] });
  const { server, url } = await serve(db, { id: 1, role: 'ChefChauffeur' });
  try {
    const res = await fetch(`${url}/3/trajet?heures=9999`);
    assert.deepEqual(await res.json(), [{ latitude: 35.76, longitude: -5.83, vitesse_kmh: null, recorded_at: 'a' }]);
    assert.deepEqual(db.seen.at(-1).params, [3, 168]);
    assert.equal((await fetch(`${url}/0/trajet`)).status, 400);
  } finally {
    server.close();
  }
});

test('a vehicle day: the vehicle, its points of that day and what they add up to', async () => {
  const seen = [];
  const db = {
    query: async (sql, params = []) => {
      seen.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (/SELECT \* FROM vehicules WHERE id/.test(sql)) return [[{ id: 3, nom: 'Camion', immatriculation: '123-A-6', gps_key: null }]];
      if (/FROM vehicule_positions p/.test(sql)) return [[{ latitude: '35.78', longitude: '-5.83', vitesse_kmh: '55.0', cap: null, contact: 1, source: 'boitier', recorded_at: '2026-11-26T08:29:00Z' }]];
      if (/FROM vehicule_positions_historique\s+WHERE/.test(sql)) {
        return [[
          { latitude: '35.70', longitude: '-5.83', vitesse_kmh: '40', recorded_at: '2026-11-26T08:00:00Z' },
          { latitude: '35.72', longitude: '-5.83', vitesse_kmh: '62', recorded_at: '2026-11-26T08:02:00Z' },
        ]];
      }
      return [[]];
    },
  };
  const { server, url } = await serve(db, { id: 1, role: 'PDG' });
  try {
    const res = await fetch(`${url}/3/jour?date=2026-11-26`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.vehicule.nom, 'Camion');
    assert.equal(body.position.contact, true);
    assert.equal(body.points.length, 2);
    assert.equal(body.stats.max_kmh, 62);
    assert.ok(body.stats.distance_km > 2);
    const day = seen.find((q) => /historique WHERE/.test(q.sql));
    assert.deepEqual(day.params, [3, '2026-11-26 00:00:00', '2026-11-26 00:00:00']);
    assert.equal((await fetch(`${url}/3/jour?date=2026-02-30`)).status, 400);
    assert.equal((await fetch(`${url}/3/jour?date=hier`)).status, 400);
  } finally {
    server.close();
  }
});

test('a vehicle day is for the management only', async () => {
  const { server, url } = await serve({ query: async () => [[]] }, { id: 2, role: 'Chauffeur' });
  try {
    assert.equal((await fetch(`${url}/3/jour`)).status, 403);
  } finally {
    server.close();
  }
});
