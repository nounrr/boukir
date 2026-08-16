import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db/pool.js';
import servicesRouter, { publicServicesRouter } from './services.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceUploads = path.resolve(__dirname, '..', 'uploads', 'services');

async function listUploadedServiceFiles() {
  return new Set(await fs.readdir(serviceUploads).catch(() => []));
}

function createDatabase() {
  const state = {
    service: null,
    nextId: 1,
    categories: new Map([
      [1, { id: 1, nom: 'Plombier', nom_ar: 'سباك', description: null, is_active: 1, deleted_at: null }],
      [2, { id: 2, nom: 'Électricien', nom_ar: 'كهربائي', description: null, is_active: 0, deleted_at: null }],
      [3, { id: 3, nom: 'Maçon', nom_ar: 'بناء', description: null, is_active: 0, deleted_at: '2026-08-01' }],
    ]),
    pivots: new Set(),
    queries: [],
    commits: 0,
    rollbacks: 0,
    failPivotInsert: false,
    snapshot: null,
  };

  const execute = async (sql, params = []) => {
    state.queries.push({ sql, params });
    if (sql.includes('SELECT id FROM maalem_categories') && sql.includes('id IN')) {
      return [params.map(Number).map((id) => state.categories.get(id)).filter((category) => category?.is_active === 1 && category.deleted_at == null).map(({ id }) => ({ id }))];
    }
    if (sql.includes('INSERT INTO services')) {
      const [nom, nomAr, description, descriptionAr, imageUrl, isActive, isPublished, createdBy, updatedBy] = params;
      state.service = {
        id: state.nextId++, nom, nom_ar: nomAr, description, description_ar: descriptionAr,
        image_url: imageUrl, is_active: isActive, is_published: isPublished, created_by: createdBy, updated_by: updatedBy,
        created_at: '2026-08-09 10:00:00', updated_at: '2026-08-09 10:00:00', deleted_at: null,
      };
      return [{ insertId: state.service.id, affectedRows: 1 }];
    }
    if (sql.includes('DELETE FROM service_maalem_categories')) {
      const serviceId = Number(params[0]);
      state.pivots = new Set([...state.pivots].filter((value) => !value.startsWith(`${serviceId}:`)));
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO service_maalem_categories')) {
      if (state.failPivotInsert) throw new Error('pivot unavailable');
      for (let index = 0; index < params.length; index += 2) {
        state.pivots.add(`${Number(params[index])}:${Number(params[index + 1])}`);
      }
      return [{ affectedRows: params.length / 2 }];
    }
    if (sql.includes('FROM services s') && sql.includes('LIMIT 1') && sql.includes('s.id = ?')) {
      const requestedId = Number(params[0]);
      const service = state.service?.id === requestedId ? state.service : null;
      if (!service || service.deleted_at || (sql.includes('s.is_active = 1') && service.is_active !== 1) || (sql.includes('s.is_published = 1') && service.is_published !== 1)) return [[]];
      return [[{ ...service }]];
    }
    if (sql.includes('SELECT id FROM services WHERE') && sql.includes('LIMIT 1')) {
      const service = state.service?.id === Number(params[0]) && !state.service.deleted_at ? state.service : null;
      return [service ? [{ id: service.id }] : []];
    }
    if (sql.includes('FROM services') && sql.includes('ORDER BY nom ASC')) {
      const service = state.service && !state.service.deleted_at && state.service.is_active === 1 ? [{ ...state.service }] : [];
      return [service];
    }
    if (sql.includes('FROM services s') && sql.includes('ORDER BY s.nom')) {
      const service = state.service && !state.service.deleted_at ? [{ ...state.service }] : [];
      return [service];
    }
    if (sql.includes('FROM service_maalem_categories smc') && sql.includes('INNER JOIN maalem_categories')) {
      const requestedServiceIds = new Set(params.map(Number));
      const publicOnly = sql.includes('mc.is_active = 1');
      const rows = [...state.pivots].map((value) => value.split(':').map(Number)).filter(([serviceId]) => requestedServiceIds.has(serviceId)).map(([serviceId, categoryId]) => {
        const category = state.categories.get(categoryId);
        return category ? { service_id: serviceId, ...category } : null;
      }).filter((row) => row && (!publicOnly || (row.is_active === 1 && row.deleted_at == null)));
      return [rows];
    }
    if (sql.includes('SELECT id, image_url FROM services')) {
      return [state.service && !state.service.deleted_at && state.service.id === Number(params[0])
        ? [{ id: state.service.id, image_url: state.service.image_url }]
        : []];
    }
    if (sql.includes('SELECT category_id FROM service_maalem_categories')) {
      const serviceId = Number(params[0]);
      return [[...state.pivots].map((value) => value.split(':').map(Number)).filter(([id]) => id === serviceId).map(([, categoryId]) => ({ category_id: categoryId }))];
    }
    if (sql.includes('UPDATE services') && sql.includes('SET nom =')) {
      const [nom, nomAr, description, descriptionAr, imageUrl, isActive, isPublished, updatedBy, id] = params;
      if (!state.service || state.service.id !== Number(id) || state.service.deleted_at) return [{ affectedRows: 0 }];
      Object.assign(state.service, { nom, nom_ar: nomAr, description, description_ar: descriptionAr, image_url: imageUrl, is_active: isActive, is_published: isPublished, updated_by: updatedBy });
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('SELECT 1') && sql.includes('service_maalem_categories')) {
      const serviceId = Number(params[0]);
      const found = [...state.pivots].some((value) => {
        const [pivotServiceId, categoryId] = value.split(':').map(Number);
        const category = state.categories.get(categoryId);
        return pivotServiceId === serviceId && category?.is_active === 1 && category.deleted_at == null;
      });
      return [found ? [{ 1: 1 }] : []];
    }
    if (sql.includes('UPDATE services') && sql.includes('SET is_active = ?')) {
      const [isActive, updatedBy, id] = params;
      if (!state.service || state.service.id !== Number(id) || state.service.deleted_at) return [{ affectedRows: 0 }];
      state.service.is_active = Number(isActive);
      state.service.updated_by = updatedBy;
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('UPDATE services') && sql.includes('deleted_at = CURRENT_TIMESTAMP')) {
      const [updatedBy, id] = params;
      if (!state.service || state.service.id !== Number(id) || state.service.deleted_at) return [{ affectedRows: 0 }];
      state.service.is_active = 0;
      state.service.updated_by = updatedBy;
      state.service.deleted_at = '2026-08-09 11:00:00';
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected query: ${sql}`);
  };

  const connection = {
    async beginTransaction() {
      state.snapshot = { service: state.service ? structuredClone(state.service) : null, pivots: new Set(state.pivots), nextId: state.nextId };
    },
    async commit() { state.commits += 1; state.snapshot = null; },
    async rollback() {
      state.rollbacks += 1;
      if (state.snapshot) {
        state.service = state.snapshot.service;
        state.pivots = new Set(state.snapshot.pivots);
        state.nextId = state.snapshot.nextId;
        state.snapshot = null;
      }
    },
    release() {},
    query: execute,
  };

  return { state, connection, execute };
}

async function withServer(database, callback) {
  const originalGetConnection = pool.getConnection;
  const originalQuery = pool.query;
  pool.getConnection = async () => database.connection;
  pool.query = database.execute;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 9, role: req.headers['x-role'] || 'PDG' }; next(); });
  app.use('/api/services', publicServicesRouter);
  app.use('/api/admin/services', servicesRouter);
  app.use((_req, res) => res.status(404).json({ message: 'Not Found' }));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    pool.getConnection = originalGetConnection;
    pool.query = originalQuery;
  }
}

const servicePayload = {
  nom: 'Rénovation salle de bain',
  nom_ar: 'تجديد الحمام',
  description: 'Rénovation complète',
  description_ar: null,
  is_active: true,
  is_published: true,
  category_ids: [1],
};

test('le CRUD PDG crée plusieurs relations, conserve une relation inactive existante et la soft delete', async () => {
  const database = createDatabase();
  await withServer(database, async (baseUrl) => {
    database.state.categories.get(2).is_active = 1;
    let response = await fetch(`${baseUrl}/api/admin/services`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...servicePayload, category_ids: [1, 2] }),
    });
    assert.equal(response.status, 201);
    assert.deepEqual((await response.json()).categories.map(({ id }) => id).sort(), [1, 2]);
    database.state.categories.get(2).is_active = 0;

    response = await fetch(`${baseUrl}/api/admin/services/1`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...servicePayload, category_ids: [1, 2] }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).categories.find(({ id }) => id === 2).is_active, false);

    response = await fetch(`${baseUrl}/api/services/1`);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).categories.map(({ id }) => id), [1]);

    const pivotsBeforeDelete = new Set(database.state.pivots);
    response = await fetch(`${baseUrl}/api/admin/services/1`, { method: 'DELETE' });
    assert.equal(response.status, 204);
    assert.deepEqual(database.state.pivots, pivotsBeforeDelete);
    assert.equal((await fetch(`${baseUrl}/api/services/1`)).status, 404);
  });
});

test('refuse toute nouvelle association inactive et toute mutation non-PDG avant accès DB', async () => {
  const database = createDatabase();
  await withServer(database, async (baseUrl) => {
    let response = await fetch(`${baseUrl}/api/admin/services`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...servicePayload, category_ids: [2] }),
    });
    assert.equal(response.status, 400);
    assert.equal(database.state.service, null);

    const queriesBefore = database.state.queries.length;
    response = await fetch(`${baseUrl}/api/admin/services`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-role': 'Manager' },
      body: JSON.stringify(servicePayload),
    });
    assert.equal(response.status, 403);
    assert.equal(database.state.queries.length, queriesBefore);
    assert.equal((await fetch(`${baseUrl}/api/services`, { method: 'POST' })).status, 404);
  });
});

test('annule atomiquement la création si la synchronisation many-to-many échoue', async () => {
  const database = createDatabase();
  database.state.failPivotInsert = true;
  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/services`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(servicePayload),
    });
    assert.equal(response.status, 500);
  });
  assert.equal(database.state.service, null);
  assert.equal(database.state.pivots.size, 0);
  assert.equal(database.state.commits, 0);
  assert.ok(database.state.rollbacks >= 1);
});

test('rejette une fausse image malgré son MIME et nettoie le fichier temporaire', async () => {
  const database = createDatabase();
  const before = await listUploadedServiceFiles();
  await withServer(database, async (baseUrl) => {
    const form = new FormData();
    form.append('nom', servicePayload.nom);
    form.append('nom_ar', servicePayload.nom_ar);
    form.append('description', servicePayload.description);
    form.append('description_ar', '');
    form.append('is_active', 'true');
    form.append('category_ids', '[1]');
    form.append('remove_image', 'false');
    form.append('image', new Blob(['not-a-real-png'], { type: 'image/png' }), 'service.png');
    const response = await fetch(`${baseUrl}/api/admin/services`, { method: 'POST', body: form });
    assert.equal(response.status, 400);
    assert.match((await response.json()).message, /contenu réel/i);
  });
  assert.deepEqual(await listUploadedServiceFiles(), before);
  assert.equal(database.state.service, null);
});

test('refuse l\'activation sans catégorie disponible puis active atomiquement le service', async () => {
  const database = createDatabase();
  database.state.service = {
    id: 1, ...servicePayload, image_url: null, is_active: 0,
    created_at: '2026-08-09', updated_at: '2026-08-09', deleted_at: null,
  };
  database.state.pivots.add('1:2');
  await withServer(database, async (baseUrl) => {
    let response = await fetch(`${baseUrl}/api/admin/services/1/status`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ is_active: true }),
    });
    assert.equal(response.status, 409);
    assert.equal(database.state.service.is_active, 0);

    database.state.pivots.add('1:1');
    response = await fetch(`${baseUrl}/api/admin/services/1/status`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ is_active: true }),
    });
    assert.equal(response.status, 200);
    assert.equal(database.state.service.is_active, 1);
  });
  assert.equal(database.state.commits, 1);
});

test('la liste admin transmet les filtres de recherche, statut et catégorie au SQL', async () => {
  const database = createDatabase();
  database.state.service = { id: 1, ...servicePayload, image_url: null, is_active: 1, created_at: '2026-08-09', updated_at: '2026-08-09', deleted_at: null };
  database.state.pivots.add('1:1');
  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/services?q=fuite&status=active&category_id=1`);
    assert.equal(response.status, 200);
  });
  const listQuery = database.state.queries.find(({ sql }) => sql.includes('FROM services s'));
  assert.match(listQuery.sql, /s\.is_active = \?/);
  assert.match(listQuery.sql, /s\.nom LIKE \?/);
  assert.match(listQuery.sql, /filter_smc\.category_id = \?/);
  assert.deepEqual(listQuery.params, [1, '%fuite%', '%fuite%', '%fuite%', '%fuite%', 1]);
});
