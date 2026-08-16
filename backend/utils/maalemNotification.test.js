import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../db/pool.js';
import {
  MAALEM_NOTIFICATION_EVENTS,
  dispatchMaalemNotification,
  enqueueMaalemNotifications,
  normalizeMaalemNotificationLocale,
  normalizeNotificationRow,
  notificationEventForStatus,
  renderMaalemNotification,
  sanitizeNotificationError,
  shouldNotifyUnderReview,
} from './maalemNotification.js';

const basePayload = { candidate_name: 'Amal', category_name: 'Plomberie' };

test('la langue Maalem est limitée au français et à l’arabe', () => {
  assert.equal(normalizeMaalemNotificationLocale('ar-MA'), 'ar');
  assert.equal(normalizeMaalemNotificationLocale('fr-FR'), 'fr');
  assert.equal(normalizeMaalemNotificationLocale(null), 'fr');
});

test('les statuts métier produisent les événements KAN-9 attendus', () => {
  assert.equal(notificationEventForStatus('submitted'), MAALEM_NOTIFICATION_EVENTS.SUBMITTED);
  assert.equal(notificationEventForStatus('approved'), MAALEM_NOTIFICATION_EVENTS.APPROVED);
  assert.equal(notificationEventForStatus('rejected'), MAALEM_NOTIFICATION_EVENTS.REJECTED);
  assert.equal(notificationEventForStatus('suspended'), MAALEM_NOTIFICATION_EVENTS.SUSPENDED);
  assert.equal(notificationEventForStatus('draft'), null);
});

test('la notification under_review est désactivée par défaut et activable explicitement', () => {
  assert.equal(shouldNotifyUnderReview({}), false);
  assert.equal(notificationEventForStatus('under_review', {}), null);
  assert.equal(notificationEventForStatus('under_review', { MAALEM_NOTIFY_UNDER_REVIEW: 'true' }), MAALEM_NOTIFICATION_EVENTS.UNDER_REVIEW);
});

test('le template français de soumission confirme la réception sans annoncer une validation', () => {
  const message = renderMaalemNotification({ event: MAALEM_NOTIFICATION_EVENTS.SUBMITTED, locale: 'fr', payload: basePayload });
  assert.match(message.body, /bien été reçu/i);
  assert.match(message.body, /pas encore activées/i);
  assert.doesNotMatch(message.body, /profil Maalem a été accepté/i);
});

test('le template arabe d’approbation est réellement localisé', () => {
  const message = renderMaalemNotification({ event: MAALEM_NOTIFICATION_EVENTS.APPROVED, locale: 'ar', payload: basePayload });
  assert.equal(message.locale, 'ar');
  assert.match(message.title, /تم قبول/);
  assert.match(message.body, /المهني/);
});

test('un refus ne communique que le motif public', () => {
  const message = renderMaalemNotification({
    event: MAALEM_NOTIFICATION_EVENTS.REJECTED,
    locale: 'fr',
    payload: { ...basePayload, public_reason: 'Justificatif incomplet', internal_reason: 'Soupçon interne confidentiel' },
  });
  assert.match(message.body, /Justificatif incomplet/);
  assert.doesNotMatch(message.body, /Soupçon interne confidentiel/);
});

test('une suspension rappelle que le compte Artisan e-commerce reste actif', () => {
  const message = renderMaalemNotification({ event: MAALEM_NOTIFICATION_EVENTS.SUSPENDED, locale: 'fr', payload: basePayload });
  assert.match(message.body, /compte Artisan e-commerce reste actif/i);
});

test('l’invitation contient seulement un lien de choix de mot de passe fourni à l’envoi', () => {
  const activationUrl = 'https://example.test/activation#token=secret-runtime-only';
  const message = renderMaalemNotification({
    event: MAALEM_NOTIFICATION_EVENTS.ACCOUNT_CREATED_BY_TEAM,
    locale: 'fr',
    payload: basePayload,
    activationUrl,
  });
  assert.match(message.body, /choisissez votre mot de passe/i);
  assert.match(message.body, /secret-runtime-only/);
  assert.doesNotMatch(message.body, /mot de passe temporaire/i);
});

test('les erreurs prestataire sont nettoyées des URL et secrets avant journalisation', () => {
  const error = sanitizeNotificationError(new Error('échec https://provider.test/send?token=abc ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'));
  assert.doesNotMatch(error, /provider\.test|ABCDEFGHIJKLMNOPQRSTUVWXYZ/);
  assert.match(error, /\[url\]|\[secret\]/);
});

test('l’outbox interne est créée dans la transaction sans stocker de secret d’invitation', async () => {
  const oldBase = process.env.WHTSP_SERVICE_BASE_URL;
  const oldKey = process.env.WHTSP_SERVICE_API_KEY;
  delete process.env.WHTSP_SERVICE_BASE_URL;
  delete process.env.WHTSP_SERVICE_API_KEY;
  const inserts = [];
  const connection = { async query(sql, params) { inserts.push({ sql, params }); return [{ insertId: 91 }]; } };
  try {
    const deliveries = await enqueueMaalemNotifications(connection, {
      profileId: 7, contactId: 8, sourceHistoryId: 9,
      event: MAALEM_NOTIFICATION_EVENTS.ACCOUNT_CREATED_BY_TEAM,
      locale: 'fr', telephone: '0612345678', candidateName: 'Amal',
      activationUrl: 'https://must-not-be-persisted.test/token-secret',
    });
    assert.deepEqual(deliveries, [{ id: 91, channel: 'IN_APP', status: 'sent', duplicate: false }]);
    assert.doesNotMatch(JSON.stringify(inserts[0].params), /must-not-be-persisted|token-secret/);
  } finally {
    if (oldBase === undefined) delete process.env.WHTSP_SERVICE_BASE_URL; else process.env.WHTSP_SERVICE_BASE_URL = oldBase;
    if (oldKey === undefined) delete process.env.WHTSP_SERVICE_API_KEY; else process.env.WHTSP_SERVICE_API_KEY = oldKey;
  }
});

test('WhatsApp n’est ajouté que lorsque le prestataire est réellement configuré', async () => {
  const oldBase = process.env.WHTSP_SERVICE_BASE_URL;
  const oldKey = process.env.WHTSP_SERVICE_API_KEY;
  process.env.WHTSP_SERVICE_BASE_URL = 'http://whatsapp.test';
  process.env.WHTSP_SERVICE_API_KEY = 'configured-key';
  let nextId = 0;
  const connection = { async query() { nextId += 1; return [{ insertId: nextId }]; } };
  try {
    const deliveries = await enqueueMaalemNotifications(connection, {
      profileId: 7, contactId: 8, sourceHistoryId: 9,
      event: MAALEM_NOTIFICATION_EVENTS.APPROVED,
      locale: 'fr', telephone: '0612345678', candidateName: 'Amal',
    });
    assert.deepEqual(deliveries.map(({ channel, status }) => ({ channel, status })), [
      { channel: 'IN_APP', status: 'sent' },
      { channel: 'WHATSAPP', status: 'pending' },
    ]);
  } finally {
    if (oldBase === undefined) delete process.env.WHTSP_SERVICE_BASE_URL; else process.env.WHTSP_SERVICE_BASE_URL = oldBase;
    if (oldKey === undefined) delete process.env.WHTSP_SERVICE_API_KEY; else process.env.WHTSP_SERVICE_API_KEY = oldKey;
  }
});

test('une clé d’idempotence existante réutilise la livraison sans doublon', async () => {
  const connection = {
    async query(sql) {
      if (sql.includes('INSERT INTO maalem_notification_deliveries')) return [{ insertId: 55, affectedRows: 0 }];
      return [[{ id: 55, channel: 'IN_APP', status: 'sent' }]];
    },
  };
  const deliveries = await enqueueMaalemNotifications(connection, {
    profileId: 7, contactId: 8, sourceHistoryId: 9,
    event: MAALEM_NOTIFICATION_EVENTS.SUBMITTED, locale: 'fr', candidateName: 'Amal',
  });
  assert.deepEqual(deliveries, [{ id: 55, channel: 'IN_APP', status: 'sent', duplicate: true }]);
});

function whatsappDelivery(overrides = {}) {
  return {
    id: 81,
    profile_id: 7,
    contact_id: 8,
    notification_type: MAALEM_NOTIFICATION_EVENTS.APPROVED,
    channel: 'WHATSAPP',
    locale: 'fr',
    recipient_address: '+212612345678',
    payload: JSON.stringify(basePayload),
    status: 'pending',
    attempts: 0,
    last_attempt_at: null,
    ...overrides,
  };
}

async function withDispatchDatabase(delivery, callback) {
  const originalGetConnection = pool.getConnection;
  const originalQuery = pool.query;
  const updates = [];
  pool.getConnection = async () => ({
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async query(sql) {
      if (sql.includes('SELECT * FROM maalem_notification_deliveries')) return [[delivery]];
      updates.push(sql);
      return [{ affectedRows: 1 }];
    },
  });
  pool.query = async (sql, params) => { updates.push({ sql, params }); return [{ affectedRows: 1 }]; };
  try { await callback(updates); } finally { pool.getConnection = originalGetConnection; pool.query = originalQuery; }
}

test('un envoi prestataire réussi marque durablement la livraison comme envoyée', async () => {
  await withDispatchDatabase(whatsappDelivery(), async (updates) => {
    const result = await dispatchMaalemNotification(81, { sender: async () => ({ id: 'provider-1' }) });
    assert.equal(result.status, 'sent');
    const finalUpdate = updates.find((item) => typeof item === 'object' && item.sql.includes("status = 'sent'"));
    assert.deepEqual(finalUpdate.params, ['provider-1', 81]);
  });
});

test('un échec prestataire est journalisé sans propager l’erreur au workflow métier', async () => {
  await withDispatchDatabase(whatsappDelivery(), async (updates) => {
    const result = await dispatchMaalemNotification(81, {
      sender: async () => { throw new Error('provider https://secret.test/' + 'x'.repeat(40)); },
    });
    assert.equal(result.status, 'failed');
    assert.doesNotMatch(result.error, /secret\.test|x{40}/);
    assert.ok(updates.some((item) => typeof item === 'object' && item.sql.includes("status = 'failed'")));
  });
});

test('une livraison déjà envoyée n’est jamais renvoyée', async () => {
  await withDispatchDatabase(whatsappDelivery({ status: 'sent', sent_at: new Date() }), async () => {
    let called = false;
    const result = await dispatchMaalemNotification(81, { sender: async () => { called = true; } });
    assert.equal(result.skipped, true);
    assert.equal(called, false);
  });
});

test('la vue normalisée de l’historique ne reconstitue jamais un token d’invitation', () => {
  const row = normalizeNotificationRow({
    ...whatsappDelivery({ notification_type: MAALEM_NOTIFICATION_EVENTS.ACCOUNT_CREATED_BY_TEAM }),
    source_event: MAALEM_NOTIFICATION_EVENTS.ACCOUNT_CREATED_BY_TEAM,
    attempts: 1,
    created_at: '2026-08-12 12:00:00',
  });
  assert.doesNotMatch(row.body, /token=|mot de passe temporaire/i);
  assert.match(row.body, /lien sécurisé transmis/i);
});
