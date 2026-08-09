import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pool from '../db/pool.js';
import publicMaalemsRouter from './publicMaalems.js';

async function withServer(row, callback) {
  const originalQuery = pool.query;
  pool.query = async (sql, params) => {
    assert.match(sql, /FROM maalem_profiles/);
    assert.equal(sql.includes('telephone'), false);
    assert.equal(sql.includes('email'), false);
    assert.deepEqual(params, [9]);
    return [[row].filter(Boolean)];
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
    category_id: 3,
    category_name: 'Plomberie',
    category_name_ar: 'سباكة',
    nom_complet: 'Maalem Public',
    avatar_url: '/uploads/avatars/public.webp',
    professional_data: { city: 'Tanger', intervention_areas: ['Tanger'] },
    contact_is_active: 1,
    contact_is_blocked: 0,
    contact_deleted_at: null,
    deleted_at: null,
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/maalems/9`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.maalem.public_name, 'Maalem Public');
    assert.equal(JSON.stringify(body).includes('telephone'), false);
  });
});

test('GET /api/maalems/:id masque un profil non commandable derrière 404', async () => {
  await withServer({
    id: 9, status: 'rejected', category_id: 3, category_name: 'Plomberie',
    contact_is_active: 1, contact_is_blocked: 0, contact_deleted_at: null, deleted_at: null,
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/maalems/9`);
    assert.equal(response.status, 404);
  });
});
