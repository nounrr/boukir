import test from 'node:test';
import assert from 'node:assert/strict';
import { isClientDetailPath } from './modificationSource.ts';

test('only a client detail page attributes its edits to the client detail history', () => {
  for (const path of ['/clients/12', '/clients/12/', '/clients-copy/12']) assert.equal(isClientDetailPath(path), true);
  for (const path of ['/clients', '/bons', '/bons/12', '/fournisseurs/12', '/clients/12/other']) assert.equal(isClientDetailPath(path), false);
});
