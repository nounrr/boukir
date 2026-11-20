import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

import { EMBEDDING_DIMS, EMBEDDING_MODEL, analyzeImage, cleanObjects, cleanWords, embedImages, fromBlob, normalize, prepareImage, toBlob, topMatches } from './visualSearch.js';

test('vectors are normalised and survive the MySQL blob round trip', () => {
  const v = normalize([3, 4]);
  assert.ok(Math.abs(v[0] - 0.6) < 1e-6 && Math.abs(v[1] - 0.8) < 1e-6);
  const back = fromBlob(toBlob(v), 2);
  assert.deepEqual([...back], [...v]);
  assert.equal(fromBlob(Buffer.alloc(7), 2), null);
  assert.throws(() => normalize([0, 0]));
});

test('topMatches ranks by cosine similarity, best first, within the limit', () => {
  const dims = 2;
  const rows = [[1, 0], [0, 1], [0.8, 0.6], [-1, 0]].map((r) => normalize(r));
  const matrix = new Float32Array(rows.length * dims);
  rows.forEach((r, i) => matrix.set(r, i * dims));
  const ids = Int32Array.from([10, 20, 30, 40]);
  const best = topMatches(normalize([1, 0.1]), ids, matrix, dims, 2);
  assert.deepEqual(best.map((b) => b.id), [10, 30]);
  assert.ok(best[0].score > best[1].score);
  assert.equal(topMatches(normalize([1, 0]), ids, matrix, dims, 10, 0.5).length, 2);
});

test('embedImages sends the documented Gemini batch request and normalises the answer', async () => {
  let call;
  const fakeFetch = async (url, init) => {
    call = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ embeddings: [{ values: Array(EMBEDDING_DIMS).fill(2) }] }), { status: 200 });
  };
  const [vector] = await embedImages([Buffer.from('jpeg')], { key: 'test-key', fetchImpl: fakeFetch });
  assert.equal(call.url, `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`);
  assert.equal(call.init.headers['x-goog-api-key'], 'test-key');
  const request = call.body.requests[0];
  assert.equal(request.model, `models/${EMBEDDING_MODEL}`);
  assert.equal(request.output_dimensionality, EMBEDDING_DIMS);
  assert.deepEqual(request.content.parts[0].inline_data, { mime_type: 'image/jpeg', data: Buffer.from('jpeg').toString('base64') });
  assert.equal(vector.length, EMBEDDING_DIMS);
  assert.ok(Math.abs(vector.reduce((s, x) => s + x * x, 0) - 1) < 1e-4);
});

test('embedImages refuses without a key, over 6 images, and on a Gemini error', async () => {
  await assert.rejects(embedImages([Buffer.from('x')], { key: '' }), (e) => e.status === 503);
  await assert.rejects(embedImages(Array(7).fill(Buffer.from('x')), { key: 'k' }));
  const quota = async () => new Response('quota', { status: 429 });
  await assert.rejects(embedImages([Buffer.from('x')], { key: 'k', fetchImpl: quota }), (e) => e.status === 429);
});

test('prepareImage turns a transparent PNG into a white-background JPEG of at most 512 px', async () => {
  const png = await sharp({ create: { width: 1200, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  const jpeg = await prepareImage(png);
  const meta = await sharp(jpeg).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.equal(meta.width, 512);
  assert.equal(meta.height, 256);
});

test('photo + words: the image and the words go in ONE content (one combined embedding)', async () => {
  let body;
  const fakeFetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ embeddings: [{ values: Array(EMBEDDING_DIMS).fill(1) }] }), { status: 200 });
  };
  await embedImages([Buffer.from('jpeg')], { key: 'k', fetchImpl: fakeFetch, text: 'le même en rouge' });
  assert.equal(body.requests.length, 1);
  assert.deepEqual(body.requests[0].content.parts[1], { text: 'le même en rouge' });
});

test('cleanWords keeps letters, digits and measures, drops the rest, 100 characters at most', () => {
  assert.equal(cleanWords('  Disque 180 mm <script>  rouge!! '), 'Disque 180 mm script rouge');
  assert.equal(cleanWords('x'.repeat(300)).length, 100);
  assert.equal(cleanWords(undefined), '');
});

test('cleanObjects keeps valid 0-1000 boxes only, at most 6', () => {
  const objects = cleanObjects({ objects: [
    { box_2d: [100, 200, 600, 700], label: 'disque diamant', text: 'NORTON 180' },
    { box_2d: [10, 10, 15, 900], label: 'trop fin' },
    { box_2d: [1, 2, 3], label: 'incomplet' },
    { box_2d: [-50, 0, 1200, 500], label: 'hors cadre' },
    ...Array(8).fill({ box_2d: [0, 0, 500, 500], label: 'x' }),
  ] });
  assert.equal(objects.length, 6);
  assert.deepEqual(objects[0], { box: [100, 200, 600, 700], label: 'disque diamant', text: 'NORTON 180' });
  assert.deepEqual(objects[1].box, [0, 0, 1000, 500]);
  assert.deepEqual(cleanObjects(null), []);
});

test('analyzeImage calls generateContent with the image, the detection prompt and a JSON schema', async () => {
  let call;
  const answer = { objects: [{ box_2d: [50, 60, 900, 800], label: 'perceuse visseuse', text: 'INGCO' }] };
  const fakeFetch = async (url, init) => {
    call = { url, body: JSON.parse(init.body), headers: init.headers };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify(answer) + '\n```' }] } }] }), { status: 200 });
  };
  const objects = await analyzeImage(Buffer.from('jpeg'), { key: 'k', fetchImpl: fakeFetch, model: 'gemini-3.5-flash-lite' });
  assert.equal(call.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
  assert.equal(call.headers['x-goog-api-key'], 'k');
  const parts = call.body.contents[0].parts;
  assert.equal(parts[0].inline_data.mime_type, 'image/jpeg');
  assert.match(parts[1].text, /box_2d should be \[ymin, xmin, ymax, xmax\] normalized to 0-1000/);
  assert.equal(call.body.generationConfig.responseMimeType, 'application/json');
  assert.equal(call.body.generationConfig.responseJsonSchema.required[0], 'objects');
  assert.deepEqual(objects, [{ box: [50, 60, 900, 800], label: 'perceuse visseuse', text: 'INGCO' }]);
});

test('analyzeImage: no key → 503, unreadable answer → no object', async () => {
  await assert.rejects(analyzeImage(Buffer.from('x'), { key: '' }), (e) => e.status === 503);
  const garbage = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }), { status: 200 });
  assert.deepEqual(await analyzeImage(Buffer.from('x'), { key: 'k', fetchImpl: garbage }), []);
});
