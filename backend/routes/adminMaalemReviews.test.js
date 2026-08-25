import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pool from '../db/pool.js';
import adminMaalemReviewsRouter from './adminMaalemReviews.js';

const BASE_REVIEW = Object.freeze({
  id: 12, service_request_id: 44, request_number: 'SR-0044', customer_contact_id: 7,
  customer_name: 'Client Privé', maalem_profile_id: 9, maalem_name: 'Maalem Test',
  rating: 2, comment: 'Commentaire original strictement conservé.', has_comment: 1,
  status: 'published', city: 'Tanger', submitted_at: '2026-08-20 10:00:00',
  moderated_at: null, moderator_name: null, moderation_reason_code: null,
  moderation_reason: null, moderation_internal_note: null, moderation_version: 0,
  report_count: 0, created_at: '2026-08-20 10:00:00', updated_at: '2026-08-20 10:00:00',
});

async function withServer(options, callback) {
  const originalQuery = pool.query;
  const originalGetConnection = pool.getConnection;
  const state = {
    review: { ...BASE_REVIEW, ...(options.review || {}) }, history: [], commits: 0,
    rollbacks: 0, profileInvalidations: 0, reviewUpdates: [],
  };
  pool.query = async (sql) => {
    if (sql.includes('COUNT(*) AS total')) return [[{ total: 1 }]];
    if (sql.includes('SELECT mr.id') && sql.includes('ORDER BY mr.submitted_at')) return [[{ ...state.review }]];
    if (sql.includes('SELECT mr.*')) return [[{ ...state.review, customer_phone: '0600000000', customer_email: 'client@test.ma' }]];
    if (sql.includes('SELECT id FROM maalem_reviews')) return [[{ id: state.review.id }]];
    if (sql.includes('FROM maalem_review_history')) return [state.history];
    if (sql.includes('SELECT DISTINCT')) return [[]];
    throw new Error(`Requête pool inattendue: ${sql}`);
  };
  const connectionQuery = async (sql, params = []) => {
    if (sql.includes('FROM maalem_reviews') && sql.includes('FOR UPDATE')) return [[{ ...state.review }]];
    if (sql.includes('FROM employees')) return [[{ id: 3, nom_complet: 'Modérateur Test' }]];
    if (sql.includes('UPDATE maalem_reviews')) {
      assert.doesNotMatch(sql, /\brating\s*=/i);
      assert.doesNotMatch(sql, /\bcomment\s*=/i);
      state.reviewUpdates.push({ sql, params });
      state.review.status = params[0]; state.review.moderation_version += 1;
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO maalem_review_history')) { state.history.push({ params }); return [{ insertId: 91 }]; }
    if (sql.includes('UPDATE maalem_profiles')) { state.profileInvalidations += 1; return [{ affectedRows: 1 }]; }
    throw new Error(`Requête transaction inattendue: ${sql}`);
  };
  pool.getConnection = async () => ({
    query: connectionQuery, beginTransaction: async () => {},
    commit: async () => { state.commits += 1; }, rollback: async () => { state.rollbacks += 1; }, release() {},
  });
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.user = options.user; next(); });
  app.use('/api/admin/maalem-reviews', adminMaalemReviewsRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message, error_type: error.code }));
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  try { await callback(`http://127.0.0.1:${server.address().port}`, state); }
  finally {
    await new Promise((resolve) => server.close(resolve));
    pool.query = originalQuery; pool.getConnection = originalGetConnection;
  }
}

const VIEWER = { id: 2, role: 'Manager', acces_avis_maalem: 1 };
const MODERATOR = { ...VIEWER, moderation_avis_maalem: 1, details_prives_avis_maalem: 1 };

test('un employé autorisé consulte les avis et un employé non autorisé reçoit 403', async () => {
  await withServer({ user: VIEWER }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/maalem-reviews`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.reviews[0].reference, 'MR-000012');
    assert.equal(body.reviews[0].comment, null);
    assert.equal(body.reviews[0].customer_name, null);
  });
  await withServer({ user: { id: 5, role: 'Manager' } }, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/admin/maalem-reviews`)).status, 403);
  });
});

test('masquer et rejeter exigent un motif, OTHER exige une explication', async () => {
  await withServer({ user: MODERATOR }, async (baseUrl, state) => {
    for (const body of [
      { expected_status: 'published', expected_version: 0 },
      { expected_status: 'published', expected_version: 0, reason_code: 'OTHER' },
    ]) {
      const response = await fetch(`${baseUrl}/api/admin/maalem-reviews/12/hide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      assert.equal(response.status, 422);
    }
    assert.equal(state.commits, 0);
  });
});

test('une modération conserve note/commentaire, historise et invalide le profil', async () => {
  await withServer({ user: MODERATOR }, async (baseUrl, state) => {
    const original = { rating: state.review.rating, comment: state.review.comment };
    const response = await fetch(`${baseUrl}/api/admin/maalem-reviews/12/hide`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_status: 'published', expected_version: 0, reason_code: 'SPAM', internal_note: 'Vérifié par téléphone' }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual({ rating: state.review.rating, comment: state.review.comment }, original);
    assert.equal(state.history.length, 1);
    assert.equal(state.history[0].params[2], 2);
    assert.equal(state.history[0].params[3], 2);
    assert.equal(state.history[0].params[4], original.comment);
    assert.equal(state.history[0].params[5], original.comment);
    assert.equal(state.profileInvalidations, 1);
    assert.equal(state.commits, 1);
    assert.equal((await response.json()).cache_invalidated, true);
  });
});

test('un avis masqué peut être restauré avec review.restore', async () => {
  await withServer({ user: { ...VIEWER, restauration_avis_maalem: 1 }, review: { status: 'hidden', moderation_version: 3 } }, async (baseUrl, state) => {
    const response = await fetch(`${baseUrl}/api/admin/maalem-reviews/12/restore`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_status: 'hidden', expected_version: 3 }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).review.status, 'published');
    assert.equal(state.profileInvalidations, 1);
  });
});

test('une version concurrente obsolète reçoit 409 sans nouvel historique', async () => {
  await withServer({ user: MODERATOR, review: { moderation_version: 2 } }, async (baseUrl, state) => {
    const response = await fetch(`${baseUrl}/api/admin/maalem-reviews/12/reject`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_status: 'published', expected_version: 1, reason_code: 'SPAM' }),
    });
    assert.equal(response.status, 409);
    assert.equal(state.history.length, 0);
    assert.equal(state.commits, 0);
    assert.equal(state.rollbacks, 1);
  });
});

test('les détails et notes internes ne sont pas retournés sans permission privée', async () => {
  await withServer({ user: VIEWER }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/maalem-reviews/12`);
    assert.equal(response.status, 200);
    const payload = JSON.stringify(await response.json());
    assert.equal(payload.includes('Commentaire original'), false);
    assert.equal(payload.includes('moderation_internal_note'), false);
    assert.equal((await fetch(`${baseUrl}/api/admin/maalem-reviews/12/history`)).status, 403);
  });
});
