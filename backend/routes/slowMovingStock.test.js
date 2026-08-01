import test from 'node:test';
import assert from 'node:assert/strict';
import { slowMovingStockRoleGuard } from './slowMovingStock.js';

function invokeGuard(role) {
  let statusCode = 200;
  let payload;
  let nextCalled = false;
  const req = { user: role ? { role } : {} };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      payload = body;
      return this;
    },
  };
  slowMovingStockRoleGuard(req, res, () => { nextCalled = true; });
  return { statusCode, payload, nextCalled };
}

test('a non-PDG authenticated user is rejected with 403 before route handlers', () => {
  const result = invokeGuard('Manager');
  assert.equal(result.statusCode, 403);
  assert.equal(result.nextCalled, false);
  assert.match(result.payload.message, /Rôle insuffisant/);
});

test('a PDG reaches the slow-moving-stock route handlers', () => {
  const result = invokeGuard('PDG');
  assert.equal(result.statusCode, 200);
  assert.equal(result.nextCalled, true);
});
