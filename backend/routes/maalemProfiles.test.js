import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pool from '../db/pool.js';
import maalemProfilesRouter from './maalemProfiles.js';

function createDatabaseDouble({ contact, profile: initialProfile = null }) {
  let profile = initialProfile;
  let insertCount = 0;
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql, params = []) {
      if (sql.includes('FROM contacts') && sql.includes('FOR UPDATE')) return [[contact]];
      if (sql.includes('FROM maalem_profiles') && sql.includes('FOR UPDATE')) {
        return [[profile].filter(Boolean)];
      }
      if (sql.includes('INSERT INTO maalem_profiles')) {
        insertCount += 1;
        profile = {
          id: 91,
          contact_id: contact.id,
          category_id: null,
          status: 'draft',
          professional_data: params[1],
          status_reason: null,
          submitted_at: null,
          reviewed_at: null,
          reviewed_by: null,
          created_at: '2026-08-09 10:00:00',
          updated_at: '2026-08-09 10:00:00',
        };
        return [{ insertId: profile.id }];
      }
      throw new Error(`Unexpected connection query: ${sql}`);
    },
  };

  return {
    connection,
    contact,
    contactId: contact.id,
    get insertCount() { return insertCount; },
    get profile() { return profile; },
  };
}

async function withJoinServer(database, callback) {
  const originalGetConnection = pool.getConnection;
  const originalQuery = pool.query;
  pool.getConnection = async () => database.connection;
  pool.query = async (sql) => {
    if (sql.includes('FROM maalem_profiles')) return [[database.profile].filter(Boolean)];
    throw new Error(`Unexpected pool query: ${sql}`);
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: database.contactId, type_compte: 'Artisan/Promoteur' };
    next();
  });
  app.use('/api/maalem-profiles', maalemProfilesRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    pool.getConnection = originalGetConnection;
    pool.query = originalQuery;
  }
}

function artisanDatabase(overrides = {}) {
  const contact = {
    id: 42,
    type_compte: 'Artisan/Promoteur',
    demande_artisan: 1,
    artisan_approuve: 1,
    auth_provider: 'local',
    telephone: '+212600000000',
    shipping_city: 'Tanger',
    ...overrides.contact,
  };
  return createDatabaseDouble({ contact, profile: overrides.profile ?? null });
}

test('POST /me/join crée un seul brouillon puis reprend le même profil', async () => {
  const database = artisanDatabase();
  const originalContact = structuredClone(database.contact);
  await withJoinServer(database, async (baseUrl) => {
    const first = await fetch(`${baseUrl}/api/maalem-profiles/me/join`, { method: 'POST' });
    assert.equal(first.status, 201);
    const firstBody = await first.json();
    assert.equal(firstBody.created, true);
    assert.equal(firstBody.profile.status, 'draft');
    assert.equal(firstBody.profile.contact_id, 42);
    assert.deepEqual(firstBody.profile.professional_data, {
      skills: [],
      contact_phone: '+212600000000',
      city: 'Tanger',
      intervention_areas: [],
      experience_years: null,
      professional_summary: null,
      experiences: null,
      availability: null,
      other_information: null,
    });

    const second = await fetch(`${baseUrl}/api/maalem-profiles/me/join`, { method: 'POST' });
    assert.equal(second.status, 200);
    assert.equal((await second.json()).created, false);
    assert.equal(database.insertCount, 1);
    assert.deepEqual(database.contact, originalContact);
  });
});

test('POST /me/join reprend chaque statut sans créer ni modifier un profil', async () => {
  for (const status of ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'suspended']) {
    const existingProfile = {
      id: 77,
      contact_id: 42,
      category_id: 3,
      status,
      professional_data: JSON.stringify({ skills: ['Plomberie'] }),
      status_reason: ['rejected', 'suspended'].includes(status) ? 'Décision administrative' : null,
    };
    const database = artisanDatabase({ profile: existingProfile });
    await withJoinServer(database, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/maalem-profiles/me/join`, { method: 'POST' });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.created, false);
      assert.equal(body.profile.status, status);
      assert.equal(database.insertCount, 0);
      assert.equal(database.profile, existingProfile);
    });
  }
});

test('POST /me/join refuse un compte non-Artisan sans créer de profil', async () => {
  const database = artisanDatabase({
    contact: { type_compte: 'Client', demande_artisan: 0, artisan_approuve: 0 },
  });
  await withJoinServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/maalem-profiles/me/join`, { method: 'POST' });
    assert.equal(response.status, 403);
    assert.equal(database.insertCount, 0);
  });
});
