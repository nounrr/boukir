import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import pool from '../db/pool.js';
import serviceRequestsRouter from './serviceRequests.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testFilesRoot = path.resolve(__dirname, '..', 'private_uploads', 'service_requests');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const PDF = Buffer.from('%PDF-1.7\n%%EOF');

function createDatabaseDouble(options = {}) {
  const state = {
    sequence: options.sequence || 0,
    nextRequestId: options.nextRequestId || 990001,
    requests: [],
    attachments: [],
    notes: [],
    histories: [],
    maalemLoads: 0,
    commits: 0,
    rollbacks: 0,
    failAttachmentInsert: Boolean(options.failAttachmentInsert),
  };

  function makeConnection() {
    return {
      async beginTransaction() {},
      async commit() { state.commits += 1; },
      async rollback() { state.rollbacks += 1; },
      release() {},
      async query(sql, params = []) {
        if (sql.includes('FROM service_requests') && sql.includes('client_submission_id')) {
          const existing = state.requests.find((request) => request.client_submission_id === params[1]);
          return [[existing?.row].filter(Boolean)];
        }
        if (sql.includes('FROM contacts') && sql.includes('FOR UPDATE')) {
          return [[options.contact || {
            id: 42,
            nom_complet: 'Artisan Test',
            email: 'artisan@example.test',
            telephone: '0612345678',
            type_compte: 'Artisan/Promoteur',
            shipping_city: 'Tanger',
            shipping_address_line1: '10 rue Test',
            shipping_address_line2: null,
          }]];
        }
        if (sql.includes('FROM services')) {
          if (options.serviceMissing) return [[]];
          return [[{
            id: Number(params[0]),
            nom: 'Plomberie',
            nom_ar: 'سباكة',
            is_active: options.serviceActive === false ? 0 : 1,
            deleted_at: options.serviceDeleted ? '2026-08-09 10:00:00' : null,
            has_active_category: options.serviceCategoryActive === false ? 0 : 1,
          }]];
        }
        if (sql.includes('FROM maalem_profiles')) {
          state.maalemLoads += 1;
          if (options.maalemMissing) return [[]];
          const status = options.maalemStatus || 'approved';
          return [[{
            id: Number(params[0]), contact_id: 70, category_id: 3, status,
            nom_complet: 'Maalem Test', is_active: 1, is_blocked: 0,
          }]];
        }
        if (sql.includes('FROM maalem_categories')) {
          const active = options.categoryActive !== false;
          return [[active ? { id: Number(params[0]), nom: 'Plomberie', nom_ar: 'سباكة' } : null].filter(Boolean)];
        }
        if (sql.includes('UPDATE service_request_sequences')) {
          state.sequence += 1;
          return [{ affectedRows: 1 }];
        }
        if (sql.includes('SELECT LAST_INSERT_ID()')) return [[{ sequence_value: state.sequence }]];
        if (sql.includes('INSERT INTO service_requests')) {
          const requestId = state.nextRequestId++;
          const row = {
            id: requestId,
            request_number: params[0],
            requester_contact_id: params[1],
            request_source: params[2],
            service_id: params[3],
            requested_maalem_profile_id: params[4],
            qualified_category_id: params[5],
            problem_description: params[7],
            requester_phone: params[9],
            city: params[11],
            intervention_address: params[12],
            status: params[17],
            request_channel: params[18],
            client_submission_id: params[19],
          };
          state.requests.push({ id: requestId, params, row, client_submission_id: params[19] });
          return [{ insertId: requestId }];
        }
        if (sql.includes('INSERT INTO service_request_attachments')) {
          if (state.failAttachmentInsert) throw new Error('attachment insert failed');
          const id = state.attachments.length + 1;
          state.attachments.push({ id, params });
          return [{ insertId: id }];
        }
        if (sql.includes('INSERT INTO service_request_notes')) {
          state.notes.push(params);
          return [{ insertId: state.notes.length }];
        }
        if (sql.includes('INSERT INTO service_request_history')) {
          state.histories.push(params);
          return [{ insertId: state.histories.length }];
        }
        throw new Error(`Unexpected connection query: ${sql}`);
      },
    };
  }
  return { state, makeConnection };
}

async function withServer(database, callback, user = { id: 42, type_compte: 'Artisan/Promoteur' }) {
  const originalGetConnection = pool.getConnection;
  const originalQuery = pool.query;
  pool.getConnection = async () => database.makeConnection();
  pool.query = async (sql, params = []) => {
    if (sql.includes('FROM service_requests sr')) {
      if (database.ownedRequest === false) return [[]];
      return [[{
        id: Number(params[0]), request_number: 'SRV-000001', requester_contact_id: Number(params[1]),
        request_source: 'quick_request', service_id: null, requested_maalem_profile_id: null,
        qualified_category_id: null, status: 'new', request_channel: 'ECOMMERCE',
      }]];
    }
    if (sql.includes('FROM service_request_attachments')) return [[]];
    if (sql.includes("visibility = 'SHARED'")) {
      return [[{ id: 1, request_id: Number(params[0]), body: 'Instruction visible', actor_type: 'CONTACT', actor_name: 'Client' }]];
    }
    throw new Error(`Unexpected pool query: ${sql}`);
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use('/api/service-requests', serviceRequestsRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await callback(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    pool.getConnection = originalGetConnection;
    pool.query = originalQuery;
  }
}

function jsonPost(body) {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

function selectedMaalemPayload(overrides = {}) {
  return {
    requested_maalem_id: 9,
    problem_description: 'Fuite importante dans la cuisine',
    contact_phone: '0612345678',
    city: 'Tanger',
    address: '10 rue Test',
    client_submission_id: 'kan14_request_0001',
    ...overrides,
  };
}

function futureDate(days = 2) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function selectedServicePayload(overrides = {}) {
  return {
    service_id: 7,
    problem_description: 'Fuite importante sous l’évier de la cuisine',
    contact_phone: '0612345678',
    city: 'Tanger',
    address: '10 rue Test',
    desired_date: futureDate(),
    desired_time_slot: '09:00-12:00',
    client_submission_id: 'kan15_request_0001',
    ...overrides,
  };
}

test('selected_maalem accepte uniquement un Maalem approuvé', async () => {
  const approved = createDatabaseDouble({ maalemStatus: 'approved' });
  await withServer(approved, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/service-requests/selected-maalem`, jsonPost(selectedMaalemPayload()));
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.request.requested_maalem_id, 9);
    assert.equal(body.request.category_id, 3);
    assert.equal(body.request.status, 'new');
    assert.equal(approved.state.histories.length, 1);
  });

  const suspended = createDatabaseDouble({ maalemStatus: 'suspended' });
  await withServer(suspended, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/service-requests/selected-maalem`, jsonPost(selectedMaalemPayload()));
    assert.equal(response.status, 422);
    assert.equal(suspended.state.requests.length, 0);
  });
});

test('selected_maalem refuse draft, rejected, suspended et un profil absent ou supprimé', async () => {
  for (const maalemStatus of ['draft', 'rejected', 'suspended']) {
    const database = createDatabaseDouble({ maalemStatus });
    await withServer(database, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/service-requests/selected-maalem`, jsonPost(selectedMaalemPayload({
        client_submission_id: `kan14_${maalemStatus}_0001`,
      })));
      assert.equal(response.status, 422, maalemStatus);
      assert.equal(database.state.requests.length, 0, maalemStatus);
    });
  }

  const missing = createDatabaseDouble({ maalemMissing: true });
  await withServer(missing, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/service-requests/selected-maalem`, jsonPost(selectedMaalemPayload({
      client_submission_id: 'kan14_missing_0001',
    })));
    assert.equal(response.status, 422);
    assert.equal(missing.state.requests.length, 0);
  });
});

test('selected_maalem conserve le Maalem souhaité sans affectation et lie le demandeur JWT', async () => {
  const database = createDatabaseDouble();
  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/service-requests/selected-maalem`, jsonPost(selectedMaalemPayload({
      client_submission_id: 'kan14_owner_0001',
      requester_id: 999,
    })));
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.request.requester_contact_id, 42);
    assert.equal(body.request.requested_maalem_id, 9);
    assert.equal('assigned_maalem_id' in body.request, false);
    assert.equal(database.state.requests[0].params[1], 42);
    assert.equal(database.state.requests[0].params[4], 9);
  }, { id: 42, type_compte: 'Client' });
});

test('selected_maalem rejoue une double soumission sans créer un second dossier', async () => {
  const database = createDatabaseDouble();
  await withServer(database, async (baseUrl) => {
    const payload = jsonPost(selectedMaalemPayload({ client_submission_id: 'kan14_duplicate_0001' }));
    const first = await fetch(`${baseUrl}/api/service-requests/selected-maalem`, payload);
    const second = await fetch(`${baseUrl}/api/service-requests/selected-maalem`, payload);
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal((await second.json()).duplicate_submission, true);
    assert.equal(database.state.requests.length, 1);
    assert.equal(database.state.histories.length, 1);
  });
});

test('KAN-15 crée une demande pour un service actif sans Maalem, catégorie ni photo', async () => {
  const active = createDatabaseDouble();
  await withServer(active, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/service-requests/selected-service`, jsonPost(selectedServicePayload({
      request_source: 'selected_maalem',
      requested_maalem_id: 9,
      category_id: 3,
      requester_id: 999,
    })));
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.request.service_id, 7);
    assert.equal(body.request.requester_contact_id, 42);
    assert.equal(body.request.request_source, 'selected_service');
    assert.equal(body.request.requested_maalem_id, null);
    assert.equal(body.request.category_id, null);
    assert.equal(body.request.status, 'new');
    assert.match(body.request.request_number, /^SRV-\d{6,}$/);
    assert.deepEqual(body.attachments, []);
    assert.equal(active.state.requests[0].params[3], 7);
    assert.equal(active.state.requests[0].params[4], null);
    assert.equal(active.state.requests[0].params[5], null);
    assert.equal(active.state.histories.length, 1);
    assert.equal(active.state.maalemLoads, 0);
  });
});

test('KAN-15 annule la demande et nettoie les fichiers si un upload échoue partiellement', async () => {
  const database = createDatabaseDouble({ nextRequestId: 990115, failAttachmentInsert: true });
  const requestDir = path.join(testFilesRoot, '990115');
  await fs.rm(requestDir, { recursive: true, force: true });
  try {
    await withServer(database, async (baseUrl) => {
      const form = new FormData();
      const payload = selectedServicePayload({ client_submission_id: 'kan15_upload_failure_0001' });
      for (const [key, value] of Object.entries(payload)) form.set(key, String(value));
      form.append('attachments', new Blob([PNG]), 'probleme.png');
      const response = await fetch(`${baseUrl}/api/service-requests/selected-service`, { method: 'POST', body: form });
      assert.equal(response.status, 500);
      assert.equal(database.state.commits, 0);
      assert.equal(database.state.rollbacks, 1);
      assert.deepEqual(await fs.readdir(requestDir).catch(() => []), []);
    });
  } finally {
    await fs.rm(requestDir, { recursive: true, force: true });
  }
});

test('KAN-15 refuse séparément un service inactif, supprimé, inexistant ou sans catégorie disponible', async () => {
  const cases = [
    { options: { serviceActive: false }, errorType: 'SERVICE_INACTIVE' },
    { options: { serviceDeleted: true }, errorType: 'SERVICE_DELETED' },
    { options: { serviceMissing: true }, errorType: 'SERVICE_NOT_FOUND' },
    { options: { serviceCategoryActive: false }, errorType: 'SERVICE_UNAVAILABLE' },
  ];
  for (const { options, errorType } of cases) {
    const database = createDatabaseDouble(options);
    await withServer(database, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/service-requests/selected-service`, jsonPost(selectedServicePayload({
        client_submission_id: `kan15_${errorType.toLowerCase()}`,
      })));
      assert.equal(response.status, 422, errorType);
      assert.equal((await response.json()).error_type, errorType);
      assert.equal(database.state.requests.length, 0);
      assert.equal(database.state.rollbacks, 1);
    });
  }
});

test('KAN-15 rejoue une double soumission sans second SRV ni second historique', async () => {
  const database = createDatabaseDouble();
  await withServer(database, async (baseUrl) => {
    const payload = jsonPost(selectedServicePayload({ client_submission_id: 'kan15_duplicate_0001' }));
    const first = await fetch(`${baseUrl}/api/service-requests/selected-service`, payload);
    const second = await fetch(`${baseUrl}/api/service-requests/selected-service`, payload);
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    const firstBody = await first.json();
    const secondBody = await second.json();
    assert.equal(secondBody.duplicate_submission, true);
    assert.equal(secondBody.request.request_number, firstBody.request.request_number);
    assert.equal(database.state.requests.length, 1);
    assert.equal(database.state.histories.length, 1);
  });
});

test('le POST générique refuse selected_service avec un Maalem ou une catégorie', async () => {
  const database = createDatabaseDouble();
  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/service-requests`, jsonPost({
      request_source: 'selected_service',
      ...selectedServicePayload(),
      requested_maalem_id: 9,
      category_id: 3,
    }));
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.ok(body.errors.requested_maalem_id);
    assert.ok(body.errors.category_id);
    assert.equal(database.state.requests.length, 0);
    assert.equal(database.state.maalemLoads, 0);
  });
});

test('selected_service refuse un service inactif sur le POST générique', async () => {
  const inactive = createDatabaseDouble({ serviceActive: false });
  await withServer(inactive, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/service-requests`, jsonPost({
      request_source: 'selected_service',
      ...selectedServicePayload(),
    }));
    assert.equal(response.status, 422);
    assert.equal(inactive.state.rollbacks, 1);
  });
});

test('quick_request fonctionne sans service ni Maalem et impose new/ECOMMERCE', async () => {
  const database = createDatabaseDouble();
  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/service-requests`, jsonPost({
      request_source: 'quick_request', problem_description: 'Panne électrique intermittente',
    }));
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.request.service_id, null);
    assert.equal(body.request.requested_maalem_id, null);
    assert.equal(body.request.status, 'new');
    assert.equal(body.request.request_channel, 'ECOMMERCE');
  });
});

test('KAN-16 force la source et conserve service, Maalem et catégorie à null', async () => {
  const database = createDatabaseDouble();
  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/service-requests/quick`, jsonPost({
      request_source: 'selected_service',
      service_id: 7,
      requested_maalem_id: 9,
      category_id: 3,
      problem_description: 'Je ne sais pas quel professionnel appeler',
    }));
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.request.request_source, 'quick_request');
    assert.equal(body.request.service_id, null);
    assert.equal(body.request.requested_maalem_id, null);
    assert.equal(body.request.category_id, null);
    assert.match(body.request.request_number, /^SRV-\d{6,}$/);
    assert.equal(database.state.requests.length, 1);
    assert.equal(database.state.histories.length, 1);
  });
});

test('KAN-16 crée une demande minimale sans photo', async () => {
  const database = createDatabaseDouble();
  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/service-requests/quick`, jsonPost({
      problem_description: 'Robinet cassé',
    }));
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.deepEqual(body.attachments, []);
    assert.equal(body.request.requester_phone, '0612345678');
    assert.equal(body.request.city, 'Tanger');
  });
});

test('KAN-16 rejoue une double soumission sans créer un second dossier', async () => {
  const database = createDatabaseDouble();
  await withServer(database, async (baseUrl) => {
    const payload = jsonPost({
      problem_description: 'La même demande envoyée deux fois',
      client_submission_id: 'kan16_duplicate_0001',
    });
    const first = await fetch(`${baseUrl}/api/service-requests/quick`, payload);
    const second = await fetch(`${baseUrl}/api/service-requests/quick`, payload);
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    const firstBody = await first.json();
    const secondBody = await second.json();
    assert.equal(secondBody.duplicate_submission, true);
    assert.equal(secondBody.request.request_number, firstBody.request.request_number);
    assert.equal(database.state.requests.length, 1);
    assert.equal(database.state.histories.length, 1);
  });
});

test('KAN-16 accepte plusieurs photos valides sans rendre les photos obligatoires', async () => {
  const database = createDatabaseDouble({ nextRequestId: 990103 });
  const requestDir = path.join(testFilesRoot, '990103');
  await fs.rm(requestDir, { recursive: true, force: true });
  try {
    await withServer(database, async (baseUrl) => {
      const form = new FormData();
      form.set('problem_description', 'Deux angles du problème');
      form.append('attachments', new Blob([PNG]), 'face.png');
      form.append('attachments', new Blob([PNG]), 'cote.png');
      const response = await fetch(`${baseUrl}/api/service-requests/quick`, { method: 'POST', body: form });
      assert.equal(response.status, 201);
      const body = await response.json();
      assert.equal(body.attachments.length, 2);
      assert.ok(body.attachments.every((attachment) => attachment.kind === 'PHOTO'));
      assert.equal(database.state.commits, 1);
    });
  } finally {
    await fs.rm(requestDir, { recursive: true, force: true });
  }
});

test('KAN-16 refuse une création sans téléphone utilisable ou sans ville', async () => {
  const missingPhone = createDatabaseDouble({ contact: {
    id: 42, nom_complet: 'Client Test', email: 'client@example.test', telephone: null,
    type_compte: 'Client', shipping_city: 'Rabat', shipping_address_line1: null, shipping_address_line2: null,
  } });
  await withServer(missingPhone, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/service-requests/quick`, jsonPost({ problem_description: 'Besoin de diagnostic' }));
    assert.equal(response.status, 422);
    assert.equal(missingPhone.state.requests.length, 0);
    assert.equal(missingPhone.state.rollbacks, 1);
  });

  const missingCity = createDatabaseDouble({ contact: {
    id: 42, nom_complet: 'Client Test', email: 'client@example.test', telephone: '0612345678',
    type_compte: 'Client', shipping_city: null, shipping_address_line1: null, shipping_address_line2: null,
  } });
  await withServer(missingCity, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/service-requests/quick`, jsonPost({ problem_description: 'Besoin de diagnostic' }));
    assert.equal(response.status, 422);
    assert.equal(missingCity.state.requests.length, 0);
    assert.equal(missingCity.state.rollbacks, 1);
  });
});

test('un employé ou appel non e-commerce est refusé avant la base', async () => {
  const database = createDatabaseDouble();
  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/service-requests`, jsonPost({
      request_source: 'quick_request', problem_description: 'Test interdit',
    }));
    assert.equal(response.status, 403);
    assert.equal(database.state.requests.length, 0);
  }, { id: 2, role: 'PDG' });
});

test('une catégorie inactive est refusée sans création', async () => {
  const database = createDatabaseDouble({ categoryActive: false });
  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/service-requests`, jsonPost({
      request_source: 'selected_maalem',
      problem_description: 'Catégorie à contrôler',
      requested_maalem_id: 9,
      category_id: 3,
      client_submission_id: 'inactive_category_0001',
    }));
    assert.equal(response.status, 422);
    assert.equal(database.state.requests.length, 0);
    assert.equal(database.state.rollbacks, 1);
  });
});

test('une signature de fichier invalide est refusée avant la transaction', async () => {
  const database = createDatabaseDouble();
  await withServer(database, async (baseUrl) => {
    const form = new FormData();
    form.set('request_source', 'quick_request');
    form.set('problem_description', 'Fichier non fiable');
    form.append('attachments', new Blob([Buffer.from('not-an-image')], { type: 'image/png' }), 'fake.png');
    const response = await fetch(`${baseUrl}/api/service-requests`, { method: 'POST', body: form });
    assert.equal(response.status, 415);
    assert.equal(database.state.requests.length, 0);
    assert.equal(database.state.rollbacks, 0);
  });
});

test('une pièce jointe dépassant 8 Mo est refusée par multer', async () => {
  const database = createDatabaseDouble();
  await withServer(database, async (baseUrl) => {
    const form = new FormData();
    form.set('request_source', 'quick_request');
    form.set('problem_description', 'Fichier trop grand');
    form.append('attachments', new Blob([Buffer.alloc((8 * 1024 * 1024) + 1)]), 'large.pdf');
    const response = await fetch(`${baseUrl}/api/service-requests`, { method: 'POST', body: form });
    assert.equal(response.status, 413);
    assert.equal(database.state.requests.length, 0);
  });
});

test('plusieurs fichiers valides sont privés et enregistrés avec leur type réel', async () => {
  const database = createDatabaseDouble({ nextRequestId: 990101 });
  const requestDir = path.join(testFilesRoot, '990101');
  await fs.rm(requestDir, { recursive: true, force: true });
  try {
    await withServer(database, async (baseUrl) => {
      const form = new FormData();
      form.set('request_source', 'quick_request');
      form.set('problem_description', 'Photos et diagnostic joints');
      form.append('attachments', new Blob([PNG], { type: 'text/plain' }), 'photo.txt');
      form.append('attachments', new Blob([PDF], { type: 'image/png' }), 'document.png');
      const response = await fetch(`${baseUrl}/api/service-requests`, { method: 'POST', body: form });
      assert.equal(response.status, 201);
      const body = await response.json();
      assert.deepEqual(body.attachments.map((item) => item.kind), ['PHOTO', 'DOCUMENT']);
      assert.deepEqual(body.attachments.map((item) => item.mime_type), ['image/png', 'application/pdf']);
      assert.equal(database.state.attachments.length, 2);
      assert.ok(database.state.attachments.every((entry) => !String(entry.params[2]).includes('..')));
      assert.equal(database.state.commits, 1);
    });
  } finally {
    await fs.rm(requestDir, { recursive: true, force: true });
  }
});

test('un échec après écriture disque annule la transaction et nettoie le fichier', async () => {
  const database = createDatabaseDouble({ nextRequestId: 990102, failAttachmentInsert: true });
  const requestDir = path.join(testFilesRoot, '990102');
  await fs.rm(requestDir, { recursive: true, force: true });
  try {
    await withServer(database, async (baseUrl) => {
      const form = new FormData();
      form.set('request_source', 'quick_request');
      form.set('problem_description', 'La transaction doit échouer');
      form.append('attachments', new Blob([PNG]), 'photo.png');
      const response = await fetch(`${baseUrl}/api/service-requests/quick`, { method: 'POST', body: form });
      assert.equal(response.status, 500);
      assert.equal(database.state.commits, 0);
      assert.equal(database.state.rollbacks, 1);
      const files = await fs.readdir(requestDir).catch(() => []);
      assert.deepEqual(files, []);
    });
  } finally {
    await fs.rm(requestDir, { recursive: true, force: true });
  }
});

test('des créations concurrentes obtiennent des numéros uniques', async () => {
  const database = createDatabaseDouble({ sequence: 40, nextRequestId: 990201 });
  await withServer(database, async (baseUrl) => {
    const payload = jsonPost({ request_source: 'quick_request', problem_description: 'Demande simultanée' });
    const [first, second] = await Promise.all([
      fetch(`${baseUrl}/api/service-requests`, payload),
      fetch(`${baseUrl}/api/service-requests`, payload),
    ]);
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    const numbers = [(await first.json()).request.request_number, (await second.json()).request.request_number];
    assert.equal(new Set(numbers).size, 2);
    assert.deepEqual(numbers.sort(), ['SRV-000041', 'SRV-000042']);
  });
});

test('la lecture demandeur filtre les notes internes en SQL', async () => {
  const database = createDatabaseDouble();
  await withServer(database, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/service-requests/88`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.shared_notes.map((note) => note.body), ['Instruction visible']);
    assert.equal(JSON.stringify(body).includes('INTERNAL'), false);
    assert.equal('history' in body, false);
  });
});
