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
    assert.equal(Object.hasOwn(body.maalem.statistics, 'average_rating'), false);
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
