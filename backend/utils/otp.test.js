import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkCode,
  codeMessage,
  generateCode,
  hashCode,
  internationalPhone,
  maskEmail,
  maskPhone,
  MAX_ATTEMPTS,
  normalizePhone,
  phoneVariants,
  resetChannels,
  sendAllowed,
} from './otp.js';

test('reads a Moroccan number in any usual spelling', () => {
  for (const v of ['0612345678', '06 12 34 56 78', '+212612345678', '212 6 12 34 56 78', '00212612345678', '612345678', '06-12-34-56-78']) {
    assert.equal(normalizePhone(v), '0612345678', v);
  }
  assert.equal(normalizePhone('0812345678'), null);
  assert.equal(normalizePhone('AB123456'), null);
  assert.equal(normalizePhone('061234567'), null);
  assert.deepEqual(phoneVariants('06 12 34 56 78'), ['0612345678', '+212612345678', '212612345678', '00212612345678']);
  assert.equal(internationalPhone('0712345678'), '+212712345678');
});

test('masks addresses so they can be recognised, not read', () => {
  assert.equal(maskEmail('anas.boukir@gmail.com'), 'an••••••@gmail.com');
  assert.equal(maskEmail('a@b.ma'), 'a••@b.ma');
  assert.equal(maskPhone('+212612345678'), '06 •• •• •• 78');
});

test('a code is six digits and only its hash is checked', () => {
  const code = generateCode();
  assert.match(code, /^\d{6}$/);
  const request = { request_id: 'r1', code_hash: hashCode(code, 'r1', 's'), attempts: 0, expires_at: new Date(Date.now() + 60_000) };
  assert.deepEqual(checkCode(request, code, 's'), { ok: true });
  assert.deepEqual(checkCode(request, code.split('').join(' '), 's'), { ok: true });
  const wrong = code === '000000' ? '111111' : '000000';
  assert.equal(checkCode(request, wrong, 's').reason, 'WRONG');
  assert.equal(checkCode(request, wrong, 's').attempts_left, MAX_ATTEMPTS - 1);
  // The same code under another request or secret does not match.
  assert.equal(checkCode({ ...request, request_id: 'r2' }, code, 's').reason, 'WRONG');
  assert.equal(checkCode(request, code, 'other').reason, 'WRONG');
});

test('refuses used, expired and over-tried codes', () => {
  const base = { request_id: 'r', code_hash: hashCode('123456', 'r', 's'), attempts: 0, expires_at: new Date(Date.now() + 60_000) };
  assert.equal(checkCode(null, '123456', 's').reason, 'NOT_FOUND');
  assert.equal(checkCode({ ...base, consumed_at: new Date() }, '123456', 's').reason, 'USED');
  assert.equal(checkCode({ ...base, expires_at: new Date(Date.now() - 1) }, '123456', 's').reason, 'EXPIRED');
  assert.equal(checkCode({ ...base, attempts: MAX_ATTEMPTS }, '123456', 's').reason, 'TOO_MANY');
});

test('limits how often codes are sent', () => {
  const now = Date.parse('2026-11-19T10:00:00Z');
  assert.deepEqual(sendAllowed({ recent: [], now }), { ok: true });
  assert.deepEqual(sendAllowed({ recent: [now - 20_000], now }), { ok: false, retry_after: 40 });
  assert.deepEqual(sendAllowed({ recent: [now - 61_000], now }), { ok: true });
  const five = [1, 2, 3, 4, 5].map((m) => now - m * 600_000);
  assert.equal(sendAllowed({ recent: five, now }).ok, false);
  assert.equal(sendAllowed({ recent: [], fromIp: 20, now }).ok, false);
});

test('a password is reset only through a confirmed address', () => {
  const both = { email: 'a@b.ma', telephone: '0612345678', email_verified: 1, phone_verified: 1 };
  assert.deepEqual(resetChannels(both).map((c) => c.channel), ['email', 'phone']);
  assert.deepEqual(resetChannels({ ...both, phone_verified: 0 }).map((c) => c.channel), ['email']);
  assert.deepEqual(resetChannels({ ...both, email_verified: 0 }).map((c) => c.channel), ['phone']);
  assert.deepEqual(resetChannels({ ...both, email_verified: 0, phone_verified: 0 }), []);
  assert.deepEqual(resetChannels({ email: null, telephone: '0612345678', phone_verified: 1 }).map((c) => c.channel), ['phone']);
});

test('writes the message in the customer language, the code escaped', () => {
  const fr = codeMessage({ code: '123456', purpose: 'reset', locale: 'fr', name: 'Anas <b>' });
  assert.match(fr.subject, /^123456 /);
  assert.match(fr.sms, /choisir un nouveau mot de passe/);
  assert.match(fr.html, /1 2 3 4 5 6/);
  assert.match(fr.html, /Anas &lt;b&gt;/);
  const ar = codeMessage({ code: '123456', purpose: 'register', locale: 'ar' });
  assert.match(ar.html, /dir="rtl"/);
  assert.match(codeMessage({ code: '1', purpose: 'verify', locale: 'es' }).sms, /confirm this address/);
});
