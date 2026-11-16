import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdvancedBonFilters } from './bonAdvancedFilters.js';

const cfg = { amountExpr: 'b.montant_total' };

test('aucun filtre : aucune condition', () => {
  assert.deepEqual(buildAdvancedBonFilters({}, cfg), { where: [], params: [] });
});

test('période et montant deviennent des conditions paramétrées', () => {
  const r = buildAdvancedBonFilters({ dateFrom: '2026-11-01', dateTo: '2026-11-15', amountMin: '100', amountMax: '2500,5' }, cfg);
  assert.deepEqual(r.where, [
    'COALESCE(b.date_creation, b.created_at) >= ?',
    'COALESCE(b.date_creation, b.created_at) < DATE_ADD(?, INTERVAL 1 DAY)',
    'COALESCE(b.montant_total, 0) >= ?',
    'COALESCE(b.montant_total, 0) <= ?',
  ]);
  assert.deepEqual(r.params, ['2026-11-01 00:00:00', '2026-11-15', 100, 2500.5]);
});

test('bornes inversées : remises dans l’ordre', () => {
  const r = buildAdvancedBonFilters({ dateFrom: '2026-12-01', dateTo: '2026-11-01', amountMin: '900', amountMax: '10' }, cfg);
  assert.deepEqual(r.params, ['2026-11-01 00:00:00', '2026-12-01', 10, 900]);
});

test('valeurs invalides ignorées, jamais injectées', () => {
  const r = buildAdvancedBonFilters({ dateFrom: "2026-02-30' OR 1=1 --", dateTo: 'hier', amountMin: '-5', amountMax: 'abc' }, cfg);
  assert.deepEqual(r, { where: [], params: [] });
});

test('expression de date propre au type (e-commerce)', () => {
  const r = buildAdvancedBonFilters({ dateFrom: '2026-01-01' }, { dateExpr: 'b.created_at', amountExpr: 'b.montant_total' });
  assert.deepEqual(r.where, ['b.created_at >= ?']);
});
