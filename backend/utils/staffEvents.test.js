import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { createStaffRealtime } from '../middleware/staffRealtime.js';
import { areaOf, MANAGEMENT, staffEventOf, staffEventText } from './staffEvents.js';
import { notifyStaff } from './staffNotify.js';

const pdg = { id: 1, role: 'PDG', cin: 'A1' };
const employee = { id: 7, role: 'Employé', cin: 'B2' };
const customer = { id: 7, type_compte: 'Client' };

test('each part of the API reloads its own part of the app', () => {
  assert.equal(areaOf('/api/sorties'), 'bons');
  assert.equal(areaOf('/api/comptant/12/statut'), 'bons');
  assert.equal(areaOf('/api/ecommerce/orders/4/status'), 'bons');
  assert.equal(areaOf('/api/payments/9'), 'payments');
  assert.equal(areaOf('/api/products/3'), 'stock');
  assert.equal(areaOf('/api/talons'), 'talons');
  assert.equal(areaOf('/api/old-talons-caisse/2'), 'talons');
  assert.equal(areaOf('/api/fond-caisse/days/2026-11-19'), 'till');
  assert.equal(areaOf('/api/employees/3/salaires'), 'team');
  assert.equal(areaOf('/api/notifications/artisan-requests/5/approve'), 'contacts');
  // The team's Maalem, service, depot, inventory and absence pages reload too.
  assert.equal(areaOf('/api/admin/maalem-profiles/4/status'), 'services');
  assert.equal(areaOf('/api/admin/services/2/publication'), 'services');
  assert.equal(areaOf('/api/admin/service-requests/9/transition'), 'services');
  assert.equal(areaOf('/api/admin/service-interventions/by-request/9/schedule'), 'services');
  assert.equal(areaOf('/api/stock-depot/transferts'), 'stock');
  assert.equal(areaOf('/api/inventory/snapshots'), 'stock');
  assert.equal(areaOf('/api/inventory-count/sessions'), 'stock');
  assert.equal(areaOf('/api/absences'), 'team');
  assert.equal(areaOf('/api/vehicules/3'), 'vehicles');
});

test('GPS pings, sign-in and reading never count as a change', () => {
  assert.equal(areaOf('/api/vehicule-positions/3'), null);
  assert.equal(areaOf('/api/staff/push-token'), null);
  assert.equal(areaOf('/api/auth/login'), null);
  assert.equal(areaOf('/api/users/auth/login'), null);
  assert.equal(areaOf('/api/productsX'), null);
});

test('a new bon is announced to the management with its number, amount and author', () => {
  const event = staffEventOf({ method: 'POST', path: '/api/sorties', body: { montant_total: 1250.5 }, response: { id: 40, numero: 'SOR40' }, user: employee, actorName: 'Karim' });
  assert.equal(event.kind, 'bon:new');
  assert.deepEqual(event.roles, MANAGEMENT);
  assert.equal(event.href, '/admin/bons/40?type=Sortie');
  assert.deepEqual(staffEventText(event, 'fr'), { title: 'Nouveau bon', body: 'Bon de sortie SOR40 · 1250,50 DH · par Karim' });
  assert.equal(staffEventText(event, 'en-US').title, 'New bon');
  assert.equal(staffEventText(event, 'xx').title, 'Nouveau bon');
});

test('a charge credit note is named as such and opens the list', () => {
  const event = staffEventOf({ method: 'POST', path: '/api/charges', query: { type: 'avoir' }, response: { id: 3, numero: 'AVC3', montant_total: 90 }, user: pdg });
  assert.deepEqual(event.parts, ['Avoir charge AVC3', '90,00 DH']);
  assert.equal(event.href, '/admin/bons');
});

test('a status change also reaches the person who created the bon', () => {
  const event = staffEventOf({ method: 'PATCH', path: '/api/comptant/12/statut', body: { statut: 'Validé' }, response: { data: { id: 12, statut: 'Validé' } }, user: pdg });
  assert.equal(event.kind, 'bon:status');
  assert.deepEqual(event.parts, ['Bon comptant #12', 'Validé']);
  assert.deepEqual(event.userIds, []);
  const withCreator = staffEventOf({ method: 'PATCH', path: '/api/sorties/5/statut', body: { statut: 'Annulé' }, response: { data: { numero: 'SOR5', created_by: 7 } }, user: pdg });
  assert.deepEqual(withCreator.userIds, [7]);
  assert.deepEqual(withCreator.parts, ['Bon de sortie SOR5', 'Annulé']);
});

test('payments: new, status and deletion', () => {
  const created = staffEventOf({ method: 'POST', path: '/api/payments', body: {}, response: { id: 8, montant_total: 300, mode_paiement: 'Chèque' }, user: employee });
  assert.deepEqual(created.parts, ['300,00 DH', 'Chèque']);
  assert.equal(created.href, '/admin/caisse');
  assert.equal(staffEventOf({ method: 'PATCH', path: '/api/payments/8/statut', body: { statut: 'Validé' }, response: { data: { statut: 'Validé', montant_total: 300 } }, user: pdg }).kind, 'payment:status');
  assert.equal(staffEventOf({ method: 'DELETE', path: '/api/payments/8', user: pdg }).kind, 'payment:deleted');
  assert.equal(staffEventOf({ method: 'PATCH', path: '/api/payments/reorder', body: {}, user: pdg }), null);
});

test('routine edits are not announced', () => {
  assert.equal(staffEventOf({ method: 'PUT', path: '/api/sorties/5', body: {}, user: pdg }), null);
  assert.equal(staffEventOf({ method: 'POST', path: '/api/products', body: {}, response: { id: 1 }, user: pdg }), null);
  assert.equal(staffEventOf({ method: 'POST', path: '/api/comptant/3/paiements', body: {}, user: pdg }), null);
  assert.equal(staffEventOf({ method: 'PATCH', path: '/api/sorties/5/statut', body: {}, response: {}, user: pdg }), null);
});

test('an online order and an account request come from customers, without an author', () => {
  const order = staffEventOf({ method: 'POST', path: '/api/ecommerce/orders', response: { order: { id: 77, order_number: 'ORD-77', total_amount: 499 } }, user: customer });
  assert.deepEqual(staffEventText(order, 'fr'), { title: 'Nouvelle commande en ligne', body: 'ORD-77 · 499,00 DH' });
  assert.equal(staffEventOf({ method: 'POST', path: '/api/ecommerce/orders', response: { cmi_payment: {} }, user: null }), null);
  const request = staffEventOf({ method: 'POST', path: '/api/users/auth/request-artisan', response: { user: { prenom: 'Sara', nom: 'Alami', demande_artisan: true } }, user: customer });
  assert.deepEqual(request.roles, ['PDG', 'ManagerPlus']);
  assert.deepEqual(staffEventText(request, 'fr'), { title: 'Nouvelle demande de compte', body: 'Sara Alami · À valider.' });
  assert.equal(staffEventOf({ method: 'POST', path: '/api/users/auth/register', body: { prenom: 'A' }, response: { user: { demande_artisan: false } } }), null);
  // A customer cancelling is news; the team cancelling its own order is not.
  assert.equal(staffEventOf({ method: 'POST', path: '/api/ecommerce/orders/4/cancel', user: customer }).kind, 'order:cancelled');
  assert.equal(staffEventOf({ method: 'POST', path: '/api/ecommerce/orders/4/cancel', user: pdg }), null);
});

test('notifyStaff: live event for open apps, push for the others, never to the author', async () => {
  const emitted = [];
  const asked = [];
  const pushed = [];
  const event = staffEventOf({ method: 'POST', path: '/api/sorties', body: { montant_total: 10 }, response: { id: 1, numero: 'SOR1' }, user: employee, actorName: 'Karim' });
  const result = await notifyStaff(event, { actorId: 7 }, {
    emit: (target, name, payload) => emitted.push({ target, name, payload }),
    tokensOf: async (target) => {
      asked.push(target);
      return [{ token: 'ExponentPushToken[aaa]', locale: 'ar' }, { token: 'not-a-token', locale: 'fr' }];
    },
    send: async (messages) => {
      pushed.push(...messages);
      return { sent: messages.length };
    },
  });
  assert.deepEqual(result, { sent: 1 });
  assert.equal(emitted[0].name, 'staff:notification');
  assert.equal(emitted[0].target.exceptId, 7);
  assert.equal(emitted[0].payload.text.fr.title, 'Nouveau bon');
  assert.equal(emitted[0].payload.href, '/admin/bons/1?type=Sortie');
  assert.equal(asked[0].exceptId, 7);
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].title, 'وصل جديد');
  assert.equal(pushed[0].channelId, 'team');
  assert.equal(pushed[0].data.href, '/admin/bons/1?type=Sortie');
});

test('notifyStaff never throws when the socket or the push service fails', async () => {
  const event = staffEventOf({ method: 'DELETE', path: '/api/sorties/5', user: pdg });
  const result = await notifyStaff(event, { actorId: 1 }, {
    emit: () => {
      throw new Error('socket down');
    },
    tokensOf: async () => {
      throw new Error('db down');
    },
  });
  assert.deepEqual(result, { sent: 0 });
  assert.deepEqual(await notifyStaff(null), { sent: 0 });
});

const run = async (middleware, { method, path, user, body, status = 200, answer }) => {
  const req = { method, path, user, body, query: {} };
  const res = new EventEmitter();
  res.statusCode = status;
  res.json = (value) => value;
  let passed = false;
  middleware(req, res, () => {
    passed = true;
  });
  // Express shortens the path while the route's own router runs: the middleware must not depend on it.
  req.path = '/' + path.split('/').slice(3).join('/');
  if (answer) res.json(answer);
  res.emit('finish');
  await new Promise((resolve) => setTimeout(resolve, 5));
  return passed;
};

test('middleware: a successful change signals its part and announces what matters', async () => {
  const changes = [];
  const notified = [];
  const middleware = createStaffRealtime({ emitChange: (c) => changes.push(c), notify: async (event, opts) => notified.push({ event, opts }), nameOf: async () => 'Karim' });

  assert.equal(await run(middleware, { method: 'POST', path: '/api/sorties', user: employee, body: { montant_total: 5 }, status: 201, answer: { id: 9, numero: 'SOR9' } }), true);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].area, 'bons');
  assert.equal(changes[0].actorId, 7);
  assert.equal(notified[0].event.actor, 'Karim');
  assert.equal(notified[0].opts.actorId, 7);

  // A product edit reloads the stock everywhere but is not a notification.
  await run(middleware, { method: 'PUT', path: '/api/products/3', user: pdg, body: {} });
  assert.equal(changes[1].area, 'stock');
  assert.equal(notified.length, 1);
});

test('middleware: nothing for a read, a refusal or a GPS ping; a customer is never taken for the author', async () => {
  const changes = [];
  const notified = [];
  const middleware = createStaffRealtime({ emitChange: (c) => changes.push(c), notify: async (event, opts) => notified.push({ event, opts }), nameOf: async () => 'X' });
  await run(middleware, { method: 'GET', path: '/api/sorties', user: pdg });
  await run(middleware, { method: 'POST', path: '/api/sorties', user: pdg, body: {}, status: 400, answer: { message: 'non' } });
  await run(middleware, { method: 'POST', path: '/api/vehicule-positions/3', user: employee, body: {}, status: 204 });
  assert.equal(changes.length, 0);
  assert.equal(notified.length, 0);

  await run(middleware, { method: 'POST', path: '/api/ecommerce/orders', user: customer, body: {}, status: 201, answer: { order: { id: 5, order_number: 'ORD-5', total_amount: 20 } } });
  assert.equal(changes[0].actorId, null);
  assert.equal(notified[0].opts.actorId, null);
  assert.equal(notified[0].event.actor, null);
});
