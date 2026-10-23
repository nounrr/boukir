import test from 'node:test';
import assert from 'node:assert/strict';
import { distributeCheque } from './multiClientChequeAllocation.ts';

test('splits a partial cheque by client balances without losing cents', () => {
  assert.deepEqual(distributeCheque(10001, [10000, 20000, 30000]), [1667, 3334, 5000]);
});

test('never allocates more than the selected clients owe', () => {
  assert.deepEqual(distributeCheque(50000, [10000, 20000]), [10000, 20000]);
});
