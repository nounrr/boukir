import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pool from '../db/pool.js';
import { adminMaalemProfilesRouter } from './maalemProfiles.js';
import { hashMaalemActivationToken } from '../utils/maalemTeamCreation.js';

function teamCreationDatabase({ existingContact = null, identityRows = null, categoryActive = true } = {}) {
  let contact = existingContact;
  let profile = existingContact?.maalem_profile_id ? {
    id: existingContact.maalem_profile_id,
    contact_id: existingContact.id,
    category_id: 8,
    status: existingContact.maalem_profile_status || 'submitted',
    origin: existingContact.maalem_profile_origin || 'SELF_SERVICE',
    professional_data: JSON.stringify({ skills: ['Existante'] }),
  } : null;
  let contactInsertParams = null;
  let profileInsertParams = null;
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql, params = []) {
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
      if (sql.includes('FROM maalem_categories')) return [[categoryActive ? { id: 8, is_active: 1 } : null].filter(Boolean)];
      if (sql.includes('FROM contacts c') && sql.includes('LEFT JOIN maalem_profiles')) {
        return [identityRows || [contact].filter(Boolean)];
      }
      if (sql.includes('INSERT INTO contacts')) {
        contactInsertParams = params;
        contact = {
          id: 303,
          prenom: params[1],
          nom: params[2],
          nom_complet: params[0],
          email: params[3],
          telephone: params[4],
          type_compte: 'Artisan/Promoteur',
          artisan_approuve: 1,
          auth_provider: 'local',
          is_active: 1,
          is_blocked: 0,
          deleted_at: null,
          maalem_profile_id: null,
        };
        return [{ insertId: contact.id }];
      }
      if (sql.includes('INSERT INTO maalem_profiles')) {
        profileInsertParams = params;
        profile = {
          id: 707,
          contact_id: params[0],
          category_id: params[1],
          status: 'draft',
          origin: 'TEAM_CREATED',
          created_by_employee_id: params[3],
          professional_data: params[2],
          created_at: '2026-08-09 12:00:00',
          updated_at: '2026-08-09 12:00:00',
        };
        if (contact) {
          contact.maalem_profile_id = profile.id;
          contact.maalem_profile_status = profile.status;
        }
        return [{ insertId: profile.id }];
      }
      throw new Error(`Unexpected connection query: ${sql}`);
    },
  };
  return {
    connection,
    get contact() { return contact; },
    get profile() { return profile; },
    get contactInsertParams() { return contactInsertParams; },
    get profileInsertParams() { return profileInsertParams; },
  };
}

async function withAdminMaalemServer(database, callback, role = 'PDG') {
  const originalGetConnection = pool.getConnection;
  const originalQuery = pool.query;
  const originalWhtspBase = process.env.WHTSP_SERVICE_BASE_URL;
  const originalWhtspKey = process.env.WHTSP_SERVICE_API_KEY;
  delete process.env.WHTSP_SERVICE_BASE_URL;
  delete process.env.WHTSP_SERVICE_API_KEY;
  pool.getConnection = async () => database.connection;
  pool.query = async (sql, params = []) => {
    if (sql.includes('FROM contacts c') && sql.includes('LEFT JOIN maalem_profiles')) {
      return database.connection.query(sql, params);
    }
    if (sql.includes('FROM maalem_profiles mp')) {
      return [[database.profile ? {
        ...database.profile,
        contact_nom_complet: database.contact?.nom_complet,
        contact_email: database.contact?.email,
        contact_telephone: database.contact?.telephone,
        contact_type_compte: database.contact?.type_compte,
        category_nom: 'Plomberie',
        category_nom_ar: 'السباكة',
        category_is_active: 1,
      } : null].filter(Boolean)];
    }
    throw new Error(`Unexpected pool query: ${sql}`);
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 9, role }; next(); });
  app.use('/api/admin/maalem-profiles', adminMaalemProfilesRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    pool.getConnection = originalGetConnection;
    pool.query = originalQuery;
    if (originalWhtspBase === undefined) delete process.env.WHTSP_SERVICE_BASE_URL;
    else process.env.WHTSP_SERVICE_BASE_URL = originalWhtspBase;
    if (originalWhtspKey === undefined) delete process.env.WHTSP_SERVICE_API_KEY;
    else process.env.WHTSP_SERVICE_API_KEY = originalWhtspKey;
  }
}

const teamPayload = {
  prenom: 'Amal',
  nom: 'Artisan',
  email: 'amal@example.com',
  telephone: '0612345678',
  category_id: 8,
  professional_data: {
    skills: ['Plomberie'],
    city: 'Tanger',
    intervention_areas: ['Tanger'],
    experience_years: 6,
    professional_summary: 'Artisane spécialisée',
    experiences: 'Chantiers résidentiels',
    availability: 'weekdays',
    other_information: null,
  },
};

test('POST /team-create crée un Artisan et un brouillon audité sans mot de passe transmis', async () => {
  const database = teamCreationDatabase();
  await withAdminMaalemServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/maalem-profiles/team-create`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(teamPayload),
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.created_user, true);
    assert.equal(body.created_profile, true);
    assert.equal(body.profile.status, 'draft');
    assert.equal(body.profile.origin, 'TEAM_CREATED');
    assert.equal(body.profile.created_by_employee_id, 9);
    assert.equal(body.invitation.delivery_status, 'manual');
    const invitationToken = new URLSearchParams(new URL(body.invitation.activation_url).hash.slice(1)).get('token');
    assert.match(invitationToken, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(database.contactInsertParams[8], hashMaalemActivationToken(invitationToken));
    assert.match(database.contactInsertParams[6], /^\$2[aby]\$/);
    assert.equal(database.contactInsertParams.includes(invitationToken), false);
    assert.deepEqual(database.profileInsertParams.slice(0, 2), [303, 8]);
  });
});

test('POST /team-create rattache uniquement le profil à un Artisan existant', async () => {
  const existing = {
    id: 44,
    prenom: 'Amal', nom: 'Artisan', nom_complet: 'Amal Artisan',
    email: 'amal@example.com', telephone: '+212612345678',
    type_compte: 'Artisan/Promoteur', artisan_approuve: 1,
    auth_provider: 'local', is_active: 1, is_blocked: 0, deleted_at: null,
    maalem_profile_id: null,
  };
  const original = structuredClone(existing);
  const database = teamCreationDatabase({ existingContact: existing });
  await withAdminMaalemServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/maalem-profiles/team-create`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(teamPayload),
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.created_user, false);
    assert.equal(body.created_profile, true);
    assert.equal(body.invitation, null);
    assert.equal(database.contactInsertParams, null);
    assert.equal(database.contact.id, original.id);
    assert.equal(database.contact.email, original.email);
    assert.equal(database.contact.type_compte, original.type_compte);
  });
});

test('POST /team-create reprend un profil existant sans modifier son statut', async () => {
  const existing = {
    id: 44,
    prenom: 'Amal', nom: 'Artisan', nom_complet: 'Amal Artisan',
    email: 'amal@example.com', telephone: '+212612345678',
    type_compte: 'Artisan/Promoteur', artisan_approuve: 1,
    auth_provider: 'local', is_active: 1, is_blocked: 0, deleted_at: null,
    maalem_profile_id: 91, maalem_profile_status: 'suspended', maalem_profile_origin: 'SELF_SERVICE',
  };
  const database = teamCreationDatabase({ existingContact: existing });
  await withAdminMaalemServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/maalem-profiles/team-create`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(teamPayload),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.created_user, false);
    assert.equal(body.created_profile, false);
    assert.equal(body.profile.status, 'suspended');
    assert.equal(database.profileInsertParams, null);
  });
});

test('les permissions PDG bloquent la création avant tout accès DB', async () => {
  const database = teamCreationDatabase();
  await withAdminMaalemServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/maalem-profiles/team-create`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(teamPayload),
    });
    assert.equal(response.status, 403);
    assert.equal(database.contactInsertParams, null);
    assert.equal(database.profileInsertParams, null);
  }, 'Manager');
});

test('la création refuse une catégorie inactive avant toute insertion', async () => {
  const database = teamCreationDatabase({ categoryActive: false });
  await withAdminMaalemServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/maalem-profiles/team-create`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(teamPayload),
    });
    assert.equal(response.status, 400);
    assert.equal(database.contactInsertParams, null);
    assert.equal(database.profileInsertParams, null);
  });
});

test('la création refuse de promouvoir silencieusement un compte Client existant', async () => {
  const database = teamCreationDatabase({ existingContact: {
    id: 45,
    prenom: 'Amal', nom: 'Client', nom_complet: 'Amal Client',
    email: 'amal@example.com', telephone: '+212612345678',
    type_compte: 'Client', artisan_approuve: 0,
    auth_provider: 'local', is_active: 1, is_blocked: 0, deleted_at: null,
    maalem_profile_id: null,
  } });
  await withAdminMaalemServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/maalem-profiles/team-create`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(teamPayload),
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, 'NON_ARTISAN_ACCOUNT');
    assert.equal(database.contactInsertParams, null);
    assert.equal(database.profileInsertParams, null);
  });
});

test('lookup bloque un conflit email/téléphone entre deux comptes', async () => {
  const emailContact = {
    id: 1, email: 'amal@example.com', telephone: '+212699999999',
    type_compte: 'Artisan/Promoteur', artisan_approuve: 1, auth_provider: 'local',
    is_active: 1, is_blocked: 0, deleted_at: null,
  };
  const phoneContact = {
    id: 2, email: 'autre@example.com', telephone: '+212612345678',
    type_compte: 'Artisan/Promoteur', artisan_approuve: 1, auth_provider: 'local',
    is_active: 1, is_blocked: 0, deleted_at: null,
  };
  const database = teamCreationDatabase({ identityRows: [emailContact, phoneContact] });
  await withAdminMaalemServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/maalem-profiles/lookup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: teamPayload.email, telephone: teamPayload.telephone }),
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, 'IDENTITY_CONFLICT');
  });
});
