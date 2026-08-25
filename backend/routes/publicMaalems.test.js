import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pool from '../db/pool.js';
import publicMaalemsRouter from './publicMaalems.js';

async function withServer(row, callback) {
  const originalQuery = pool.query;
  pool.query = async (sql, params) => {
    assert.equal(sql.includes('telephone'), false);
    assert.equal(sql.includes('email'), false);
    assert.deepEqual(params, [sql.includes('FROM services s') ? 3 : 9]);
    if (sql.includes('FROM maalem_profiles')) return [[row].filter(Boolean)];
    if (sql.includes('FROM services s') && sql.includes('service_maalem_categories')) return [[{
      id: 8, nom: 'Plomberie', nom_ar: 'سباكة', description: 'Dépannage public',
      description_ar: 'خدمة عامة', image_url: '/uploads/services/8.webp',
      category_id: 3, category_name: 'Plombier', category_name_ar: 'سباك',
      telephone: 'INTERDIT', internal_note: 'INTERDIT',
    }]];
    if (sql.includes('FROM maalem_reviews')) {
      assert.match(sql, /mr\.status = 'published'/);
      assert.match(sql, /mr\.hidden_at IS NULL/);
      assert.match(sql, /si\.executing_assignment_id/);
      return [[{
        review_count: 3,
        average_rating: '4.67',
        rating_1: 0,
        rating_2: 0,
        rating_3: 0,
        rating_4: 1,
        rating_5: 2,
      }]];
    }
    assert.match(sql, /service_interventions/);
    assert.match(sql, /executing_assignment_id/);
    assert.doesNotMatch(sql, /requester_contact_id|mission_address|closure_internal_note/);
    if (sql.includes('MAX(si.closed_at)')) {
      return [[{ closed_interventions: 2, last_closed_intervention_at: '2026-08-12 10:00:00' }]];
    }
    if (sql.includes('INNER JOIN services')) {
      return [[{ id: 8, service_name: 'Plomberie', closed_interventions: 2 }]];
    }
    return [[{ id: 3, category_name: 'Plombier', closed_interventions: 2 }]];
  };
  const app = express();
  app.use('/api/maalems', publicMaalemsRouter);
  app.use((error, _req, res, _next) => res.status(500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    pool.query = originalQuery;
  }
}

async function withQueryServer(query, callback) {
  const originalQuery = pool.query;
  pool.query = query;
  const app = express();
  app.use('/api/maalems', publicMaalemsRouter);
  app.use((error, _req, res, _next) => res.status(500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    pool.query = originalQuery;
  }
}

test('GET /api/maalems/:id expose uniquement le résumé public approuvé', async () => {
  await withServer({
    id: 9,
    status: 'approved',
    is_public: 1,
    category_id: 3,
    category_name: 'Plomberie',
    category_name_ar: 'سباكة',
    nom_complet: 'Maalem Public',
    avatar_url: '/uploads/avatars/public.webp',
    professional_data: { city: 'Tanger', intervention_areas: ['Tanger'], experiences: 'Dossier privé', other_information: 'Privé', availability: 'weekdays' },
    contact_is_active: 1,
    contact_is_blocked: 0,
    contact_deleted_at: null,
    deleted_at: null,
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/maalems/9`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.maalem.public_name, 'Maalem Public');
    assert.equal(body.maalem.statistics.closed_interventions, 2);
    assert.equal(body.maalem.compatible_services[0].nom, 'Plomberie');
    assert.deepEqual(Object.keys(body.maalem.compatible_services[0]).sort(), ['categories', 'description', 'description_ar', 'id', 'image_url', 'nom', 'nom_ar']);
    assert.equal(body.maalem.statistics.average_rating, 4.67);
    assert.equal(body.maalem.statistics.review_count, 3);
    assert.deepEqual(body.maalem.statistics.rating_distribution, { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 });
    assert.equal(JSON.stringify(body).includes('telephone'), false);
    assert.equal(JSON.stringify(body).includes('requester'), false);
    assert.equal(JSON.stringify(body).includes('address'), false);
    assert.equal(JSON.stringify(body).includes('Dossier privé'), false);
    assert.equal(JSON.stringify(body).includes('weekdays'), false);
    assert.equal(JSON.stringify(body).includes('INTERDIT'), false);
  });
});

test('GET /api/maalems/:id masque un profil non commandable derrière 404', async () => {
  await withServer({
    id: 9, status: 'rejected', is_public: 1, category_id: 3, category_name: 'Plomberie',
    contact_is_active: 1, contact_is_blocked: 0, contact_deleted_at: null, deleted_at: null,
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/maalems/9`);
    assert.equal(response.status, 404);
  });
});

test('GET /api/maalems/sitemap applique les gardes publiques et ne retourne que id/updated_at', async () => {
  const originalQuery = pool.query;
  pool.query = async (sql) => {
    assert.match(sql, /mp\.is_public = 1/);
    assert.match(sql, /mp\.status = 'approved'/);
    assert.match(sql, /c\.is_active = 1/);
    assert.match(sql, /mc\.is_active = 1/);
    return [[{ id: 9, updated_at: '2026-08-13 09:00:00', telephone: 'INTERDIT' }]];
  };
  const app = express(); app.use('/api/maalems', publicMaalemsRouter);
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/maalems/sitemap`);
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys((await response.json()).maalems[0]).sort(), ['id', 'updated_at']);
  } finally { await new Promise((resolve) => server.close(resolve)); pool.query = originalQuery; }
});

test('GET /api/maalems/:id/reviews expose une page anonymisée sans données métier privées', async () => {
  const queries = [];
  await withQueryServer(async (sql, params) => {
    queries.push({ sql, params });
    assert.equal(sql.includes('telephone'), false);
    assert.equal(sql.includes('email'), false);
    if (sql.includes('SELECT mp.id FROM maalem_profiles')) return [[{ id: 9 }]];
    if (sql.includes('COUNT(*) AS total')) return [[{ total: 2 }]];
    if (sql.includes('SELECT mr.rating')) return [[{
      rating: 4,
      comment: 'Très bon travail.',
      submitted_at: '2026-08-20 10:00:00',
      author_first_name: '',
      author_full_name: 'Nadia Confidentiel',
      requester_contact_id: 77,
    }]];
    throw new Error(`Requête inattendue: ${sql}`);
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/maalems/9/reviews?page=1&per_page=6`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const payload = await response.json();
    assert.deepEqual(payload.reviews, [{
      rating: 4,
      comment: 'Très bon travail.',
      submitted_at: '2026-08-20 10:00:00',
      author_name: 'N.',
      verified_intervention: true,
    }]);
    assert.equal(JSON.stringify(payload).includes('requester_contact_id'), false);
    assert.equal(JSON.stringify(payload).includes('Confidentiel'), false);
  });
  const reviewSql = queries.find(({ sql }) => sql.includes('SELECT mr.rating')).sql;
  assert.match(reviewSql, /mr\.status = 'published'/);
  assert.match(reviewSql, /sr\.status = 'closed'/);
  assert.match(reviewSql, /sr\.cancelled_at IS NULL/);
  assert.match(reviewSql, /sra\.id = si\.executing_assignment_id/);
});

test('GET /api/maalems applique le seuil de trois avis au filtre et au tri par note', async () => {
  const queries = [];
  await withQueryServer(async (sql, params = []) => {
    queries.push({ sql, params });
    if (sql.includes('COUNT(*) AS total_items')) return [[{ total_items: 1 }]];
    if (sql.includes('SELECT mp.id') && sql.includes('ORDER BY CASE WHEN review_count')) return [[{
      id: 9, status: 'approved', is_public: 1, category_id: 3,
      category_name: 'Plombier', category_name_ar: 'سباك', nom_complet: 'Maalem Public',
      professional_data: {}, contact_is_active: 1, contact_is_blocked: 0,
      contact_deleted_at: null, deleted_at: null, closed_interventions: 3,
      last_closed_intervention_at: null, review_count: 5, average_rating: '4.80',
    }]];
    if (sql.includes('FROM maalem_categories')) return [[]];
    if (sql.includes('FROM services s')) return [[]];
    throw new Error(`Requête inattendue: ${sql}`);
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/maalems?sort=rating_desc&min_rating=4`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.maalems[0].statistics.average_rating, 4.8);
    assert.equal(payload.maalems[0].statistics.review_count, 5);
    assert.equal(payload.filters.rating_sort_min_reviews, 3);
  });
  const countQuery = queries.find(({ sql }) => sql.includes('COUNT(*) AS total_items'));
  assert.match(countQuery.sql, /COALESCE\(review_stats\.review_count, 0\) >= 3/);
  assert.match(countQuery.sql, /review_stats\.average_rating >= \?/);
  assert.match(countQuery.sql, /mr\.status = 'published'/);
  assert.deepEqual(countQuery.params, [0, 0, 4]);
  const listQuery = queries.find(({ sql }) => sql.includes('ORDER BY CASE WHEN review_count'));
  assert.match(listQuery.sql, /CASE WHEN review_count >= 3 THEN average_rating END DESC/);
  assert.deepEqual(listQuery.params, [0, 0, 4, 12, 0]);
});
