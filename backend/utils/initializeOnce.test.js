import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeOnce } from './initializeOnce.js';

test('concurrent product requests share initialization and later requests skip schema checks', async () => {
  let calls = 0;
  let finish;
  const initialize = initializeOnce(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const requests = Array.from({ length: 20 }, () => initialize());
  await Promise.resolve();
  assert.equal(calls, 1);
  finish('ready');
  assert.deepEqual(await Promise.all(requests), Array(20).fill('ready'));
  assert.equal(await initialize(), 'ready');
  assert.equal(calls, 1);
});

test('a failed schema initialization can be retried without duplicating concurrent work', async () => {
  let calls = 0;
  const initialize = initializeOnce(() => { calls++; if (calls === 1) throw new Error('DB unavailable'); return 'ready'; });
  const failed = await Promise.allSettled([initialize(), initialize()]);
  assert.ok(failed.every(result => result.status === 'rejected'));
  assert.equal(calls, 1);
  assert.equal(await initialize(), 'ready');
  assert.equal(calls, 2);
});
