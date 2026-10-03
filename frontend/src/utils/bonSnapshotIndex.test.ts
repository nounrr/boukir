import assert from 'node:assert/strict';
import test from 'node:test';
import { snapshotsForProductVariant } from './bonSnapshotIndex.ts';

test('isolates products and variants, preserves snapshot order and handles replacement results', () => {
  const rows = [
    { id: 1, variant_id: null, snapshot_id: 10 },
    { id: 1, variant_id: 2, snapshot_id: 11 },
    { id: 2, variant_id: null, snapshot_id: 12 },
    { id: 1, variant_id: null, snapshot_id: 13 },
    { id: 1, variant_id: null, snapshot_id: null },
  ];
  const base = snapshotsForProductVariant(rows, '1', undefined);
  assert.deepEqual(base.map(row => row.snapshot_id), [10, 13]);
  assert.strictEqual(snapshotsForProductVariant(rows, 1, null), base);
  assert.deepEqual(snapshotsForProductVariant(rows, 1, '2'), [rows[1]]);
  assert.deepEqual(snapshotsForProductVariant(rows, 3, null), []);
  assert.deepEqual(snapshotsForProductVariant([...rows, { id: 1, snapshot_id: 14 }], 1, null).map(row => row.snapshot_id), [10, 13, 14]);
});
