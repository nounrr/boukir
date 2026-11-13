import assert from 'node:assert/strict';
import test from 'node:test';

import { accountRequestMessage, notifyCustomer, orderStatusMessage, remiseCreditedMessage, sendExpoPush } from './customerNotify.js';
import { isExpoPushToken } from './pushTokens.js';

test('only real Expo tokens are accepted', () => {
  assert.equal(isExpoPushToken('ExponentPushToken[abc123]'), true);
  assert.equal(isExpoPushToken('ExpoPushToken[abc123]'), true);
  assert.equal(isExpoPushToken('abc'), false);
  assert.equal(isExpoPushToken(null), false);
});

test('order messages follow the customer language and a delivery asks for the confirmation', () => {
  assert.deepEqual(orderStatusMessage({ number: 'ORD-1', status: 'shipped', locale: 'fr' }), { title: 'Votre commande avance', body: 'Commande ORD-1 : expédiée.' });
  assert.match(orderStatusMessage({ number: 'ORD-1', status: 'delivered', locale: 'fr' }).body, /Confirmez la réception/);
  assert.match(orderStatusMessage({ number: 'ORD-1', status: 'confirmed', locale: 'en-US' }).body, /confirmed/);
  assert.match(orderStatusMessage({ number: 'ORD-1', status: 'confirmed', locale: 'xx' }).body, /confirmée/);
});

test('remise and account-request messages', () => {
  assert.equal(remiseCreditedMessage({ amount: 12.5, total: 40, locale: 'fr' }).body, '+12,50 DH ajoutés à vos points gagnés. Total : 40,00 DH.');
  assert.equal(accountRequestMessage({ approved: true, role: 'Promoteur', locale: 'en' }).title, 'Account approved');
  assert.match(accountRequestMessage({ approved: false, role: 'Artisan', locale: 'fr' }).body, /Artisan/);
});

test('a notification goes live on the socket and to every phone of the customer, with the right channel', async () => {
  const emitted = [];
  const pushed = [];
  await notifyCustomer(
    7,
    { kind: 'remise', title: 'T', body: 'B', href: '/balance' },
    { emit: (...a) => emitted.push(a), tokensOf: async () => ['ExponentPushToken[a]', 'garbage', 'ExponentPushToken[b]'], send: async (m) => pushed.push(...m) }
  );
  assert.equal(emitted.length, 1);
  assert.deepEqual(emitted[0].slice(0, 2), [7, 'customer:notification']);
  assert.equal(pushed.length, 2);
  assert.equal(pushed[0].channelId, 'remise');
  assert.equal(pushed[0].data.href, '/balance');
});

test('a failing socket or push never throws', async () => {
  await notifyCustomer(7, { kind: 'order', title: 'T', body: 'B' }, { emit: () => { throw new Error('x'); }, tokensOf: async () => { throw new Error('db'); } });
  await notifyCustomer(null, { kind: 'order', title: 'T', body: 'B' });
});

test('dead devices are dropped after Expo reports them', async () => {
  const dead = [];
  const fetchImpl = async () => ({ json: async () => ({ data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }] }) });
  const { sent } = await sendExpoPush([{ to: 'ExponentPushToken[a]' }, { to: 'ExponentPushToken[b]' }], { fetchImpl, onDead: (t) => dead.push(t) });
  assert.equal(sent, 1);
  assert.deepEqual(dead, ['ExponentPushToken[b]']);
});
