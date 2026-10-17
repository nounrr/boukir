import test from 'node:test';
import assert from 'node:assert/strict';
import { applyListScroll, readSnapshot } from './listScrollRestoration.ts';

test('restores the window and nested list scrollers, waiting until content is tall enough', () => {
  let height = 100;
  const viewport = { scrollX: 0, scrollY: 0, scrollTo(p: any) { this.scrollX = p.left; this.scrollY = Math.min(height, p.top); } };
  const element = () => ({ scrollLeft: 0, scrollTop: 0, scrollTo(p: any) { this.scrollLeft = p.left; this.scrollTop = p.top; } });
  const elements = { main: element(), container: element(), table: element() };
  const snapshot = { window: { left: 0, top: 1200 }, main: { left: 80, top: 300 }, container: { left: 150, top: 0 }, table: { left: 210, top: 0 } };
  assert.equal(applyListScroll(snapshot, elements, viewport), false);
  height = 2000;
  assert.equal(applyListScroll(snapshot, elements, viewport), true);
  assert.equal(viewport.scrollY, 1200);
  assert.equal(elements.main.scrollTop, 300);
  assert.equal(elements.container.scrollLeft, 150);
  assert.equal(elements.table.scrollLeft, 210);
});

test('saved positions remain available across repeated reads and list keys stay independent', () => {
  const values = new Map([['clients', '500'], ['charges', JSON.stringify({ window: { top: 900, left: 0 } })], ['broken', 'null']]);
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null } });
  assert.equal(readSnapshot('clients')?.window.top, 500);
  assert.equal(readSnapshot('clients')?.window.top, 500);
  assert.equal(readSnapshot('charges')?.window.top, 900);
  assert.equal(readSnapshot('fournisseurs'), null);
  assert.equal(readSnapshot('broken'), null);
  delete (globalThis as any).sessionStorage;
});
