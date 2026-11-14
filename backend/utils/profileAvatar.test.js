import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeProfileAvatar, avatarForProviderLogin, saveProfileAvatar } from './profileAvatar.js';

test('only durable image addresses are stored; device previews are rejected', () => {
  assert.equal(normalizeProfileAvatar('/uploads/avatars/customer.png'), '/uploads/avatars/customer.png');
  assert.equal(normalizeProfileAvatar('https://images.example.test/avatar.jpg'), 'https://images.example.test/avatar.jpg');
  for (const value of ['file:///phone/cache/avatar.jpg', 'content://picker/123', 'blob:https://shop.test/123', 'data:image/png;base64,AAA', 'javascript:alert(1)', '//other.test/image.jpg', '/uploads/../../private/file', {}, 'a'.repeat(256)]) {
    assert.throws(() => normalizeProfileAvatar(value), error => error.status === 400);
  }
  assert.equal(normalizeProfileAvatar(null), null);
  assert.equal(normalizeProfileAvatar(''), null);
  assert.equal(normalizeProfileAvatar(undefined), undefined);
});

test('Google and Facebook logins preserve the saved picture, including when no provider picture is returned', () => {
  for (const saved of ['/uploads/avatars/customer.png', 'https://images.example.test/custom.jpg']) {
    assert.equal(avatarForProviderLogin(saved, 'https://provider.test/new.jpg'), saved);
    assert.equal(avatarForProviderLogin(saved, null), saved);
  }
  assert.equal(avatarForProviderLogin(null, 'https://provider.test/new.jpg'), 'https://provider.test/new.jpg');
  assert.equal(avatarForProviderLogin('file:///phone/temporary.jpg', 'https://provider.test/new.jpg'), 'https://provider.test/new.jpg');
});

test('uploads are saved with a unique permanent server path and the actual image format', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'boukir-avatar-'));
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFUcAAAAASUVORK5CYII=', 'base64');
  const first = await saveProfileAvatar({ buffer: image, originalname: '../../avatar.html' }, 7, dir);
  const second = await saveProfileAvatar({ buffer: image }, 7, dir);
  try {
    assert.match(first.publicUrl, /^\/uploads\/avatars\/7-[a-f0-9-]+\.png$/);
    assert.notEqual(first.publicUrl, second.publicUrl);
    assert.deepEqual(await fs.readFile(first.absolutePath), image);
    await assert.rejects(saveProfileAvatar({buffer: Buffer.from('<svg><script/></svg>')}, 7, dir), /image JPEG, PNG ou WebP/);
  } finally {
    await fs.unlink(first.absolutePath); await fs.unlink(second.absolutePath); await fs.rmdir(dir);
  }
});
