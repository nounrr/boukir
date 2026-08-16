import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pool from '../db/pool.js';
import { publicServicesRouter } from './services.js';

const serviceRow = {
  id: 7,
  nom: 'Réparation de fuite',
  nom_ar: 'إصلاح تسرب المياه',
  description: 'Intervention sur les fuites domestiques',
  description_ar: 'إصلاح تسربات المياه',
  image_url: '/uploads/services/fuite.webp',
  is_active: 1,
  is_published: 1,
  created_by: 99,
  updated_by: 99,
  created_at: '2026-08-12',
  updated_at: '2026-08-12',
  deleted_at: null,
};

function createDb({ total = 1, detailVisible = true } = {}) {
  const queries = [];
  const query = async (sql, params = []) => {
    queries.push({ sql, params });
    if (sql.includes('FROM maalem_profiles mp') && sql.includes('closed_interventions_for_service')) return [[{
      id: 12, public_name: 'Maalem Public', photo_url: null, category_id: 3,
      category_name: 'Plombier', category_name_ar: 'سباك', city: 'Rabat',
      intervention_areas: '["Rabat"]', closed_interventions_for_service: 4,
    }]];
    if (sql.includes('FROM maalem_profiles mp') && sql.includes('COUNT(*)')) return [[{ total_items: 1 }]];
    if (sql.includes('COUNT(*) AS total_items')) return [[{ total_items: total }]];
    if (sql.includes('FROM services s') && sql.includes('ORDER BY s.nom') && sql.includes('LIMIT ? OFFSET ?')) {
      return [total ? [{ ...serviceRow }] : []];
    }
    if (sql.includes('FROM services s') && sql.includes('LIMIT 1')) {
      return [detailVisible ? [{ ...serviceRow }] : []];
    }
    if (sql.includes('FROM service_maalem_categories smc') && sql.includes('WHERE smc.service_id IN')) {
      return [[{ service_id: 7, id: 3, nom: 'Plombier', nom_ar: 'سباك', description: 'privée', is_active: 1, deleted_at: null }]];
    }
    if (sql.includes('SELECT DISTINCT mc.id')) {
      return [[{ id: 3, nom: 'Plombier', nom_ar: 'سباك' }]];
    }
    if (sql.includes('SELECT s.id, s.updated_at FROM services s')) return [[{ id: 7, updated_at: '2026-08-12' }]];
    throw new Error(`Unexpected query: ${sql}`);
  };
  return { queries, query };
}

async function withServer(db, callback) {
  const original = pool.query;
  pool.query = db.query;
  const app = express();
  app.use('/api/services', publicServicesRouter);
  app.use((error, _req, res, _next) => res.status(500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    pool.query = original;
  }
}

test('la liste publique impose publication, activité, complétude, catégorie et soft-delete en SQL', async () => {
  const db = createDb();
  await withServer(db, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/services`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const payload = await response.json();
    assert.equal(payload.services[0].id, 7);
  });
  const sql = db.queries.find(({ sql }) => sql.includes('COUNT(*)')).sql;
  assert.match(sql, /s\.is_active = 1/);
  assert.match(sql, /s\.is_published = 1/);
  assert.match(sql, /s\.deleted_at IS NULL/);
  assert.match(sql, /TRIM\(s\.nom\) <> ''/);
  assert.match(sql, /TRIM\(s\.nom_ar\) <> ''/);
  assert.match(sql, /NULLIF\(TRIM\(s\.description\)/);
  assert.match(sql, /visible_mc\.is_active = 1/);
});

test('recherche FR/AR, filtre catégorie et pagination sont combinés et bornés', async () => {
  const db = createDb({ total: 13 });
  await withServer(db, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/services?q=تسرب&category_id=3&page=2&per_page=6`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.pagination, {
      current_page: 2, per_page: 6, total_items: 13, total_pages: 3,
      has_previous: true, has_next: true, from: 7, to: 7,
    });
    assert.deepEqual(payload.filters.categories, [{ id: 3, nom: 'Plombier', nom_ar: 'سباك' }]);
  });
  const list = db.queries.find(({ sql }) => sql.includes('LIMIT ? OFFSET ?'));
  assert.match(list.sql, /s\.nom LIKE \? OR s\.nom_ar LIKE \? OR s\.description LIKE \? OR s\.description_ar LIKE \?/);
  assert.match(list.sql, /filter_smc\.category_id = \?/);
  assert.deepEqual(list.params.slice(-3), [3, 6, 6]);

  const before = db.queries.length;
  await withServer(db, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/services?per_page=100`)).status, 400);
    assert.equal((await fetch(`${baseUrl}/api/services?category_id=-1`)).status, 400);
  });
  assert.equal(db.queries.length, before);
});

test('le DTO public est strict et le détail masque tout service non publié', async () => {
  const db = createDb();
  await withServer(db, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/services/7`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(Object.keys(payload).sort(), ['categories', 'description', 'description_ar', 'id', 'image_url', 'nom', 'nom_ar']);
    assert.deepEqual(payload.categories, [{ id: 3, nom: 'Plombier', nom_ar: 'سباك' }]);
    for (const privateField of ['is_active', 'is_published', 'created_by', 'updated_by', 'deleted_at', 'created_at']) {
      assert.equal(privateField in payload, false);
    }
  });
  const detailSql = db.queries.find(({ sql }) => sql.includes('LIMIT 1')).sql;
  assert.match(detailSql, /s\.is_published = 1/);

  const hiddenDb = createDb({ detailVisible: false });
  await withServer(hiddenDb, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/services/7`)).status, 404);
  });
});

test('les Maalems compatibles sont filtrés, paginés et exposés sans données privées', async () => {
  const db = createDb();
  await withServer(db, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/services/7/maalems?page=1&per_page=6`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.maalems[0].closed_interventions_for_service, 4);
    assert.deepEqual(payload.maalems[0].intervention_areas, ['Rabat']);
    for (const privateField of ['telephone', 'email', 'professional_data', 'status', 'documents']) {
      assert.equal(privateField in payload.maalems[0], false);
    }
  });
  const countSql = db.queries.find(({ sql }) => sql.includes('FROM maalem_profiles mp') && sql.includes('COUNT(*)')).sql;
  assert.match(countSql, /mp\.status = 'approved'/);
  assert.match(countSql, /c\.is_active = 1/);
  assert.match(countSql, /COALESCE\(c\.is_blocked, 0\) = 0/);
  const listSql = db.queries.find(({ sql }) => sql.includes('closed_interventions_for_service')).sql;
  assert.match(listSql, /si\.planned_service_id = \?/);
  assert.match(listSql, /si\.closed_by_employee_id IS NOT NULL/);
  assert.match(listSql, /ORDER BY closed_interventions_for_service DESC/);
});

test('le sitemap public ne retourne que les identifiants de services visibles', async () => {
  const db = createDb();
  await withServer(db, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/services/sitemap`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { services: [{ id: 7, updated_at: '2026-08-12' }] });
  });
  const sql = db.queries.find(({ sql }) => sql.includes('SELECT s.id, s.updated_at')).sql;
  assert.match(sql, /s\.is_active = 1/);
  assert.match(sql, /s\.is_published = 1/);
  assert.match(sql, /s\.deleted_at IS NULL/);
});
