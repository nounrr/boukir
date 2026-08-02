import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureAvailability,
  generateCaptureToken,
  hashCaptureToken,
  isValidCaptureToken,
} from './paymentPhoneCapture.js';

test('capture tokens are random, URL-safe, and only their hash is stable', () => {
  const first = generateCaptureToken();
  const second = generateCaptureToken();
  assert.equal(isValidCaptureToken(first), true);
  assert.notEqual(first, second);
  assert.match(hashCaptureToken(first), /^[a-f0-9]{64}$/);
  assert.equal(hashCaptureToken(first), hashCaptureToken(first));
  assert.notEqual(hashCaptureToken(first), first);
});

test('capture availability enforces expiry and single use', () => {
  const now = new Date('2026-08-02T12:00:00.000Z');
  assert.deepEqual(captureAvailability(null, now), { available: false, reason: 'not_found' });
  assert.deepEqual(captureAvailability({ status: 'pending', expires_at: '2026-08-02T12:01:00.000Z' }, now), { available: true, reason: 'pending' });
  assert.deepEqual(captureAvailability({ status: 'pending', expires_at: '2026-08-02T11:59:59.000Z' }, now), { available: false, reason: 'expired' });
  assert.deepEqual(captureAvailability({ status: 'uploaded', expires_at: '2026-08-02T12:01:00.000Z' }, now), { available: false, reason: 'used' });
  assert.deepEqual(captureAvailability({ status: 'cancelled', expires_at: '2026-08-02T12:01:00.000Z' }, now), { available: false, reason: 'cancelled' });
});

test('malformed or shortened tokens are rejected', () => {
  assert.equal(isValidCaptureToken('short'), false);
  assert.equal(isValidCaptureToken('a'.repeat(42)), false);
  assert.equal(isValidCaptureToken(`${'a'.repeat(42)}!`), false);
});
