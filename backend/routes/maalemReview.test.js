import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pool from '../db/pool.js';
import maalemProfilesRouter, { adminMaalemProfilesRouter } from './maalemProfiles.js';

function profileRow(overrides = {}) {
  return {
    id: 71,
    contact_id: 42,
    category_id: 5,
    status: 'submitted',
    origin: 'ARTISAN_CONVERSION',
    professional_data: JSON.stringify({
      skills: ['Plomberie'],
      contact_phone: '+212600000000',
      city: 'Tanger',
      intervention_areas: ['Tanger'],
      experience_years: 8,
      professional_summary: 'Artisan expérimenté',
      experiences: 'Chantiers résidentiels',
      availability: 'weekdays',
      other_information: null,
    }),
    contact_nom_complet: 'Artisan Test',
    contact_email: 'artisan@example.test',
    contact_telephone: '+212600000000',
    contact_type_compte: 'Artisan/Promoteur',
    contact_shipping_city: 'Tanger',
    category_nom: 'Plomberie',
    category_nom_ar: 'سباكة',
    category_is_active: 1,
    created_at: '2026-08-09 08:00:00',
    updated_at: '2026-08-09 09:00:00',
    submitted_at: '2026-08-09 09:00:00',
    ...overrides,
  };
}

function createReviewDatabase(overrides = {}) {
  const state = {
    profile: profileRow(overrides.profile),
    activeCategory: overrides.activeCategory !== false,
    history: [],
    queries: [],
    commits: 0,
    rollbacks: 0,
    failHistory: false,
  };
  const connection = {
    async beginTransaction() {},
    async commit() { state.commits += 1; },
    async rollback() { state.rollbacks += 1; },
    release() {},
    async query(sql, params = []) {
      state.queries.push({ sql, params });
      if (sql.includes('FROM maalem_profiles') && sql.includes('FOR UPDATE')) {
        return [[{
          id: state.profile.id,
          contact_id: state.profile.contact_id,
          category_id: state.profile.category_id,
          status: state.profile.status,
        }]];
      }
      if (sql.includes('FROM maalem_categories')) {
        return [state.activeCategory ? [{ id: Number(params[0]), is_active: 1, deleted_at: null }] : []];
      }
      if (sql.includes('FROM employees')) {
        return [[{ id: 9, nom_complet: 'PDG Test', cin: 'PDG1' }]];
      }
      if (sql.includes('UPDATE maalem_profiles') && sql.includes('SET status =')) {
        state.profile.status = params[0];
        state.profile.status_reason = params[1];
        state.profile.reviewed_by = params[2];
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('UPDATE maalem_profiles') && sql.includes('SET category_id =')) {
        state.profile.category_id = params[0];
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('INSERT INTO maalem_profile_history')) {
        if (state.failHistory) throw new Error('history unavailable');
        state.history.unshift({
          id: state.history.length + 1,
          profile_id: Number(params[0]),
          event_type: params[1],
          old_status: params[2],
          new_status: params[3],
          old_category_id: params[4],
          new_category_id: params[5],
          note: params[6],
          actor_type: params[7],
          actor_employee_id: params[8],
          actor_contact_id: params[9],
          actor_name: params[10],
          created_at: '2026-08-09 10:00:00',
        });
        return [{ insertId: state.history[0].id }];
      }
      throw new Error(`Unexpected connection query: ${sql}`);
    },
  };
  return { state, connection };
}

async function withAdminServer(database, callback, { role = 'PDG' } = {}) {
  const originalGetConnection = pool.getConnection;
  const originalQuery = pool.query;
  pool.getConnection = async () => database.connection;
  pool.query = async (sql, params = []) => {
    database.state.queries.push({ sql, params, pool: true });
    if (sql.includes('FROM maalem_profile_history')) {
      return [database.state.history];
    }
    if (sql.includes('FROM maalem_profile_documents')) return [[]];
    if (sql.includes('SELECT mp.*') && sql.includes('mp.contact_id = ?')) {
      return [[database.state.profile]];
    }
    if (sql.includes('SELECT mp.*') && sql.includes('INNER JOIN contacts')) {
      return [[database.state.profile]];
    }
    if (sql.includes('GROUP BY mp.status')) {
      return [[{ status: database.state.profile.status, total: 1 }]];
    }
    throw new Error(`Unexpected pool query: ${sql}`);
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 9, role };
    next();
  });
  app.use('/api/admin/maalem-profiles', adminMaalemProfilesRouter);
  app.use((error, _req, res, _next) => res.status(500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/admin/maalem-profiles`;
  try {
    await callback(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    pool.getConnection = originalGetConnection;
    pool.query = originalQuery;
  }
}

async function patchJson(url, body) {
  return fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('le workflow PDG respecte submitted → under_review → approved → suspended et journalise chaque décision', async () => {
  const database = createReviewDatabase();
  const originalContact = {
    id: database.state.profile.contact_id,
    type_compte: database.state.profile.contact_type_compte,
  };
  await withAdminServer(database, async (baseUrl) => {
    let response = await patchJson(`${baseUrl}/71/status`, { status: 'under_review', reason: 'Pièces reçues' });
    assert.equal(response.status, 200);
    response = await patchJson(`${baseUrl}/71/status`, { status: 'approved', reason: 'Dossier conforme' });
    assert.equal(response.status, 200);
    response = await patchJson(`${baseUrl}/71/status`, { status: 'suspended', reason: 'Contrôle qualité requis' });
    assert.equal(response.status, 200);
  });
  assert.equal(database.state.profile.status, 'suspended');
  assert.deepEqual(database.state.history.map((item) => [item.old_status, item.new_status]), [
    ['approved', 'suspended'],
    ['under_review', 'approved'],
    ['submitted', 'under_review'],
  ]);
  assert.ok(database.state.history.every((item) => item.actor_type === 'BACKOFFICE'));
  assert.ok(database.state.history.every((item) => item.actor_employee_id === 9));
  assert.equal(database.state.queries.some(({ sql }) => /UPDATE\s+contacts/i.test(sql)), false);
  assert.deepEqual(originalContact, { id: 42, type_compte: 'Artisan/Promoteur' });
});

test('une transition interdite est rejetée sans décision ni mutation', async () => {
  const database = createReviewDatabase();
  await withAdminServer(database, async (baseUrl) => {
    const response = await patchJson(`${baseUrl}/71/status`, { status: 'approved' });
    assert.equal(response.status, 409);
  });
  assert.equal(database.state.profile.status, 'submitted');
  assert.equal(database.state.history.length, 0);
  assert.equal(database.state.commits, 0);
});

test('une approbation refuse une catégorie inactive avant toute écriture', async () => {
  const database = createReviewDatabase({ profile: { status: 'under_review' }, activeCategory: false });
  await withAdminServer(database, async (baseUrl) => {
    const response = await patchJson(`${baseUrl}/71/status`, { status: 'approved' });
    assert.equal(response.status, 400);
    assert.match((await response.json()).message, /catégorie Maalem active/i);
  });
  assert.equal(database.state.history.length, 0);
  assert.equal(database.state.commits, 0);
});

test('la décision et son audit sont atomiques', async () => {
  const database = createReviewDatabase();
  database.state.failHistory = true;
  await withAdminServer(database, async (baseUrl) => {
    const response = await patchJson(`${baseUrl}/71/status`, { status: 'under_review' });
    assert.equal(response.status, 500);
  });
  assert.equal(database.state.commits, 0);
  assert.equal(database.state.rollbacks, 1);
});

test('la correction de catégorie exige une catégorie active et conserve un événement', async () => {
  const database = createReviewDatabase();
  await withAdminServer(database, async (baseUrl) => {
    const response = await patchJson(`${baseUrl}/71/category`, {
      category_id: 8,
      note: 'Catégorie confirmée pendant l’entretien',
    });
    assert.equal(response.status, 200);
  });
  assert.equal(database.state.profile.category_id, 8);
  assert.equal(database.state.history[0].event_type, 'CATEGORY_CHANGED');
  assert.equal(database.state.history[0].old_category_id, 5);
  assert.equal(database.state.history[0].new_category_id, 8);
});

test('les notes internes sont append-only, attribuées au PDG et validées', async () => {
  const database = createReviewDatabase();
  await withAdminServer(database, async (baseUrl) => {
    let response = await fetch(`${baseUrl}/71/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: 'Référence professionnelle vérifiée.' }),
    });
    assert.equal(response.status, 201);
    response = await fetch(`${baseUrl}/71/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: ' ' }),
    });
    assert.equal(response.status, 400);
  });
  assert.equal(database.state.history.length, 1);
  assert.equal(database.state.history[0].event_type, 'INTERNAL_NOTE');
  assert.equal(database.state.history[0].actor_name, 'PDG Test');
});

test('la liste applique les filtres métier et la fiche agrège dossier, documents et historique', async () => {
  const database = createReviewDatabase();
  database.state.history.push({
    id: 1,
    profile_id: 71,
    event_type: 'STATUS_CHANGED',
    old_status: 'submitted',
    new_status: 'under_review',
    actor_type: 'BACKOFFICE',
    actor_name: 'PDG Test',
    created_at: '2026-08-09 10:00:00',
  });
  await withAdminServer(database, async (baseUrl) => {
    let response = await fetch(`${baseUrl}?q=Artisan&status=submitted&origin=ARTISAN_CONVERSION&category_id=5&city=Tanger`);
    assert.equal(response.status, 200);
    const list = await response.json();
    assert.equal(list.profiles.length, 1);
    assert.equal(list.counts.submitted, 1);
    const listQuery = database.state.queries.find(({ sql }) => sql.includes('ORDER BY mp.updated_at'));
    assert.match(listQuery.sql, /mp\.origin = \?/);
    assert.match(listQuery.sql, /mp\.category_id = \?/);
    assert.match(listQuery.sql, /JSON_EXTRACT/);

    response = await fetch(`${baseUrl}/71`);
    assert.equal(response.status, 200);
    const detail = await response.json();
    assert.equal(detail.profile.id, 71);
    assert.equal(detail.history.length, 1);
    assert.deepEqual(detail.documents, []);
  });
});

test('les endpoints de traitement restent interdits aux rôles non autorisés', async () => {
  const database = createReviewDatabase();
  await withAdminServer(database, async (baseUrl) => {
    const response = await patchJson(`${baseUrl}/71/status`, { status: 'under_review' });
    assert.equal(response.status, 403);
  }, { role: 'Commercial' });
  assert.equal(database.state.queries.length, 0);
});

test('la soumission publique journalise le candidat sans lui ouvrir une décision Back-office', async () => {
  const profile = profileRow({ status: 'draft' });
  const contact = {
    id: 42,
    nom_complet: 'Artisan Test',
    email: 'artisan@example.test',
    telephone: '+212600000000',
    shipping_city: 'Tanger',
    type_compte: 'Artisan/Promoteur',
    artisan_approuve: 1,
    demande_artisan: 1,
    auth_provider: 'local',
  };
  const events = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql, params = []) {
      if (sql.includes('FROM contacts') && sql.includes('FOR UPDATE')) return [[contact]];
      if (sql.includes('FROM maalem_profiles') && sql.includes('FOR UPDATE')) return [[profile]];
      if (sql.includes('FROM maalem_categories')) return [[{ id: 5, is_active: 1, deleted_at: null }]];
      if (sql.includes('UPDATE maalem_profiles')) {
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('INSERT INTO maalem_profile_history')) {
        events.push(params);
        return [{ insertId: 1 }];
      }
      throw new Error(`Unexpected submission query: ${sql}`);
    },
  };
  const originalGetConnection = pool.getConnection;
  const originalQuery = pool.query;
  pool.getConnection = async () => connection;
  pool.query = async (sql) => {
    if (sql.includes('FROM maalem_profiles')) return [[profile]];
    throw new Error(`Unexpected submission pool query: ${sql}`);
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 42, type_compte: 'Artisan/Promoteur' };
    next();
  });
  app.use('/api/maalem-profiles', maalemProfilesRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/maalem-profiles/me/submit`, {
      method: 'POST',
    });
    assert.equal(response.status, 200);
    assert.equal(events.length, 1);
    assert.equal(events[0][1], 'STATUS_CHANGED');
    assert.equal(events[0][2], 'draft');
    assert.equal(events[0][3], 'submitted');
    assert.equal(events[0][7], 'CANDIDATE');
    assert.equal(events[0][9], 42);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    pool.getConnection = originalGetConnection;
    pool.query = originalQuery;
  }
});
