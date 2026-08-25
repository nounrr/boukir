import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import pool from '../db/pool.js';
import maalemRouter, { adminServiceInterventionsRouter } from './serviceInterventions.js';

function databaseDouble() {
  const state = {
    status: 'to_do', progress: 0, requestStatus: 'to_do', assignedProfileId: 7, currentAssignmentId: 3,
    history: [], photos: [], enRouteAt: null, closedAt: null, commits: 0, rollbacks: 0,
  };
  const mission = () => ({
    id: 91, service_request_id: 51, status: state.status, planned_date: '2026-08-15',
    planned_time_slot: '09:00-11:00', mission_address: 'Adresse', mission_city: 'Casablanca',
    latitude: 33.5, longitude: -7.6, planned_service_id: 8, planned_category_id: 4,
    mission_contact_name: 'Client', mission_contact_phone: '0600000000', shared_instructions: 'Partagé',
    special_information: null, progress_percent: state.progress, work_summary: 'Travail fait',
    maalem_observations: null, work_finished: 1, additional_intervention_required: 0,
    incomplete_reason: null, request_number: 'SRV-2026-000051', current_assignment_id: state.currentAssignmentId,
    maalem_profile_id: state.assignedProfileId, service_name: 'Plomberie', category_name: 'Plombier',
    requester_contact_id: 501, client_phone: null, client_locale: 'fr',
    current_maalem_profile_id: state.assignedProfileId, current_maalem_contact_id: 70,
    current_maalem_phone: null, current_maalem_locale: 'fr',
    closure_internal_note: 'NE DOIT PAS SORTIR', current_maalem_name: 'Maalem Courant',
  });
  const connection = {
    async beginTransaction() {},
    async commit() { state.commits += 1; },
    async rollback() { state.rollbacks += 1; },
    release() {},
    async query(sql, params = []) {
      if (sql.includes('FROM employees')) return [[{ id: Number(params[0]), nom_complet: 'Manager Test' }]];
      if (sql.includes('FROM maalem_profiles mp') && sql.includes('mp.contact_id = ?')) {
        const contactId = Number(params[0]);
        return [[{ id: contactId === 70 ? 7 : 8, contact_id: contactId, status: 'approved', deleted_at: null,
          contact_deleted_at: null, is_active: 1, is_blocked: 0, nom_complet: contactId === 70 ? 'Maalem Courant' : 'Ancien Maalem' }]];
      }
      if (sql.includes('SELECT si.*') && sql.includes('current_maalem_name')) return [[mission()]];
      if (sql.includes('FROM service_interventions si') && sql.includes('sra.maalem_profile_id = ?')) {
        const { closure_internal_note: _privateNote, current_maalem_name: _adminName, ...safeMission } = mission();
        return Number(params[0]) === state.assignedProfileId && Number(params[1]) === 91 ? [[safeMission]] : [[]];
      }
      if (sql.includes('FROM service_intervention_photos')) return [[]];
      if (sql.includes('UPDATE service_interventions SET status = ?')) {
        state.status = params[0]; state.enRouteAt = params[1]; return [{ affectedRows: 1 }];
      }
      if (sql.includes("SET status = 'closed'")) {
        state.executingAssignmentId = Number(params[0]);
        state.status = 'closed';
        state.closedAt = params[1];
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("SET status = 'to_do'")) { state.status = 'to_do'; return [{ affectedRows: 1 }]; }
      if (sql.includes('SET progress_percent = ?')) { state.progress = Number(params[0]); return [{ affectedRows: 1 }]; }
      if (sql.includes('SET work_summary = ?')) {
        state.report = { work_summary: params[0], observations: params[1], progress: params[2], finished: params[3], additional: params[4], incomplete: params[5] };
        state.progress = Number(params[2]); return [{ affectedRows: 1 }];
      }
      if (sql.includes('INSERT INTO service_intervention_photos')) {
        state.photos.push({ storageKey: params[3], phase: params[2], contactId: params[7] });
        return [{ insertId: state.photos.length }];
      }
      if (sql.includes('UPDATE service_requests SET status = ?')) { state.requestStatus = params[0]; return [{ affectedRows: 1 }]; }
      if (sql.includes('INSERT INTO service_intervention_history')) { state.history.push({ event: params[1], oldStatus: params[2], newStatus: params[3] }); return [{ insertId: state.history.length }]; }
      if (sql.includes('INSERT INTO maalem_notification_deliveries')) return [{ insertId: 500 + state.history.length, affectedRows: 1 }];
      if (sql.includes('UPDATE maalem_review_invitations')) return [{ affectedRows: 0 }];
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  return { state, connection };
}

async function serverFor(database, user, callback) {
  const originalQuery = pool.query;
  const originalGetConnection = pool.getConnection;
  pool.query = database.connection.query.bind(database.connection);
  pool.getConnection = async () => database.connection;
  const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = user; next(); });
  app.use('/api/maalem-missions', maalemRouter);
  app.use('/api/admin/service-interventions', adminServiceInterventionsRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message, errors: error.errors }));
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  try { await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); pool.query = originalQuery; pool.getConnection = originalGetConnection; }
}

const jsonPost = (value) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
const jsonPatch = (value) => ({ ...jsonPost(value), method: 'PATCH' });

test('le Maalem courant voit une mission assainie, sans note interne', async () => {
  const db = databaseDouble();
  await serverFor(db, { id: 70, type_compte: 'Artisan/Promoteur' }, async (url) => {
    const response = await fetch(`${url}/api/maalem-missions/91`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.mission.shared_instructions, 'Partagé');
    assert.equal(Object.hasOwn(body.mission, 'closure_internal_note'), false);
  });
});

test('un ancien ou autre Maalem ne voit plus la mission', async () => {
  const db = databaseDouble();
  await serverFor(db, { id: 80, type_compte: 'Artisan/Promoteur' }, async (url) => {
    assert.equal((await fetch(`${url}/api/maalem-missions/91`)).status, 404);
  });
});

test('la transition Maalem est atomique et horodatée par le serveur', async () => {
  const db = databaseDouble();
  await serverFor(db, { id: 70, type_compte: 'Artisan/Promoteur' }, async (url) => {
    const response = await fetch(`${url}/api/maalem-missions/91/transition`, jsonPost({ status: 'en_route', en_route_at: '2000-01-01' }));
    assert.equal(response.status, 200);
  });
  assert.equal(db.state.status, 'en_route');
  assert.ok(db.state.enRouteAt instanceof Date);
  assert.notEqual(db.state.enRouteAt.toISOString().slice(0, 10), '2000-01-01');
  assert.deepEqual(db.state.history[0], { event: 'MaalemEnRoute', oldStatus: 'to_do', newStatus: 'en_route' });
  assert.equal(db.state.commits, 1);
});

test('une transition hors séquence est refusée et rollbackée', async () => {
  const db = databaseDouble();
  await serverFor(db, { id: 70, type_compte: 'Artisan/Promoteur' }, async (url) => {
    assert.equal((await fetch(`${url}/api/maalem-missions/91/transition`, jsonPost({ status: 'completed' }))).status, 409);
  });
  assert.equal(db.state.status, 'to_do');
  assert.equal(db.state.rollbacks, 1);
});

test('100% conserve le statut et completed reste distinct de closed', async () => {
  const db = databaseDouble();
  await serverFor(db, { id: 70, type_compte: 'Artisan/Promoteur' }, async (url) => {
    assert.equal((await fetch(`${url}/api/maalem-missions/91/progress`, jsonPatch({ progress_percent: 100 }))).status, 200);
    assert.equal((await fetch(`${url}/api/maalem-missions/91/transition`, jsonPost({ status: 'closed' }))).status, 409);
  });
  assert.equal(db.state.progress, 100);
  assert.equal(db.state.status, 'to_do');
});

test('seule l’équipe clôture une intervention completed', async () => {
  const db = databaseDouble(); db.state.status = 'completed'; db.state.requestStatus = 'completed';
  await serverFor(db, { id: 3, role: 'Manager', cin: 'TEST' }, async (url) => {
    const response = await fetch(`${url}/api/admin/service-interventions/91/transition`, jsonPost({ status: 'closed', closure_internal_note: 'Contrôlé' }));
    assert.equal(response.status, 200);
  });
  assert.equal(db.state.status, 'closed');
  assert.equal(db.state.requestStatus, 'closed');
  assert.ok(db.state.closedAt instanceof Date);
  assert.equal(db.state.executingAssignmentId, 3);
});

test('une réaffectation avant clôture crédite uniquement l’affectation finale', async () => {
  const db = databaseDouble();
  db.state.status = 'completed';
  db.state.requestStatus = 'completed';
  db.state.currentAssignmentId = 9;
  db.state.assignedProfileId = 8;
  await serverFor(db, { id: 3, role: 'Manager', cin: 'TEST' }, async (url) => {
    assert.equal((await fetch(`${url}/api/admin/service-interventions/91/transition`,
      jsonPost({ status: 'closed' }))).status, 200);
  });
  assert.equal(db.state.executingAssignmentId, 9);
});

test('une seconde clôture est refusée et ne peut pas doubler le crédit', async () => {
  const db = databaseDouble();
  db.state.status = 'completed';
  db.state.requestStatus = 'completed';
  await serverFor(db, { id: 3, role: 'Manager', cin: 'TEST' }, async (url) => {
    const endpoint = `${url}/api/admin/service-interventions/91/transition`;
    assert.equal((await fetch(endpoint, jsonPost({ status: 'closed' }))).status, 200);
    assert.equal((await fetch(endpoint, jsonPost({ status: 'closed' }))).status, 409);
  });
  assert.equal(db.state.executingAssignmentId, 3);
});

test('le compte-rendu et une photo typée sont enregistrés pour le Maalem courant', async () => {
  const db = databaseDouble(); db.state.status = 'work_in_progress'; db.state.requestStatus = 'work_in_progress';
  await serverFor(db, { id: 70, type_compte: 'Artisan/Promoteur' }, async (url) => {
    const report = await fetch(`${url}/api/maalem-missions/91/report`, jsonPatch({
      work_summary: 'Réparation terminée', maalem_observations: 'RAS', progress_percent: 100,
      work_finished: true, additional_intervention_required: false,
    }));
    assert.equal(report.status, 200);
    const form = new FormData(); form.append('phase', 'AFTER');
    form.append('photos', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' }), 'preuve.png');
    assert.equal((await fetch(`${url}/api/maalem-missions/91/photos`, { method: 'POST', body: form })).status, 201);
  });
  assert.equal(db.state.report.work_summary, 'Réparation terminée');
  assert.equal(db.state.photos[0].phase, 'AFTER');
  assert.equal(db.state.photos[0].contactId, 70);
  const createdPath = path.resolve('backend/private_uploads/service_interventions', db.state.photos[0].storageKey);
  await fs.unlink(createdPath);
});
