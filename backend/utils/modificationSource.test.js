import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRequestId } from './modificationSource.js';

test('source of client detail edits is retained in a server generated audit request id', () => {
  assert.equal(auditRequestId({ 'x-modification-source': 'client-detail', 'x-request-id': 'external' }, () => 'uuid'), 'client-detail:uuid');
  assert.equal(auditRequestId({ 'x-request-id': 'trace-123' }, () => 'uuid'), 'trace-123');
  assert.equal(auditRequestId({}, () => 'uuid'), 'uuid');
  assert.equal(auditRequestId({ 'x-request-id': 'client-detail:external' }, () => 'uuid'), 'uuid');
});
