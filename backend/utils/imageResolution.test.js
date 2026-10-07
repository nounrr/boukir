import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { filterImagesByResolution, matchesResolution, readImageResolution, resolutionOptions } from './imageResolution.js';

test('resolution boundaries use longest side and keep unknowns separate', () => {
  const below = resolutionOptions({ resolution: 'below' });
  assert.equal(matchesResolution({ width: 799, height: 500 }, below), true);
  assert.equal(matchesResolution({ width: 500, height: 800 }, below), false);
  assert.equal(matchesResolution({ width: 500, height: 800 }, { ...below, mode: 'above' }), true);
  assert.equal(matchesResolution(null, below), false);
  assert.equal(matchesResolution(null, { ...below, mode: 'unknown' }), true);
  assert.deepEqual(resolutionOptions({ resolution: 'invalid', resolution_px: -1 }), { mode: 'all', threshold: 800 });
  assert.equal(resolutionOptions({ resolution_px: '1200' }).threshold, 1200);
});

test('filter scans beyond the first page, preserving order and dimensions', async () => {
  const images = Array.from({ length: 40 }, (_, id) => ({ url: String(id) }));
  const result = await filterImagesByResolution(images, { mode: 'below', threshold: 800 }, async url => (
    { width: Number(url) < 24 ? 1200 : 600, height: 400 }
  ));
  assert.equal(result.length, 16);
  assert.equal(result.slice(0, 5)[0].url, '24');
  assert.deepEqual(result[0].dimensions, { width: 600, height: 400 });
});

test('local dimensions refresh when a file changes; missing and invalid files are unknown', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'image-resolution-'));
  const file = path.join(directory, 'photo.png');
  const pngHeader = (width, height) => {
    const buffer = Buffer.alloc(33);
    Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(buffer);
    buffer.writeUInt32BE(width, 16);
    buffer.writeUInt32BE(height, 20);
    return buffer;
  };
  try {
    await writeFile(file, pngHeader(600, 400));
    assert.deepEqual(await readImageResolution(file), { width: 600, height: 400 });
    await writeFile(file, Buffer.concat([pngHeader(1200, 900), Buffer.alloc(10)]));
    assert.deepEqual(await readImageResolution(file), { width: 1200, height: 900 });
    await writeFile(file, 'broken');
    assert.equal(await readImageResolution(file), null);
    assert.equal(await readImageResolution(path.join(directory, 'missing')), null);
    assert.equal(await readImageResolution(null), null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
