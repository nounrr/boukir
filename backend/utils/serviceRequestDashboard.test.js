import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SERVICE_REQUEST_QUICK_VIEWS,
  buildServiceRequestDashboardFilters,
  dashboardMetricSelect,
  normalizeDashboardMetrics,
  overdueSql,
} from './serviceRequestDashboard.js';

test('la règle de retard est calculée et exclut les statuts terminaux', () => {
  const sql = overdueSql(120);
  assert.match(sql, /NOT IN \('completed', 'closed', 'cancelled'\)/);
  assert.match(sql, /si\.planned_date < CURDATE\(\)/);
  assert.match(sql, /INTERVAL 120 MINUTE/);
});

test('le créneau ne contribue au retard que pour un préfixe horaire fiable', () => {
  const sql = overdueSql();
  assert.match(sql, /planned_time_slot REGEXP/);
  assert.match(sql, /STR_TO_DATE\(LEFT\(si\.planned_time_slot, 5\)/);
});

test('le SLA invalide revient à 120 minutes', () => {
  assert.match(overdueSql(-1), /INTERVAL 120 MINUTE/);
});

test('plusieurs filtres sont combinés avec leurs paramètres dans le même ordre', () => {
  const result = buildServiceRequestDashboardFilters({
    status: 'processing', source: 'quick_request', service_id: '8', city: 'Rabat',
    created_from: '2026-08-01', planned_to: '2026-08-31', assigned: 'true', planned: 'false',
  });
  assert.match(result.where, /sr\.status = \?/);
  assert.match(result.where, /sr\.request_source = \?/);
  assert.match(result.where, /current_assignment_id IS NOT NULL/);
  assert.match(result.where, /si\.id IS NULL/);
  assert.deepEqual(result.params, ['processing', 'quick_request', 8, 'Rabat', '2026-08-01 00:00:00', '2026-08-31']);
});

test('la recherche rapide couvre SRV, client, téléphone et les deux Maalems', () => {
  const result = buildServiceRequestDashboardFilters({ q: 'amine' });
  for (const column of ['sr.request_number', 'requester.nom_complet', 'requester.telephone',
    'requested_maalem_contact.nom_complet', 'current_maalem_contact.nom_complet']) {
    assert.match(result.where, new RegExp(column.replaceAll('.', '\\.')));
  }
  assert.equal(result.params.length, 5);
});

test('la recherche par numéro SRV est conservée séparément', () => {
  const result = buildServiceRequestDashboardFilters({ request_number: 'SRV-42' });
  assert.match(result.where, /sr\.request_number LIKE \?/);
  assert.deepEqual(result.params, ['%SRV-42%']);
});

test('les bornes de création restent indexables sans DATE sur la colonne', () => {
  const result = buildServiceRequestDashboardFilters({ created_from: '2026-08-01', created_to: '2026-08-12' });
  assert.match(result.where, /sr\.created_at >= \?/);
  assert.match(result.where, /sr\.created_at < DATE_ADD\(\?, INTERVAL 1 DAY\)/);
  assert.doesNotMatch(result.where, /DATE\(sr\.created_at\)/);
});

test('le filtre retard oui et non réutilise exactement la règle centralisée', () => {
  assert.match(buildServiceRequestDashboardFilters({ overdue: 'true' }).where, /planned_date < CURDATE/);
  assert.match(buildServiceRequestDashboardFilters({ overdue: 'false' }).where, /NOT COALESCE/);
});

test('les six vues rapides ont toutes une traduction SQL', () => {
  assert.deepEqual(SERVICE_REQUEST_QUICK_VIEWS, ['to_process', 'today', 'overdue', 'in_progress', 'to_close', 'finished']);
  for (const quick_view of SERVICE_REQUEST_QUICK_VIEWS) {
    assert.ok(buildServiceRequestDashboardFilters({ quick_view }).clauses.length > 1, quick_view);
  }
});

test('à traiter inclut les confirmées sans affectation', () => {
  assert.match(buildServiceRequestDashboardFilters({ quick_view: 'to_process' }).where,
    /status = 'confirmed' AND sr\.current_assignment_id IS NULL/);
});

test('les agrégations KPI reposent sur les statuts existants et une seule sélection', () => {
  const sql = dashboardMetricSelect();
  for (const status of ['new', 'to_contact', 'processing', 'waiting_customer', 'assigned', 'completed', 'closed', 'cancelled']) {
    assert.match(sql, new RegExp(`'${status}'`));
  }
  assert.doesNotMatch(sql, /SELECT/);
});

test('la normalisation des KPI produit toujours douze nombres', () => {
  const metrics = normalizeDashboardMetrics({ new_requests: '3', overdue: null, closed: 2 });
  assert.equal(metrics.new_requests, 3);
  assert.equal(metrics.overdue, 0);
  assert.equal(metrics.closed, 2);
  assert.equal(Object.keys(metrics).length, 12);
});

