import test from 'node:test';
import assert from 'node:assert/strict';
import { queueEnhancementImages, enhancementImageTab } from './imageEnhancementQueue.js';

test('queues only existing eligible images, without duplicates or triggering AI', async () => {
  const queue = new Set(['existing']);
  const queries = [];
  const db = { query: async (sql, [url, userId]) => {
    queries.push({ sql, userId });
    const affectedRows = queue.has(url) ? 0 : 1;
    queue.add(url);
    return [{ affectedRows }];
  } };
  const state = { treatedByUrl: new Map([['treated', {}]]), pendingBySource: new Map([['busy', { status: 'processing' }], ['retry', { status: 'error' }]]) };
  const result = await queueEnhancementImages(db, ['new', 'new', 'existing', 'treated', 'busy', 'missing', 'retry'], new Set(['new', 'existing', 'treated', 'busy', 'retry']), state, 42);
  assert.deepEqual(result, { queued: 2, skipped: 4 });
  assert.deepEqual([...queue], ['existing', 'new', 'retry']);
  assert.equal(queries.length, 3);
  assert.ok(queries.every(query => query.sql.startsWith('INSERT IGNORE INTO product_image_enhancement_queue') && query.userId === 42));
});

test('transferred images leave untreated tab and treated images leave queue tab', () => {
  assert.equal(enhancementImageTab(false, false), 'untreated');
  assert.equal(enhancementImageTab(false, true), 'queued');
  assert.equal(enhancementImageTab(true, true), 'treated');
  assert.equal(enhancementImageTab(true, false), 'treated');
});
