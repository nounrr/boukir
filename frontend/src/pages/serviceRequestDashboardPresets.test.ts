import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceRequestDashboardKpiFilters as filters } from './serviceRequestDashboardPresets.ts';

test('chaque carte KPI ouvre la liste avec le filtre serveur attendu', () => {
  assert.deepEqual(filters.new_requests, { status: 'new' });
  assert.deepEqual(filters.confirmed_without_maalem, { status: 'confirmed', assigned: false });
  assert.deepEqual(filters.assigned_without_schedule, { status: 'assigned', assigned: true, planned: false });
  assert.deepEqual(filters.scheduled_today, { quick_view: 'today' });
  assert.deepEqual(filters.in_progress, { quick_view: 'in_progress' });
  assert.deepEqual(filters.overdue, { quick_view: 'overdue' });
  assert.deepEqual(filters.completed_to_verify, { quick_view: 'to_close' });
  assert.deepEqual(filters.closed, { status: 'closed' });
  assert.equal(Object.keys(filters).length, 12);
});

