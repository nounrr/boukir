import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBufferKind } from './uploadValidation.js';

test('détecte les formats de documents Maalem par leur signature réelle', () => {
  assert.equal(detectBufferKind(Buffer.from('%PDF-1.7 dossier')), 'pdf');
  assert.equal(detectBufferKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png');
  assert.equal(detectBufferKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'jpeg');
  assert.equal(detectBufferKind(Buffer.from('RIFF1234WEBPdata')), 'webp');
  assert.equal(detectBufferKind(Buffer.from('<script>alert(1)</script>')), null);
});
