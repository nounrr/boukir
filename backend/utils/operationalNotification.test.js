import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_NOTIFIABLE_INTERVENTION_STATUSES,
  OPERATIONAL_NOTIFICATION_EVENTS,
  enqueueOperationalNotifications,
  notifiableInterventionStatuses,
  renderOperationalNotification,
  scheduleHasMeaningfulChange,
  shouldNotifyOperationalPolicy,
} from './operationalNotification.js';

const context = {
  id: 51,
  request_number: 'SRV-2026-000051',
  requester_contact_id: 501,
  client_phone: null,
  client_locale: 'fr',
  service_name: 'Plomberie',
  service_name_ar: 'السباكة',
  current_maalem_profile_id: 7,
  current_maalem_contact_id: 70,
  current_maalem_phone: null,
  current_maalem_locale: 'ar',
  intervention_id: 91,
  planned_date: '2026-08-15',
  planned_time_slot: '09:00-11:00',
};

function deliveryConnection() {
  const rows = [];
  return {
    rows,
    async query(sql, params) {
      if (!sql.includes('INSERT INTO maalem_notification_deliveries')) throw new Error(`Unexpected query: ${sql}`);
      rows.push(params);
      return [{ insertId: rows.length, affectedRows: 1 }];
    },
  };
}

for (const event of Object.values(OPERATIONAL_NOTIFICATION_EVENTS)) {
  test(`le modèle ${event} existe en français et en arabe`, () => {
    const payload = {
      request_number: context.request_number,
      service_name: context.service_name,
      planned_date: context.planned_date,
      planned_time_slot: context.planned_time_slot,
      public_status: 'arrived',
    };
    const fr = renderOperationalNotification({ event, locale: 'fr', payload });
    const ar = renderOperationalNotification({ event, locale: 'ar', payload });
    assert.ok(fr.title.length > 3 && fr.body.includes(context.request_number));
    assert.ok(ar.title.length > 3 && ar.body.includes(context.request_number));
    assert.notEqual(fr.title, ar.title);
  });
}

test('la création cible le client dans la même outbox KAN-9', async () => {
  const connection = deliveryConnection();
  const deliveries = await enqueueOperationalNotifications(connection, {
    serviceRequestId: 51,
    event: OPERATIONAL_NOTIFICATION_EVENTS.CREATED,
    audiences: ['CLIENT'],
    context,
    versionKey: 'created:1',
  });
  assert.equal(deliveries.length, 1);
  assert.equal(connection.rows[0][1], 51);
  assert.equal(connection.rows[0][3], 501);
  assert.equal(connection.rows[0][9], 'IN_APP');
});

test('la confirmation et la clôture ciblent chacune le client', async () => {
  for (const event of [OPERATIONAL_NOTIFICATION_EVENTS.CONFIRMED, OPERATIONAL_NOTIFICATION_EVENTS.CLOSED]) {
    const connection = deliveryConnection();
    await enqueueOperationalNotifications(connection, {
      serviceRequestId: 51, event, audiences: ['CLIENT'], context, versionKey: `event:${event}`,
    });
    assert.equal(connection.rows.length, 1);
    assert.equal(connection.rows[0][3], 501);
  }
});

test('l’affectation cible uniquement le Maalem courant demandé', async () => {
  const connection = deliveryConnection();
  await enqueueOperationalNotifications(connection, {
    serviceRequestId: 51,
    event: OPERATIONAL_NOTIFICATION_EVENTS.ASSIGNED,
    audiences: ['CURRENT_MAALEM'], context, versionKey: 'assignment:8',
  });
  assert.equal(connection.rows.length, 1);
  assert.equal(connection.rows[0][0], 7);
  assert.equal(connection.rows[0][3], 70);
  assert.equal(connection.rows[0][10], 'ar');
});

test('la réaffectation produit deux destinataires distincts sans conserver l’ancien comme courant', async () => {
  const connection = deliveryConnection();
  await enqueueOperationalNotifications(connection, {
    serviceRequestId: 51,
    event: OPERATIONAL_NOTIFICATION_EVENTS.REASSIGNED,
    audiences: ['PREVIOUS_MAALEM', 'CURRENT_MAALEM'], context,
    previousMaalemProfileId: 6,
    previousMaalem: { profile_id: 6, contact_id: 60, telephone: null, locale: 'fr' },
    versionKey: 'assignment:9',
  });
  assert.deepEqual(connection.rows.map((row) => row[3]), [60, 70]);
  const payloads = connection.rows.map((row) => JSON.parse(row[13]));
  assert.deepEqual(payloads.map((payload) => payload.assignment_action), ['removed', 'assigned']);
});

test('après réaffectation, un événement suivant ne cible que le nouveau Maalem courant', async () => {
  const connection = deliveryConnection();
  await enqueueOperationalNotifications(connection, {
    serviceRequestId: 51,
    event: OPERATIONAL_NOTIFICATION_EVENTS.SCHEDULED,
    audiences: ['CURRENT_MAALEM'],
    context: { ...context, current_maalem_profile_id: 8, current_maalem_contact_id: 80 },
    versionKey: 'schedule:2',
  });
  assert.deepEqual(connection.rows.map((row) => row[3]), [80]);
  assert.ok(connection.rows.every((row) => row[3] !== 60));
});

test('la planification produit une livraison client et une livraison Maalem', async () => {
  const connection = deliveryConnection();
  await enqueueOperationalNotifications(connection, {
    serviceRequestId: 51,
    event: OPERATIONAL_NOTIFICATION_EVENTS.SCHEDULED,
    audiences: ['CLIENT', 'CURRENT_MAALEM'], context, versionKey: 'schedule:1',
  });
  assert.deepEqual(connection.rows.map((row) => row[3]), [501, 70]);
});

test('completed peut cibler la boîte Back-office interne', async () => {
  const connection = deliveryConnection();
  await enqueueOperationalNotifications(connection, {
    serviceRequestId: 51,
    event: OPERATIONAL_NOTIFICATION_EVENTS.COMPLETED,
    audiences: ['BACKOFFICE_TEAM'], context, versionKey: 'status:completed',
  });
  assert.equal(connection.rows[0][8], 'BACKOFFICE_TEAM');
  assert.equal(connection.rows[0][9], 'IN_APP');
});

test('la clé d’idempotence contient événement, audience, destinataire et version', async () => {
  const connection = deliveryConnection();
  await enqueueOperationalNotifications(connection, {
    serviceRequestId: 51,
    event: OPERATIONAL_NOTIFICATION_EVENTS.CONFIRMED,
    audiences: ['CLIENT'], context, versionKey: 'transition:42',
  });
  const key = connection.rows[0][14];
  assert.match(key, /srv:51:event:ServiceRequestConfirmed:audience:CLIENT:recipient:501:version:transition:42:IN_APP/);
});

test('les motifs internes ne sont jamais inclus dans le payload', async () => {
  const connection = deliveryConnection();
  await enqueueOperationalNotifications(connection, {
    serviceRequestId: 51,
    event: OPERATIONAL_NOTIFICATION_EVENTS.CANCELLED,
    audiences: ['CLIENT'], context,
    publicReason: 'Motif communiqué au client',
    internalReason: 'NOTE INTERNE CONFIDENTIELLE',
    versionKey: 'cancelled:1',
  });
  const serialized = connection.rows[0][13];
  assert.match(serialized, /Motif communiqué au client/);
  assert.doesNotMatch(serialized, /CONFIDENTIELLE/);
});

test('les statuts notifiables par défaut restent limités aux jalons utiles', () => {
  assert.deepEqual(notifiableInterventionStatuses({}), [...DEFAULT_NOTIFIABLE_INTERVENTION_STATUSES]);
  assert.deepEqual(notifiableInterventionStatuses({ SERVICE_NOTIFIABLE_INTERVENTION_STATUSES: 'arrived,work_in_progress,invalid' }), ['arrived', 'work_in_progress']);
});

test('les politiques optionnelles sont désactivées par défaut et strictement explicites', () => {
  assert.equal(shouldNotifyOperationalPolicy('FLAG', {}), false);
  assert.equal(shouldNotifyOperationalPolicy('FLAG', { FLAG: 'true' }), true);
  assert.equal(shouldNotifyOperationalPolicy('FLAG', { FLAG: '1' }), false);
});

test('un changement de date ou de créneau déclenche une replanification, pas une mise à jour identique', () => {
  const old = { planned_date: '2026-08-15', planned_time_slot: '09:00-11:00' };
  assert.equal(scheduleHasMeaningfulChange(old, old), false);
  assert.equal(scheduleHasMeaningfulChange(old, { ...old, planned_date: '2026-08-16' }), true);
  assert.equal(scheduleHasMeaningfulChange(old, { ...old, planned_time_slot: '14:00-16:00' }), true);
});

test('une outbox écrite dans une transaction disparaît avec son rollback métier', async () => {
  const durable = [];
  const pending = [];
  const connection = {
    async query(sql, params) {
      assert.match(sql, /INSERT INTO maalem_notification_deliveries/);
      pending.push(params);
      return [{ insertId: pending.length, affectedRows: 1 }];
    },
    async rollback() { pending.length = 0; },
    async commit() { durable.push(...pending.splice(0)); },
  };
  await enqueueOperationalNotifications(connection, {
    serviceRequestId: 51, event: OPERATIONAL_NOTIFICATION_EVENTS.CREATED,
    audiences: ['CLIENT'], context, versionKey: 'rollback:1',
  });
  await connection.rollback();
  assert.equal(durable.length, 0);
  assert.equal(pending.length, 0);
});
