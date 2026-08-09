import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pool from '../db/pool.js';
import maalemAccessRouter from './maalemAccess.js';

async function withAccessServer(initialProfile, callback) {
  const state = {
    profile: initialProfile,
    queryCount: 0,
    user: { id: 42, type_compte: 'Artisan/Promoteur' },
  };
  const originalQuery = pool.query;
  pool.query = async (sql, params) => {
    assert.match(sql, /FROM maalem_profiles/);
    assert.deepEqual(params, [42]);
    state.queryCount += 1;
    return [[state.profile].filter(Boolean)];
  };

  const app = express();
  app.use((req, _res, next) => {
    req.user = state.user;
    next();
  });
  app.use('/api/maalem-access', maalemAccessRouter);
  app.get('/api/ecommerce/artisan-account', (_req, res) => res.json({
    type_compte: 'Artisan/Promoteur',
    remise_balance: 175,
    orders_available: true,
  }));
  app.use((error, _req, res, _next) => res.status(500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await callback({ baseUrl, state });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    pool.query = originalQuery;
  }
}

test('la route protégée applique la matrice complète et retourne 403 aux appels directs refusés', async () => {
  await withAccessServer(null, async ({ baseUrl, state }) => {
    const cases = [
      [null, false, null, 'NO_MAALEM_PROFILE'],
      ['draft', false, 'draft', 'MAALEM_PROFILE_DRAFT'],
      ['submitted', false, 'submitted', 'MAALEM_PROFILE_SUBMITTED'],
      ['under_review', false, 'under_review', 'MAALEM_PROFILE_UNDER_REVIEW'],
      ['approved', true, 'approved', null],
      ['rejected', false, 'rejected', 'MAALEM_PROFILE_REJECTED'],
      ['suspended', false, 'suspended', 'MAALEM_PROFILE_SUSPENDED'],
    ];

    for (const [status, allowed, expectedStatus, reason] of cases) {
      state.profile = status ? { id: 91, contact_id: 42, status } : null;

      const infoResponse = await fetch(`${baseUrl}/api/maalem-access/me`);
      assert.equal(infoResponse.status, 200, String(status));
      const info = await infoResponse.json();
      assert.equal(info.allowed, allowed, String(status));
      assert.equal(info.status, expectedStatus, String(status));
      assert.equal(info.reason, reason, String(status));

      const directResponse = await fetch(`${baseUrl}/api/maalem-access/protected-check`);
      assert.equal(directResponse.status, allowed ? 200 : 403, String(status));
      const direct = await directResponse.json();
      if (allowed) {
        assert.equal(direct.capabilities.operational_features, true);
      } else {
        assert.equal(direct.error_type, 'MAALEM_ACCESS_DENIED');
        assert.equal(direct.reason, reason);
      }
    }
  });
});

test('une suspension prend effet sur la requête suivante sans recréer la session', async () => {
  await withAccessServer({ id: 91, contact_id: 42, status: 'approved' }, async ({ baseUrl, state }) => {
    const first = await fetch(`${baseUrl}/api/maalem-access/protected-check`);
    assert.equal(first.status, 200);

    state.profile = { ...state.profile, status: 'suspended' };
    const second = await fetch(`${baseUrl}/api/maalem-access/protected-check`);
    assert.equal(second.status, 403);
    assert.equal((await second.json()).reason, 'MAALEM_PROFILE_SUSPENDED');
    assert.equal(state.queryCount, 2);
  });
});

test('rejected et suspended bloquent Maalem mais laissent le parcours Artisan disponible', async () => {
  for (const status of ['rejected', 'suspended']) {
    await withAccessServer({ id: 91, contact_id: 42, status }, async ({ baseUrl }) => {
      const maalem = await fetch(`${baseUrl}/api/maalem-access/protected-check`);
      assert.equal(maalem.status, 403);

      const ecommerce = await fetch(`${baseUrl}/api/ecommerce/artisan-account`);
      assert.equal(ecommerce.status, 200);
      assert.deepEqual(await ecommerce.json(), {
        type_compte: 'Artisan/Promoteur',
        remise_balance: 175,
        orders_available: true,
      });
    });
  }
});

test('un compte Back-office ne peut pas se faire passer pour un Maalem', async () => {
  await withAccessServer({ id: 91, contact_id: 42, status: 'approved' }, async ({ baseUrl, state }) => {
    state.user = { id: 9, role: 'PDG' };
    const response = await fetch(`${baseUrl}/api/maalem-access/protected-check`);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).reason, 'NO_MAALEM_PROFILE');
    assert.equal(state.queryCount, 0);
  });
});
