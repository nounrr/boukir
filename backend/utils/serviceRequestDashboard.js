import { SERVICE_REQUEST_STATUSES } from './serviceRequestBackoffice.js';

export const INITIAL_RESPONSE_SLA_MINUTES = (() => {
  const value = Number(process.env.SERVICE_REQUEST_INITIAL_RESPONSE_SLA_MINUTES || 120);
  return Number.isInteger(value) && value >= 15 && value <= 10080 ? value : 120;
})();

export const SERVICE_REQUEST_QUICK_VIEWS = Object.freeze([
  'to_process', 'today', 'overdue', 'in_progress', 'to_close', 'finished',
]);

export function overdueSql(slaMinutes = INITIAL_RESPONSE_SLA_MINUTES) {
  const safeSla = Number.isInteger(slaMinutes) && slaMinutes >= 15 && slaMinutes <= 10080 ? slaMinutes : 120;
  return `COALESCE((sr.status NOT IN ('completed', 'closed', 'cancelled') AND (
    si.planned_date < CURDATE()
    OR (
      si.planned_date = CURDATE()
      AND si.planned_time_slot REGEXP '^([01][0-9]|2[0-3]):[0-5][0-9]'
      AND STR_TO_DATE(LEFT(si.planned_time_slot, 5), '%H:%i') < CURTIME()
    )
    OR (sr.status = 'new' AND sr.created_at < DATE_SUB(NOW(), INTERVAL ${safeSla} MINUTE))
  )), 0)`;
}

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function date(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function text(value, max = 120) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized ? normalized.slice(0, max) : null;
}

function triState(value) {
  return value === 'true' || value === true ? true : value === 'false' || value === false ? false : null;
}

export function buildServiceRequestDashboardFilters(query = {}, { slaMinutes = INITIAL_RESPONSE_SLA_MINUTES } = {}) {
  const clauses = ['sr.deleted_at IS NULL'];
  const params = [];
  const addLike = (column, value) => {
    const normalized = text(value);
    if (normalized) { clauses.push(`${column} LIKE ?`); params.push(`%${normalized}%`); }
  };

  if (SERVICE_REQUEST_STATUSES.includes(query.status)) {
    clauses.push('sr.status = ?'); params.push(query.status);
  }
  if (['selected_maalem', 'selected_service', 'quick_request'].includes(query.source)) {
    clauses.push('sr.request_source = ?'); params.push(query.source);
  }
  if (['low', 'normal', 'high', 'urgent'].includes(query.priority)) {
    clauses.push('sr.priority = ?'); params.push(query.priority);
  }

  const idFilters = [
    ['service_id', 'COALESCE(sr.qualified_service_id, sr.service_id)'],
    ['category_id', 'COALESCE(si.planned_category_id, sr.qualified_category_id)'],
    ['requested_maalem_id', 'sr.requested_maalem_profile_id'],
    ['assigned_maalem_id', 'current_assignment.maalem_profile_id'],
    ['handled_by_employee_id', 'sr.handled_by_employee_id'],
  ];
  for (const [key, column] of idFilters) {
    const id = positiveId(query[key]);
    if (id) { clauses.push(`${column} = ?`); params.push(id); }
  }

  addLike('sr.request_number', query.request_number);
  addLike('requester.nom_complet', query.client);
  addLike('requester.telephone', query.phone);
  const q = text(query.q);
  if (q) {
    const pattern = `%${q}%`;
    clauses.push(`(sr.request_number LIKE ? OR requester.nom_complet LIKE ? OR requester.telephone LIKE ?
      OR requested_maalem_contact.nom_complet LIKE ? OR current_maalem_contact.nom_complet LIKE ?)`);
    params.push(pattern, pattern, pattern, pattern, pattern);
  }
  const city = text(query.city, 100);
  if (city) { clauses.push('sr.city = ?'); params.push(city); }

  const createdFrom = date(query.created_from || query.date_from);
  const createdTo = date(query.created_to || query.date_to);
  if (createdFrom) { clauses.push('sr.created_at >= ?'); params.push(`${createdFrom} 00:00:00`); }
  if (createdTo) { clauses.push('sr.created_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(`${createdTo} 00:00:00`); }
  const plannedDate = date(query.planned_date);
  const plannedFrom = date(query.planned_from);
  const plannedTo = date(query.planned_to);
  if (plannedDate) { clauses.push('si.planned_date = ?'); params.push(plannedDate); }
  if (plannedFrom) { clauses.push('si.planned_date >= ?'); params.push(plannedFrom); }
  if (plannedTo) { clauses.push('si.planned_date <= ?'); params.push(plannedTo); }

  const assigned = triState(query.assigned);
  if (assigned !== null) clauses.push(`sr.current_assignment_id IS ${assigned ? 'NOT ' : ''}NULL`);
  const planned = triState(query.planned);
  if (planned !== null) clauses.push(`si.id IS ${planned ? 'NOT ' : ''}NULL`);
  const overdue = triState(query.overdue);
  if (overdue !== null) clauses.push(overdue ? overdueSql(slaMinutes) : `NOT ${overdueSql(slaMinutes)}`);
  if (query.untreated === 'true') clauses.push("sr.status IN ('new', 'to_contact')");
  if (query.waiting_customer === 'true') clauses.push("sr.status = 'waiting_customer'");

  switch (query.quick_view) {
    case 'to_process':
      clauses.push(`(sr.status IN ('new', 'to_contact', 'processing', 'waiting_customer')
        OR (sr.status = 'confirmed' AND sr.current_assignment_id IS NULL))`); break;
    case 'today':
      clauses.push("si.planned_date = CURDATE() AND sr.status NOT IN ('closed', 'cancelled')"); break;
    case 'overdue': clauses.push(overdueSql(slaMinutes)); break;
    case 'in_progress': clauses.push("si.status IN ('en_route', 'arrived', 'work_in_progress')"); break;
    case 'to_close': clauses.push("si.status = 'completed'"); break;
    case 'finished': clauses.push("sr.status = 'closed'"); break;
    default: break;
  }

  return { clauses, params, where: clauses.join(' AND ') };
}

export function dashboardMetricSelect(slaMinutes = INITIAL_RESPONSE_SLA_MINUTES) {
  return `
    COUNT(*) AS total,
    SUM(sr.status = 'new') AS new_requests,
    SUM(sr.status = 'to_contact') AS to_contact,
    SUM(sr.status = 'processing') AS processing,
    SUM(sr.status = 'waiting_customer') AS waiting_customer,
    SUM(sr.status = 'confirmed' AND sr.current_assignment_id IS NULL) AS confirmed_without_maalem,
    SUM(sr.current_assignment_id IS NOT NULL AND si.id IS NULL AND sr.status = 'assigned') AS assigned_without_schedule,
    SUM(si.planned_date = CURDATE() AND sr.status NOT IN ('closed', 'cancelled')) AS scheduled_today,
    SUM(si.status IN ('en_route', 'arrived', 'work_in_progress')) AS in_progress,
    SUM(${overdueSql(slaMinutes)}) AS overdue,
    SUM(si.status = 'completed') AS completed_to_verify,
    SUM(sr.status = 'closed') AS closed,
    SUM(sr.status = 'cancelled') AS cancelled`;
}

export function normalizeDashboardMetrics(row = {}) {
  const keys = ['new_requests', 'to_contact', 'processing', 'waiting_customer',
    'confirmed_without_maalem', 'assigned_without_schedule', 'scheduled_today',
    'in_progress', 'overdue', 'completed_to_verify', 'closed', 'cancelled'];
  return Object.fromEntries(keys.map((key) => [key, Number(row[key] || 0)]));
}
