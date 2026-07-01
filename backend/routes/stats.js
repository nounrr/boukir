import express from 'express';
import pool from '../db/pool.js';

const router = express.Router();

// Some DBs contain variants like 'Valide' or 'pending' (or extra spaces).
// Also, many workflows move documents to statuses like 'Livré' / 'Payé' / 'Facturé' / 'Appliqué'.
// Use a tolerant filter so stats don't return empty for real working days.
const VALID_STATUSES_LOWER = ['validé', 'valide', 'en attente', 'pending', 'livré', 'paye', 'payé', 'facturé', 'appliqué'];
const VALID_STATUSES_SQL = "('validé','valide','en attente','pending','livré','paye','payé','facturé','appliqué')";

// E-commerce order statuses are different from backoffice docs. We include all orders
// except cancelled/refunded for CA stats by default.
const ECOMMERCE_EXCLUDED_STATUSES_SQL = "('cancelled','refunded')";

// Keep string columns compatible across UNION queries when production tables use
// different utf8mb4 collations (for example utf8mb4_0900_ai_ci vs unicode_ci).
const UNION_COLLATION = 'utf8mb4_unicode_ci';

function unionText(expr) {
  return `(CONVERT(${expr} USING utf8mb4) COLLATE ${UNION_COLLATION})`;
}

function unionNullText() {
  return `(CAST(NULL AS CHAR CHARACTER SET utf8mb4) COLLATE ${UNION_COLLATION})`;
}

function unionCoalesce(...exprs) {
  return `COALESCE(${exprs.map((expr) => (expr === 'NULL' ? 'NULL' : unionText(expr))).join(', ')})`;
}

function normalizeFilterType(v) {
  const s = String(v ?? 'all').toLowerCase();
  if (s === 'all' || s === 'day' || s === 'period' || s === 'month') return s;
  return 'all';
}

function buildDateFilter({ filterType, date, startDate, endDate, month }, tableAlias, dateColumn = 'date_creation') {
  const params = [];
  let sql = '';

  const dateExpr = `DATE(${tableAlias}.${dateColumn})`;

  if (filterType === 'day') {
    if (!date) throw new Error('Missing "date" for day filter');
    sql += ` AND ${dateExpr} = ?`;
    params.push(date);
  } else if (filterType === 'period') {
    if (!startDate || !endDate) throw new Error('Missing "startDate" or "endDate" for period filter');
    sql += ` AND ${dateExpr} BETWEEN ? AND ?`;
    params.push(startDate, endDate);
  } else if (filterType === 'month') {
    if (!month) throw new Error('Missing "month" for month filter');
    sql += ` AND DATE_FORMAT(${tableAlias}.${dateColumn}, '%Y-%m') = ?`;
    params.push(month);
  }

  return { sql, params };
}

// Salaries are posted on the LAST DAY of their month. The matching filter must
// therefore reason on LAST_DAY(created_at) rather than the raw payment date.
function buildSalaireDateFilter({ filterType, date, startDate, endDate, month }, tableAlias, dateColumn = 'created_at') {
  const params = [];
  let sql = '';
  const lastDayExpr = `DATE(LAST_DAY(${tableAlias}.${dateColumn}))`;

  if (filterType === 'day') {
    if (!date) throw new Error('Missing "date" for day filter');
    // Only show the salary charge if the requested day is the last day of a month.
    sql += ` AND ${lastDayExpr} = ?`;
    params.push(date);
  } else if (filterType === 'period') {
    if (!startDate || !endDate) throw new Error('Missing "startDate" or "endDate" for period filter');
    sql += ` AND ${lastDayExpr} BETWEEN ? AND ?`;
    params.push(startDate, endDate);
  } else if (filterType === 'month') {
    if (!month) throw new Error('Missing "month" for month filter');
    sql += ` AND DATE_FORMAT(${tableAlias}.${dateColumn}, '%Y-%m') = ?`;
    params.push(month);
  }

  return { sql, params };
}

function rowsToMap(rows, keyField) {
  const map = new Map();
  for (const r of rows || []) {
    map.set(formatDayKey(r[keyField]), r);
  }
  return map;
}

function formatDayKey(v) {
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'string') {
    // MySQL DATE sometimes comes as 'YYYY-MM-DD' or 'YYYY-MM-DDT...'
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    return v;
  }
  if (v == null) return 'Unknown';
  return String(v);
}

function roundSafe(n) {
  const v = Number(n || 0);
  return Number.isFinite(v) ? v : 0;
}

function toDateOnly(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isWorkingDay(date) {
  return date.getDay() !== 0;
}

function countWorkingDays(start, end) {
  if (end < start) return 0;
  let count = 0;
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor <= last) {
    if (isWorkingDay(cursor)) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function computeEmployeeMonthlySalaryDue(emp, year, monthIndex) {
  const salaire = roundSafe(emp.salaire);
  if (salaire <= 0) return 0;

  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 0);
  const entry = toDateOnly(emp.date_embauche) || toDateOnly(emp.created_at);
  const exit = toDateOnly(emp.deleted_at);
  const effectiveStart = entry && entry > monthStart ? entry : monthStart;
  const effectiveEnd = exit && exit < monthEnd ? exit : monthEnd;
  const present = (!entry || entry <= monthEnd) && (!exit || exit >= monthStart);
  if (!present) return 0;

  const totalWorkingDays = countWorkingDays(monthStart, monthEnd);
  const workedDays = countWorkingDays(effectiveStart, effectiveEnd);
  if (totalWorkingDays <= 0 || workedDays <= 0) return 0;

  return Math.round((salaire / totalWorkingDays) * workedDays * 100) / 100;
}

function parseMonthKey(monthKey) {
  if (typeof monthKey !== 'string' || !/^\d{4}-\d{2}$/.test(monthKey)) return null;
  const [year, month] = monthKey.split('-').map(Number);
  return { year, monthIndex: month - 1 };
}

function monthKeyFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function lastDayKeyForMonth(year, monthIndex) {
  const d = new Date(year, monthIndex + 1, 0);
  return formatDayKey(d);
}

function isLastDayKey(dayKey) {
  const d = toDateOnly(`${dayKey}T00:00:00`);
  if (!d) return false;
  return d.getDate() === new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function addMonth(cursor) {
  cursor.setMonth(cursor.getMonth() + 1);
}

async function fetchEmployeesForSalaryStats() {
  try {
    const [rows] = await pool.query(
      'SELECT id, salaire, date_embauche, created_at, deleted_at FROM employees'
    );
    return rows || [];
  } catch (_err) {
    const [rows] = await pool.query(
      'SELECT id, salaire, date_embauche, created_at FROM employees'
    );
    return (rows || []).map((row) => ({ ...row, deleted_at: null }));
  }
}

function getSalaryMonthsForFilter(filterArgs, employees) {
  const { filterType, date, startDate, endDate, month } = filterArgs;
  const months = [];

  if (filterType === 'day') {
    const day = formatDayKey(date);
    if (isLastDayKey(day)) {
      const parsed = toDateOnly(`${day}T00:00:00`);
      months.push(monthKeyFromDate(parsed));
    }
    return months;
  }

  if (filterType === 'month') {
    if (parseMonthKey(month)) months.push(month);
    return months;
  }

  let start;
  let end;
  if (filterType === 'period') {
    start = toDateOnly(`${startDate}T00:00:00`);
    end = toDateOnly(`${endDate}T00:00:00`);
  } else {
    const now = new Date();
    end = new Date(now.getFullYear(), now.getMonth(), 1);
    start = employees.reduce((earliest, emp) => {
      const entry = toDateOnly(emp.date_embauche) || toDateOnly(emp.created_at);
      if (!entry) return earliest;
      const monthStart = new Date(entry.getFullYear(), entry.getMonth(), 1);
      return !earliest || monthStart < earliest ? monthStart : earliest;
    }, null) || end;
  }

  if (!start || !end) return months;
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  let guard = 0;
  while (cursor <= endMonth && guard < 600) {
    const lastDayKey = lastDayKeyForMonth(cursor.getFullYear(), cursor.getMonth());
    if (filterType !== 'period' || (lastDayKey >= formatDayKey(start) && lastDayKey <= formatDayKey(end))) {
      months.push(monthKeyFromDate(cursor));
    }
    addMonth(cursor);
    guard += 1;
  }

  return months;
}

async function getMonthlySalaryDueRows(filterArgs) {
  const employees = await fetchEmployeesForSalaryStats();
  const months = getSalaryMonthsForFilter(filterArgs, employees);
  return months
    .map((monthKey) => {
      const parsed = parseMonthKey(monthKey);
      if (!parsed) return null;
      const total = employees.reduce(
        (sum, emp) => sum + computeEmployeeMonthlySalaryDue(emp, parsed.year, parsed.monthIndex),
        0
      );
      return {
        day: lastDayKeyForMonth(parsed.year, parsed.monthIndex),
        total: Math.round(total * 100) / 100,
      };
    })
    .filter((row) => row && roundSafe(row.total) > 0);
}

function parseBoolQuery(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function getStatsDetailSign(type) {
  switch (type) {
    case 'Sortie':
    case 'Comptant':
    case 'Ecommerce':
      return 1;
    case 'Charge':
      return -1;
    case 'Avoir':
    case 'AvoirComptant':
    case 'AvoirEcommerce':
    case 'AvoirFournisseur':
    case 'AvoirCharge':
    case 'Commande':
      return 1;
    default:
      return 1;
  }
}

function getStatsDetailProfitSign(type) {
  switch (type) {
    case 'Sortie':
    case 'Comptant':
    case 'Ecommerce':
      return 1;
    case 'Avoir':
    case 'AvoirComptant':
    case 'AvoirEcommerce':
    case 'AvoirFournisseur':
      return -1;
    case 'Charge':
      return -1;
    case 'AvoirCharge':
      return 1;
    case 'Commande':
      return 0;
    default:
      return 1;
  }
}

router.get('/dashboard-summary', async (_req, res) => {
  try {
    const [
      [[employeesRow]],
      [[productsRow]],
      [[lowStockRow]],
      [[ordersRow]],
      [[pendingOrdersRow]],
      [[talonDueSoonRow]],
      [recentBons],
      [recentPayments],
      [criticalProducts],
      [[overdueTalonsRow]],
    ] = await Promise.all([
      pool.query("SELECT COUNT(*) AS total FROM employees WHERE deleted_at IS NULL"),
      pool.query("SELECT COUNT(*) AS total FROM products WHERE COALESCE(is_deleted, 0) = 0"),
      pool.query("SELECT COUNT(*) AS total FROM products WHERE COALESCE(is_deleted, 0) = 0 AND COALESCE(quantite, 0) <= 5"),
      pool.query(`
        SELECT SUM(total) AS total
        FROM (
          SELECT COUNT(*) AS total
          FROM bons_sortie
          WHERE DATE(date_creation) = CURDATE() AND statut IN ('En attente', 'Validé')
          UNION ALL
          SELECT COUNT(*) AS total
          FROM bons_comptant
          WHERE DATE(date_creation) = CURDATE() AND statut IN ('En attente', 'Validé')
        ) x
      `),
      pool.query(`
        SELECT SUM(total) AS total
        FROM (
          SELECT COUNT(*) AS total
          FROM bons_sortie
          WHERE statut IN ('Brouillon', 'En attente', 'En cours')
          UNION ALL
          SELECT COUNT(*) AS total
          FROM bons_commande
          WHERE statut IN ('Brouillon', 'En attente', 'En cours')
        ) x
      `),
      pool.query(`
        SELECT COUNT(*) AS total
        FROM payments
        WHERE talon_id IS NOT NULL
          AND date_echeance IS NOT NULL
          AND DATEDIFF(DATE(date_echeance), CURDATE()) <= 5
      `),
      pool.query(`
        SELECT *
        FROM (
          SELECT 'Sortie' AS type, id, CONCAT('SOR', LPAD(id, 2, '0')) AS numero, date_creation, montant_total, statut
          FROM bons_sortie
          WHERE date_creation >= DATE_SUB(NOW(), INTERVAL 1 DAY)
          UNION ALL
          SELECT 'Comptant' AS type, id, CONCAT('COM', LPAD(id, 2, '0')) AS numero, date_creation, montant_total, statut
          FROM bons_comptant
          WHERE date_creation >= DATE_SUB(NOW(), INTERVAL 1 DAY)
          UNION ALL
          SELECT 'Commande' AS type, id, CONCAT('CMD', LPAD(id, 2, '0')) AS numero, date_creation, montant_total, statut
          FROM bons_commande
          WHERE date_creation >= DATE_SUB(NOW(), INTERVAL 1 DAY)
        ) recent
        ORDER BY date_creation DESC
        LIMIT 3
      `),
      pool.query(`
        SELECT id, date_paiement, montant_total, mode_paiement
        FROM payments
        WHERE date_paiement >= DATE_SUB(NOW(), INTERVAL 1 DAY)
        ORDER BY date_paiement DESC
        LIMIT 2
      `),
      pool.query(`
        SELECT id, designation, quantite
        FROM products
        WHERE COALESCE(is_deleted, 0) = 0 AND COALESCE(quantite, 0) <= 2
        ORDER BY quantite ASC, id ASC
        LIMIT 1
      `),
      pool.query(`
        SELECT COUNT(*) AS total
        FROM payments
        WHERE talon_id IS NOT NULL
          AND date_echeance IS NOT NULL
          AND DATE(date_echeance) < CURDATE()
      `),
    ]);

    const formatAmount = (value) => new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 10,
    }).format(Number(value || 0));

    const activities = [];
    const now = Date.now();
    const priorityOrder = { critical: 0, high: 1, medium: 2 };

    for (const bon of recentBons || []) {
      const created = new Date(bon.date_creation).getTime();
      const timeAgo = Number.isFinite(created) ? Math.floor((now - created) / (1000 * 60 * 60)) : 0;
      const color = bon.type === 'Sortie' ? 'green' : bon.type === 'Comptant' ? 'blue' : 'purple';
      activities.push({
        type: 'bon',
        message: `${bon.type} ${bon.numero || `#${bon.id}`} créé - ${formatAmount(bon.montant_total)} DH`,
        time: timeAgo > 0 ? `Il y a ${timeAgo}h` : "À l'instant",
        color,
        priority: bon.statut === 'Validé' ? 'high' : 'medium',
      });
    }

    for (const payment of recentPayments || []) {
      const paidAt = new Date(payment.date_paiement).getTime();
      const timeAgo = Number.isFinite(paidAt) ? Math.floor((now - paidAt) / (1000 * 60 * 60)) : 0;
      activities.push({
        type: 'payment',
        message: `Paiement PAY${String(payment.id).padStart(2, '0')} - ${formatAmount(payment.montant_total)} DH (${payment.mode_paiement || 'Espèces'})`,
        time: timeAgo > 0 ? `Il y a ${timeAgo}h` : "À l'instant",
        color: 'yellow',
        priority: 'high',
      });
    }

    if (criticalProducts?.length) {
      const product = criticalProducts[0];
      activities.push({
        type: 'alert',
        message: `Stock critique: "${product.designation}" (${product.quantite || 0} restants)`,
        time: 'Maintenant',
        color: 'red',
        priority: 'critical',
      });
    }

    const overdueTalons = Number(overdueTalonsRow?.total || 0);
    if (overdueTalons > 0) {
      activities.push({
        type: 'overdue',
        message: `${overdueTalons} talon(s) en retard de paiement`,
        time: 'Urgent',
        color: 'red',
        priority: 'critical',
      });
    }

    activities.sort((a, b) => (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99));

    res.json({
      stats: {
        employees: Number(employeesRow?.total || 0),
        products: Number(productsRow?.total || 0),
        orders: Number(ordersRow?.total || 0),
        lowStock: Number(lowStockRow?.total || 0),
        pendingOrders: Number(pendingOrdersRow?.total || 0),
        talonDueSoon: Number(talonDueSoonRow?.total || 0),
      },
      recentActivity: activities.slice(0, 5),
    });
  } catch (error) {
    console.error('GET /stats/dashboard-summary error:', error);
    res.status(500).json({ message: 'Erreur résumé dashboard', error: error?.sqlMessage || error?.message });
  }
});

function formatStatsDetailNumero(type, id, numero) {
  if (numero) return String(numero);
  const prefixes = {
    Sortie: 'SOR',
    Comptant: 'COM',
    Ecommerce: 'ORD',
    Commande: 'CMD',
    Charge: 'CHG',
    Avoir: 'AVC',
    AvoirCharge: 'ACH',
    AvoirFournisseur: 'AVF',
    AvoirComptant: 'AVCC',
    AvoirEcommerce: 'AVE',
  };
  return `${prefixes[type] || 'BON'}${String(id).padStart(2, '0')}`;
}

function buildStatsDateCondition(alias, dateColumn, params, dateFrom, dateTo) {
  const parts = [];
  if (dateFrom) {
    parts.push(`DATE(${alias}.${dateColumn}) >= ?`);
    params.push(dateFrom);
  }
  if (dateTo) {
    parts.push(`DATE(${alias}.${dateColumn}) <= ?`);
    params.push(dateTo);
  }
  return parts.length ? ` AND ${parts.join(' AND ')}` : '';
}

function normalizeStatsStatus(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isStatsDetailStatusAllowed(type, statut) {
  const s = normalizeStatsStatus(statut);
  if (!s) return true;
  if (type === 'Comptant') return !['annulé', 'annule', 'avoir'].includes(s);
  if (type === 'Ecommerce') return !['cancelled', 'canceled', 'refunded', 'annulé', 'annule'].includes(s);
  return !['annulé', 'annule', 'refusé', 'refuse', 'expiré', 'expire'].includes(s);
}

function resolveStatsClientId(row) {
  const type = row.bonType;
  let clientId = '';
  if (type === 'Commande' || type === 'AvoirFournisseur') {
    clientId = row.fournisseur_id != null ? String(row.fournisseur_id) : '';
  } else {
    clientId = row.client_id != null ? String(row.client_id) : '';
  }

  if (!clientId && (type === 'Comptant' || type === 'AvoirComptant')) {
    clientId = `comptant_${row.contact_nom || 'Sans nom'}`;
  }

  if (!clientId && (type === 'Ecommerce' || type === 'AvoirEcommerce')) {
    const key = String(row.contact_nom || row.phone || row.customer_email || row.bonNumero || row.bonId || '').trim();
    clientId = `ecom_${key || 'inconnu'}`;
  }

  return clientId;
}

function resolveStatsClientName(clientId, row, contactsById) {
  if (clientId === '__all__') return 'Tous (sans condition client)';
  if (String(clientId).startsWith('comptant_')) return `${String(clientId).replace('comptant_', '')} (Comptant)`;
  if (String(clientId).startsWith('ecom_')) return `${String(clientId).replace('ecom_', '')} (Ecommerce)`;
  return contactsById.get(String(clientId))?.nom_complet || row?.contact_nom || `Client ${clientId}`;
}

function buildStatsDetailSqlParts({ dateFrom, dateTo, includeVentes, includeCommandes, includeAvoirs, includeCharges }) {
  const parts = [];
  const params = [];

  const commonSelect = (type, headerAlias, itemAlias, contactIdExpr, contactNameExpr, numeroExpr, dateCol = 'date_creation') => {
    const designationExpr = type === 'Ecommerce'
      ? unionCoalesce('p.designation', `${itemAlias}.product_name`)
      : unionText('p.designation');
    const variantNameExpr = type === 'Ecommerce'
      ? unionCoalesce('pv.variant_name', `${itemAlias}.variant_name`)
      : unionText('pv.variant_name');
    const unitNameExpr = type === 'Ecommerce'
      ? unionCoalesce('pu.unit_name', `${itemAlias}.unit_name`)
      : unionText('pu.unit_name');

    return `
      SELECT
        ${unionText(`'${type}'`)} AS bonType,
        ${headerAlias}.id AS bonId,
        ${unionText(numeroExpr)} AS bonNumero,
        ${headerAlias}.${dateCol} AS date_creation,
        ${unionText(type === 'Ecommerce' ? `${headerAlias}.status` : `${headerAlias}.statut`)} AS statut,
        ${type === 'Ecommerce' ? '0' : `COALESCE(${headerAlias}.isNotCalculated, 0)`} AS isNotCalculated,
        ${unionText(contactIdExpr)} AS client_id,
        ${unionText(contactIdExpr)} AS fournisseur_id,
        ${unionText(contactNameExpr)} AS contact_nom,
        ${unionNullText()} AS phone,
        ${unionNullText()} AS customer_email,
        ${itemAlias}.product_id AS product_id,
        ${unionText('CAST(p.id AS CHAR)')} AS product_reference,
        ${designationExpr} AS designation,
        COALESCE(${itemAlias}.variant_id, ps.variant_id) AS variant_id,
        ${variantNameExpr} AS variant_name,
        ${itemAlias}.unit_id AS unit_id,
        ${unitNameExpr} AS unit_name,
        COALESCE(pu.conversion_factor, 1) AS conversion_factor,
        ${type === 'Ecommerce' ? `${itemAlias}.quantity` : `${itemAlias}.quantite`} AS quantite,
        ${type === 'Ecommerce' ? `${itemAlias}.unit_price` : `${itemAlias}.prix_unitaire`} AS prix_unitaire,
        COALESCE(${type === 'Ecommerce' ? `${itemAlias}.subtotal` : `${itemAlias}.total`}, ${type === 'Ecommerce' ? `${itemAlias}.unit_price * ${itemAlias}.quantity` : `${itemAlias}.prix_unitaire * ${itemAlias}.quantite`}) AS total,
        ${type === 'Ecommerce' ? `COALESCE(${itemAlias}.remise_amount, 0)` : `COALESCE(${itemAlias}.remise_montant, 0)`} AS remise_montant,
        ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')} AS cout_revient
    `;
  };

  if (includeVentes) {
    const ps = [];
    parts.push({
      sql: `${commonSelect('Sortie', 'bs', 'si', 'bs.client_id', 'ct.nom_complet', "CONCAT('SOR', LPAD(bs.id, GREATEST(LENGTH(bs.id), 2), '0'))")}
        FROM bons_sortie bs
        JOIN sortie_items si ON si.bon_sortie_id = bs.id
        LEFT JOIN contacts ct ON ct.id = bs.client_id
        LEFT JOIN products p ON p.id = si.product_id
        LEFT JOIN product_snapshot ps ON ps.id = si.product_snapshot_id
        LEFT JOIN product_variants pv ON pv.id = COALESCE(si.variant_id, ps.variant_id)
        LEFT JOIN product_units pu ON pu.id = si.unit_id
        WHERE 1=1 ${buildStatsDateCondition('bs', 'date_creation', ps, dateFrom, dateTo)}`,
      params: ps,
    });

    const pc = [];
    parts.push({
      sql: `${commonSelect('Comptant', 'bc', 'ci', 'bc.client_id', unionCoalesce('ct.nom_complet', 'bc.client_nom'), "CONCAT('COM', LPAD(bc.id, GREATEST(LENGTH(bc.id), 2), '0'))")}
        FROM bons_comptant bc
        JOIN comptant_items ci ON ci.bon_comptant_id = bc.id
        LEFT JOIN contacts ct ON ct.id = bc.client_id
        LEFT JOIN products p ON p.id = ci.product_id
        LEFT JOIN product_snapshot ps ON ps.id = ci.product_snapshot_id
        LEFT JOIN product_variants pv ON pv.id = COALESCE(ci.variant_id, ps.variant_id)
        LEFT JOIN product_units pu ON pu.id = ci.unit_id
        WHERE 1=1 ${buildStatsDateCondition('bc', 'date_creation', pc, dateFrom, dateTo)}`,
      params: pc,
    });

    const pe = [];
    parts.push({
      sql: `${commonSelect('Ecommerce', 'eo', 'oi', 'eo.user_id', unionCoalesce('eo.customer_name', 'ct.nom_complet'), 'eo.order_number', 'created_at').replace(`${unionNullText()} AS phone`, `${unionText('eo.customer_phone')} AS phone`).replace(`${unionNullText()} AS customer_email`, `${unionText('eo.customer_email')} AS customer_email`)}
        FROM ecommerce_orders eo
        JOIN ecommerce_order_items oi ON oi.order_id = eo.id
        LEFT JOIN contacts ct ON ct.id = eo.user_id
        LEFT JOIN products p ON p.id = oi.product_id
        LEFT JOIN product_snapshot ps ON ps.id = oi.product_snapshot_id
        LEFT JOIN product_variants pv ON pv.id = COALESCE(oi.variant_id, ps.variant_id)
        LEFT JOIN product_units pu ON pu.id = oi.unit_id
        WHERE 1=1 ${buildStatsDateCondition('eo', 'created_at', pe, dateFrom, dateTo)}`,
      params: pe,
    });
  }

  if (includeCommandes) {
    const pcmd = [];
    parts.push({
      sql: `${commonSelect('Commande', 'bcmd', 'ci', 'bcmd.fournisseur_id', 'ct.nom_complet', "CONCAT('CMD', LPAD(bcmd.id, GREATEST(LENGTH(bcmd.id), 2), '0'))")}
        FROM bons_commande bcmd
        JOIN commande_items ci ON ci.bon_commande_id = bcmd.id
        LEFT JOIN contacts ct ON ct.id = bcmd.fournisseur_id
        LEFT JOIN products p ON p.id = ci.product_id
        LEFT JOIN product_snapshot ps ON ps.id = COALESCE(
          ci.product_snapshot_id,
          (SELECT ps2.id FROM product_snapshot ps2
           WHERE ps2.bon_commande_id = bcmd.id
             AND ps2.product_id = ci.product_id
           ORDER BY ps2.id DESC LIMIT 1)
        )
        LEFT JOIN product_variants pv ON pv.id = COALESCE(ci.variant_id, ps.variant_id)
        LEFT JOIN product_units pu ON pu.id = ci.unit_id
        WHERE 1=1 ${buildStatsDateCondition('bcmd', 'date_creation', pcmd, dateFrom, dateTo)}`,
      params: pcmd,
    });
  }

  if (includeCharges) {
    const pch = [];
    parts.push({
      sql: `
      SELECT
        ${unionText("'Charge'")} AS bonType,
        bch.id AS bonId,
        ${unionText("CONCAT('CHG', LPAD(bch.id, GREATEST(LENGTH(bch.id), 2), '0'))")} AS bonNumero,
        bch.date_creation AS date_creation,
        ${unionText('bch.statut')} AS statut,
        0 AS isNotCalculated,
        ${unionText('bch.client_id')} AS client_id,
        ${unionText('bch.client_id')} AS fournisseur_id,
        ${unionText('ct.nom_complet')} AS contact_nom,
        ${unionNullText()} AS phone,
        ${unionNullText()} AS customer_email,
        COALESCE(CAST(chi.product_id AS CHAR), CONCAT('charge_custom_', chi.id)) AS product_id,
        COALESCE(${unionText('CAST(p.id AS CHAR)')}, CONCAT('CHG-', chi.id)) AS product_reference,
        ${unionCoalesce('p.designation', 'chi.designation_custom')} AS designation,
        COALESCE(chi.variant_id, ps.variant_id) AS variant_id,
        ${unionText('pv.variant_name')} AS variant_name,
        chi.unit_id AS unit_id,
        ${unionText('pu.unit_name')} AS unit_name,
        COALESCE(pu.conversion_factor, 1) AS conversion_factor,
        chi.quantite AS quantite,
        chi.prix_achat AS prix_unitaire,
        COALESCE(chi.total, chi.prix_achat * chi.quantite) AS total,
        COALESCE(chi.remise_montant, 0) AS remise_montant,
        0 AS cout_revient
        FROM bons_charge bch
        JOIN charge_items chi ON chi.bon_charge_id = bch.id
        LEFT JOIN contacts ct ON ct.id = bch.client_id
        LEFT JOIN products p ON p.id = chi.product_id
        LEFT JOIN product_snapshot ps ON ps.id = chi.product_snapshot_id
        LEFT JOIN product_variants pv ON pv.id = COALESCE(chi.variant_id, ps.variant_id)
        LEFT JOIN product_units pu ON pu.id = chi.unit_id
        WHERE 1=1 ${buildStatsDateCondition('bch', 'date_creation', pch, dateFrom, dateTo)}`,
      params: pch,
    });
  }

  if (includeAvoirs) {
    const pa = [];
    parts.push({
      sql: `${commonSelect('Avoir', 'ac', 'ai', 'ac.client_id', 'ct.nom_complet', "CONCAT('AVC', LPAD(ac.id, GREATEST(LENGTH(ac.id), 2), '0'))")}
        FROM avoirs_client ac
        JOIN avoir_client_items ai ON ai.avoir_client_id = ac.id
        LEFT JOIN contacts ct ON ct.id = ac.client_id
        LEFT JOIN products p ON p.id = ai.product_id
        LEFT JOIN product_snapshot ps ON ps.id = ai.product_snapshot_id
        LEFT JOIN product_variants pv ON pv.id = COALESCE(ai.variant_id, ps.variant_id)
        LEFT JOIN product_units pu ON pu.id = ai.unit_id
        WHERE 1=1 ${buildStatsDateCondition('ac', 'date_creation', pa, dateFrom, dateTo)}`,
      params: pa,
    });

    const paf = [];
    parts.push({
      sql: `${commonSelect('AvoirFournisseur', 'af', 'afi', 'af.fournisseur_id', 'ct.nom_complet', "CONCAT('AVF', LPAD(af.id, GREATEST(LENGTH(af.id), 2), '0'))")}
        FROM avoirs_fournisseur af
        JOIN avoir_fournisseur_items afi ON afi.avoir_fournisseur_id = af.id
        LEFT JOIN contacts ct ON ct.id = af.fournisseur_id
        LEFT JOIN products p ON p.id = afi.product_id
        LEFT JOIN product_snapshot ps ON ps.id = COALESCE(
          afi.product_snapshot_id,
          (SELECT ps2.id FROM product_snapshot ps2
           WHERE ps2.product_id = afi.product_id
             AND ps2.bon_commande_id IS NOT NULL
           ORDER BY ps2.id DESC LIMIT 1)
        )
        LEFT JOIN product_variants pv ON pv.id = COALESCE(afi.variant_id, ps.variant_id)
        LEFT JOIN product_units pu ON pu.id = afi.unit_id
        WHERE 1=1 ${buildStatsDateCondition('af', 'date_creation', paf, dateFrom, dateTo)}`,
      params: paf,
    });

    const pac = [];
    parts.push({
      sql: `${commonSelect('AvoirComptant', 'ac2', 'aci', 'NULL', 'ac2.client_nom', "CONCAT('AVCC', LPAD(ac2.id, GREATEST(LENGTH(ac2.id), 2), '0'))")}
        FROM avoirs_comptant ac2
        JOIN avoir_comptant_items aci ON aci.avoir_comptant_id = ac2.id
        LEFT JOIN products p ON p.id = aci.product_id
        LEFT JOIN product_snapshot ps ON ps.id = aci.product_snapshot_id
        LEFT JOIN product_variants pv ON pv.id = COALESCE(aci.variant_id, ps.variant_id)
        LEFT JOIN product_units pu ON pu.id = aci.unit_id
        WHERE 1=1 ${buildStatsDateCondition('ac2', 'date_creation', pac, dateFrom, dateTo)}`,
      params: pac,
    });

    const pae = [];
    parts.push({
      sql: `${commonSelect('AvoirEcommerce', 'ae', 'aei', 'NULL', 'ae.customer_name', unionCoalesce('ae.order_number', "CONCAT('AVE', LPAD(ae.id, GREATEST(LENGTH(ae.id), 2), '0'))")).replace(`${unionNullText()} AS phone`, `${unionText('ae.customer_phone')} AS phone`).replace(`${unionNullText()} AS customer_email`, `${unionText('ae.customer_email')} AS customer_email`)}
        FROM avoirs_ecommerce ae
        JOIN avoir_ecommerce_items aei ON aei.avoir_ecommerce_id = ae.id
        LEFT JOIN products p ON p.id = aei.product_id
        LEFT JOIN product_snapshot ps ON ps.id = aei.product_snapshot_id
        LEFT JOIN product_variants pv ON pv.id = COALESCE(aei.variant_id, ps.variant_id)
        LEFT JOIN product_units pu ON pu.id = aei.unit_id
        WHERE 1=1 ${buildStatsDateCondition('ae', 'date_creation', pae, dateFrom, dateTo)}`,
      params: pae,
    });

    const pach = [];
    parts.push({
      sql: `
      SELECT
        ${unionText("'AvoirCharge'")} AS bonType,
        ach.id AS bonId,
        ${unionText("CONCAT('ACH', LPAD(ach.id, GREATEST(LENGTH(ach.id), 2), '0'))")} AS bonNumero,
        ach.date_creation AS date_creation,
        ${unionText('ach.statut')} AS statut,
        0 AS isNotCalculated,
        ${unionText('ach.client_id')} AS client_id,
        ${unionText('ach.client_id')} AS fournisseur_id,
        ${unionText('ct.nom_complet')} AS contact_nom,
        ${unionNullText()} AS phone,
        ${unionNullText()} AS customer_email,
        COALESCE(CAST(achi.product_id AS CHAR), CONCAT('avoir_charge_custom_', achi.id)) AS product_id,
        COALESCE(${unionText('CAST(p.id AS CHAR)')}, CONCAT('ACH-', achi.id)) AS product_reference,
        ${unionCoalesce('p.designation', 'achi.designation_custom')} AS designation,
        COALESCE(achi.variant_id, ps.variant_id) AS variant_id,
        ${unionText('pv.variant_name')} AS variant_name,
        achi.unit_id AS unit_id,
        ${unionText('pu.unit_name')} AS unit_name,
        COALESCE(pu.conversion_factor, 1) AS conversion_factor,
        achi.quantite AS quantite,
        achi.prix_achat AS prix_unitaire,
        COALESCE(achi.total, achi.prix_achat * achi.quantite) AS total,
        COALESCE(achi.remise_montant, 0) AS remise_montant,
        0 AS cout_revient
        FROM avoirs_charge ach
        JOIN items_avoir_charge achi ON achi.avoir_charge_id = ach.id
        LEFT JOIN contacts ct ON ct.id = ach.client_id
        LEFT JOIN products p ON p.id = achi.product_id
        LEFT JOIN product_snapshot ps ON ps.id = achi.product_snapshot_id
        LEFT JOIN product_variants pv ON pv.id = COALESCE(achi.variant_id, ps.variant_id)
        LEFT JOIN product_units pu ON pu.id = achi.unit_id
        WHERE 1=1 ${buildStatsDateCondition('ach', 'date_creation', pach, dateFrom, dateTo)}`,
      params: pach,
    });
  }

  for (const p of parts) params.push(...p.params);
  return { sql: parts.map((p) => p.sql).join('\nUNION ALL\n'), params };
}

function buildVariantIdExpr(itemAlias, snapshotAlias = 'ps') {
  return `COALESCE(${itemAlias}.variant_id, ${snapshotAlias}.variant_id)`;
}

function buildBasePrixAchatExpr(productAlias = 'p', snapshotAlias = 'ps', variantAlias = 'pv') {
  return `COALESCE(${snapshotAlias}.prix_achat, ${variantAlias}.prix_achat, ${productAlias}.prix_achat, ${snapshotAlias}.cout_revient, ${variantAlias}.cout_revient, ${productAlias}.cout_revient, 0)`;
}

function buildBaseCoutRevientExpr(productAlias = 'p', snapshotAlias = 'ps', variantAlias = 'pv') {
  const variantIdExpr = `COALESCE(${variantAlias}.id, ${snapshotAlias}.variant_id)`;
  return `COALESCE((
    SELECT SUM(COALESCE(ps_avg.cout_revient, 0) * ci_avg.quantite) / NULLIF(SUM(ci_avg.quantite), 0)
    FROM product_snapshot ps_avg
    JOIN commande_items ci_avg ON ci_avg.product_snapshot_id = ps_avg.id
    WHERE ps_avg.product_id = ${productAlias}.id
      AND ((${variantIdExpr} IS NULL AND ps_avg.variant_id IS NULL) OR ps_avg.variant_id <=> ${variantIdExpr})
      AND ci_avg.quantite IS NOT NULL
      AND ci_avg.quantite <> 0
      AND ps_avg.cout_revient IS NOT NULL
  ), ${variantAlias}.cout_revient, ${productAlias}.cout_revient, ${snapshotAlias}.cout_revient, ${variantAlias}.prix_achat, ${productAlias}.prix_achat, ${snapshotAlias}.prix_achat, 0)`;
}

function buildConvertedCostExpr(productAlias = 'p', snapshotAlias = 'ps', variantAlias = 'pv', unitAlias = 'pu') {
  return `(CASE WHEN COALESCE(${productAlias}.est_service, 0) = 1 THEN 0 ELSE ${buildBaseCoutRevientExpr(productAlias, snapshotAlias, variantAlias)} * COALESCE(${unitAlias}.conversion_factor, 1) END)`;
}

async function tryQuery(sql, params) {
  try {
    const [rows] = await pool.query(sql, params);
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: e?.sqlMessage || e?.message || String(e) };
  }
}

router.get('/details', async (req, res) => {
  try {
    const mode = String(req.query?.mode || 'produits') === 'clients' ? 'clients' : 'produits';
    const page = clampInt(req.query?.page, 1, 1, 100000);
    const pageSize = clampInt(req.query?.pageSize, 10, 1, 100);
    const dateFrom = req.query?.dateFrom ? String(req.query.dateFrom) : '';
    const dateTo = req.query?.dateTo ? String(req.query.dateTo) : '';
    const includeVentes = parseBoolQuery(req.query?.includeVentes, true);
    const includeCommandes = parseBoolQuery(req.query?.includeCommandes, true);
    const includeAvoirs = parseBoolQuery(req.query?.includeAvoirs, true);
    const includeCharges = parseBoolQuery(req.query?.includeCharges, true);
    const useClientCondition = parseBoolQuery(req.query?.useClientCondition, false);
    const selectedProductId = req.query?.selectedProductId ? String(req.query.selectedProductId) : '';
    const selectedClientId = req.query?.selectedClientId ? String(req.query.selectedClientId) : '';

    const emptyResponse = () => ({
      rows: [],
      pagination: { page, pageSize, total: 0, totalPages: 0 },
      totals: { totalVentes: 0, totalQuantite: 0, totalMontant: 0, totalRemise: 0, totalProfit: 0 },
      options: { products: [{ value: '', label: 'Tous' }], clients: [{ value: '', label: 'Tous' }] },
      counts: { ventes: { total: 0, filtered: 0 }, commandes: { total: 0, filtered: 0 }, avoirs: { total: 0, filtered: 0 }, charges: { total: 0, filtered: 0 } },
    });

    if (!includeVentes && !includeCommandes && !includeAvoirs && !includeCharges) return res.json(emptyResponse());

    const { sql, params } = buildStatsDetailSqlParts({ dateFrom, dateTo, includeVentes, includeCommandes, includeAvoirs, includeCharges });
    if (!sql.trim()) return res.json(emptyResponse());

    const [[contactsRows], [lineRows]] = await Promise.all([
      pool.query('SELECT id, nom_complet FROM contacts'),
      pool.query(sql, params),
    ]);

    const contactsById = new Map((contactsRows || []).map((c) => [String(c.id), c]));
    const productStats = new Map();
    const clientStats = new Map();
    const productOptions = new Map();
    const clientOptions = new Map();
    const counts = {
      ventes: { total: 0, filtered: 0 },
      commandes: { total: 0, filtered: 0 },
      avoirs: { total: 0, filtered: 0 },
      charges: { total: 0, filtered: 0 },
    };
    const bucketFor = (type) => (['Sortie', 'Comptant', 'Ecommerce'].includes(type) ? 'ventes' : type === 'Commande' ? 'commandes' : ['Charge', 'AvoirCharge'].includes(type) ? 'charges' : 'avoirs');

    for (const raw of lineRows || []) {
      const bonType = String(raw.bonType || '');
      const bucket = bucketFor(bonType);
      counts[bucket].total += 1;
      if (Number(raw.isNotCalculated || 0) === 1) continue;
      if (!isStatsDetailStatusAllowed(bonType, raw.statut)) continue;

      const productId = raw.product_id == null ? '' : String(raw.product_id);
      if (!productId) continue;
      const realClientId = resolveStatsClientId(raw);
      if (!realClientId) continue;
      counts[bucket].filtered += 1;

      const sign = getStatsDetailSign(bonType);
      const qty = roundSafe(raw.quantite);
      const unit = roundSafe(raw.prix_unitaire);
      const total = roundSafe(raw.total || unit * qty);
      const costUnit = roundSafe(raw.cout_revient);
      const remiseUnit = roundSafe(raw.remise_montant);
      const signedQty = qty * sign;
      const signedTotal = total * sign;
      const signedRemise = remiseUnit * qty * sign;
      const profitSign = getStatsDetailProfitSign(bonType);
      const profit = profitSign === 0
        ? 0
        : ['Charge', 'AvoirCharge'].includes(bonType)
          ? total * profitSign
          : ((unit - costUnit) * qty - remiseUnit * qty) * profitSign;
      const productLabel = [raw.product_reference, raw.designation].filter(Boolean).join(' - ') || `Produit ${productId}`;
      const productName = raw.designation || productLabel;
      const productClientId = useClientCondition ? realClientId : '__all__';
      const clientName = resolveStatsClientName(realClientId, raw, contactsById);
      const productClientName = resolveStatsClientName(productClientId, raw, contactsById);

      productOptions.set(productId, { value: productId, label: productLabel });
      clientOptions.set(realClientId, { value: realClientId, label: clientName });

      const detail = {
        bonId: raw.bonId,
        bonNumero: formatStatsDetailNumero(bonType, raw.bonId, raw.bonNumero),
        type: bonType,
        date: formatDayKey(raw.date_creation),
        statut: raw.statut,
        variantName: raw.variant_name || '',
        unitName: raw.unit_name || '',
        quantite: signedQty,
        rawQuantite: qty,
        prix_unitaire: unit,
        costUnit,
        remise: signedRemise,
        total: signedTotal,
        profit,
        sign,
      };

      if (!productStats.has(productId)) {
        productStats.set(productId, { productId, title: productName, totalVentes: 0, totalQuantite: 0, totalMontant: 0, totalRemise: 0, totalProfit: 0, clients: new Map() });
      }
      const ps = productStats.get(productId);
      ps.totalVentes += 1;
      ps.totalQuantite += signedQty;
      ps.totalMontant += signedTotal;
      ps.totalRemise += signedRemise;
      ps.totalProfit += profit;
      if (!ps.clients.has(productClientId)) {
        ps.clients.set(productClientId, { clientId: productClientId, clientName: productClientName, ventes: 0, quantite: 0, montant: 0, remise: 0, profit: 0, details: [] });
      }
      const pc = ps.clients.get(productClientId);
      pc.ventes += 1;
      pc.quantite += signedQty;
      pc.montant += signedTotal;
      pc.remise += signedRemise;
      pc.profit += profit;
      pc.details.push(detail);

      if (!clientStats.has(realClientId)) {
        clientStats.set(realClientId, { clientId: realClientId, clientName, totalVentes: 0, totalQuantite: 0, totalMontant: 0, totalRemise: 0, totalProfit: 0, products: new Map() });
      }
      const cs = clientStats.get(realClientId);
      cs.totalVentes += 1;
      cs.totalQuantite += signedQty;
      cs.totalMontant += signedTotal;
      cs.totalRemise += signedRemise;
      cs.totalProfit += profit;
      if (!cs.products.has(productId)) cs.products.set(productId, { productId, productName, ventes: 0, quantite: 0, montant: 0, remise: 0, profit: 0 });
      const cp = cs.products.get(productId);
      cp.ventes += 1;
      cp.quantite += signedQty;
      cp.montant += signedTotal;
      cp.remise += signedRemise;
      cp.profit += profit;
    }

    const productRows = Array.from(productStats.values()).map((row) => ({
      ...row,
      clients: Array.from(row.clients.values()).sort((a, b) => b.montant - a.montant).slice(0, 10),
    }));
    const clientRows = Array.from(clientStats.values()).map((row) => ({
      ...row,
      products: Array.from(row.products.values()).sort((a, b) => b.montant - a.montant).slice(0, 10),
    }));

    let rows = mode === 'clients' ? clientRows : productRows;
    if (mode === 'produits' && selectedProductId) rows = rows.filter((r) => String(r.productId) === selectedProductId);
    if (mode === 'clients' && selectedClientId) rows = rows.filter((r) => String(r.clientId) === selectedClientId);
    rows = rows.sort((a, b) => roundSafe(b.totalMontant) - roundSafe(a.totalMontant));

    const totals = rows.reduce((acc, row) => {
      acc.totalVentes += roundSafe(row.totalVentes);
      acc.totalQuantite += roundSafe(row.totalQuantite);
      acc.totalMontant += roundSafe(row.totalMontant);
      acc.totalRemise += roundSafe(row.totalRemise);
      acc.totalProfit += roundSafe(row.totalProfit);
      return acc;
    }, { totalVentes: 0, totalQuantite: 0, totalMontant: 0, totalRemise: 0, totalProfit: 0 });

    const total = rows.length;
    const totalPages = total ? Math.ceil(total / pageSize) : 0;
    const start = (page - 1) * pageSize;

    res.json({
      rows: rows.slice(start, start + pageSize),
      pagination: { page, pageSize, total, totalPages },
      totals,
      options: {
        products: [{ value: '', label: 'Tous' }, ...Array.from(productOptions.values()).sort((a, b) => a.label.localeCompare(b.label))],
        clients: [{ value: '', label: 'Tous' }, ...Array.from(clientOptions.values()).sort((a, b) => a.label.localeCompare(b.label))],
      },
      counts,
      filters: { mode, dateFrom, dateTo, includeVentes, includeCommandes, includeAvoirs, includeCharges, useClientCondition, selectedProductId, selectedClientId },
    });
  } catch (error) {
    console.error('GET /stats/details error:', error);
    res.status(500).json({ message: 'Erreur stats détaillées', error: error?.sqlMessage || error?.message });
  }
});

router.get('/chiffre-affaires', async (req, res) => {
  try {
    const filterType = normalizeFilterType(req.query?.filterType);
    const date = req.query?.date ? String(req.query.date) : undefined;
    const startDate = req.query?.startDate ? String(req.query.startDate) : undefined;
    const endDate = req.query?.endDate ? String(req.query.endDate) : undefined;
    const month = req.query?.month ? String(req.query.month) : undefined;
    const debug = String(req.query?.debug || '') === '1';

    const filterArgs = { filterType, date, startDate, endDate, month };

    const sortieFilter = buildDateFilter(filterArgs, 'bs');
    const comptantFilter = buildDateFilter(filterArgs, 'bc');
    const avoirClientFilter = buildDateFilter(filterArgs, 'ac');
    const avoirComptantFilter = buildDateFilter(filterArgs, 'ac2');
    const chargeFilter = buildDateFilter(filterArgs, 'bch');
    const avoirChargeFilter = buildDateFilter(filterArgs, 'ach');
    const vehiculeFilter = buildDateFilter(filterArgs, 'bv');
    const commandeFilter = buildDateFilter(filterArgs, 'bcmd');

    const ventesSql = `
      SELECT day,
             SUM(totalBon) AS ca,
             SUM(profitNetBon) AS profitNet,
             SUM(profitBrutBon) AS profitBrut,
             SUM(remiseBon) AS remises,
             SUM(bonCount) AS bonCount
      FROM (
        SELECT DATE_FORMAT(bs.date_creation, '%Y-%m-%d') AS day,
               bs.id AS bon_id,
               bs.montant_total AS totalBon,
           COALESCE(SUM((si.prix_unitaire - ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')}) * si.quantite - (COALESCE(si.remise_montant, 0) * si.quantite)), 0) AS profitNetBon,
           COALESCE(SUM((si.prix_unitaire - ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')}) * si.quantite), 0) AS profitBrutBon,
               COALESCE(SUM(COALESCE(si.remise_montant, 0) * si.quantite), 0) AS remiseBon,
               1 AS bonCount
        FROM bons_sortie bs
        LEFT JOIN sortie_items si ON si.bon_sortie_id = bs.id
        LEFT JOIN products p ON p.id = si.product_id
        LEFT JOIN product_snapshot ps ON ps.id = si.product_snapshot_id
         LEFT JOIN product_variants pv ON pv.id = ${buildVariantIdExpr('si', 'ps')}
        LEFT JOIN product_units pu ON pu.id = si.unit_id
        WHERE LOWER(TRIM(COALESCE(bs.statut, ''))) IN ${VALID_STATUSES_SQL}
          AND COALESCE(bs.isNotCalculated, 0) <> 1
          ${sortieFilter.sql}
        GROUP BY bs.id, day

        UNION ALL

        SELECT DATE_FORMAT(bc.date_creation, '%Y-%m-%d') AS day,
               bc.id AS bon_id,
               bc.montant_total AS totalBon,
           COALESCE(SUM((ci.prix_unitaire - ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')}) * ci.quantite - (COALESCE(ci.remise_montant, 0) * ci.quantite)), 0) AS profitNetBon,
           COALESCE(SUM((ci.prix_unitaire - ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')}) * ci.quantite), 0) AS profitBrutBon,
               COALESCE(SUM(COALESCE(ci.remise_montant, 0) * ci.quantite), 0) AS remiseBon,
               1 AS bonCount
        FROM bons_comptant bc
        LEFT JOIN comptant_items ci ON ci.bon_comptant_id = bc.id
        LEFT JOIN products p ON p.id = ci.product_id
        LEFT JOIN product_snapshot ps ON ps.id = ci.product_snapshot_id
         LEFT JOIN product_variants pv ON pv.id = ${buildVariantIdExpr('ci', 'ps')}
        LEFT JOIN product_units pu ON pu.id = ci.unit_id
        WHERE LOWER(TRIM(COALESCE(bc.statut, ''))) IN ${VALID_STATUSES_SQL}
          AND COALESCE(bc.isNotCalculated, 0) <> 1
          ${comptantFilter.sql}
        GROUP BY bc.id, day

        UNION ALL

        SELECT DATE_FORMAT(o.created_at, '%Y-%m-%d') AS day,
               o.id AS bon_id,
               o.total_amount AS totalBon,
           COALESCE(SUM((oi.unit_price - ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')}) * oi.quantity - COALESCE(oi.remise_amount, 0)), 0) AS profitNetBon,
           COALESCE(SUM((oi.unit_price - ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')}) * oi.quantity), 0) AS profitBrutBon,
               COALESCE(SUM(COALESCE(oi.remise_amount, 0)), 0) AS remiseBon,
               1 AS bonCount
        FROM ecommerce_orders o
        LEFT JOIN ecommerce_order_items oi ON oi.order_id = o.id
        LEFT JOIN products p ON p.id = oi.product_id
        LEFT JOIN product_snapshot ps ON ps.id = oi.product_snapshot_id
         LEFT JOIN product_variants pv ON pv.id = ${buildVariantIdExpr('oi', 'ps')}
        LEFT JOIN product_units pu ON pu.id = oi.unit_id
        WHERE LOWER(COALESCE(o.status, '')) NOT IN ${ECOMMERCE_EXCLUDED_STATUSES_SQL}
          ${buildDateFilter(filterArgs, 'o', 'created_at').sql}
        GROUP BY o.id, day
      ) t
      GROUP BY day
      ORDER BY day DESC
    `;

    const ventesFournisseurSql = `
      SELECT day,
             SUM(totalBon) AS ca,
             SUM(profitNetBon) AS profitNet,
             SUM(bonCount) AS bonCount
      FROM (
        SELECT DATE_FORMAT(bs.date_creation, '%Y-%m-%d') AS day,
               bs.id AS bon_id,
               bs.montant_total AS totalBon,
               COALESCE(SUM((si.prix_unitaire - ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')}) * si.quantite - (COALESCE(si.remise_montant, 0) * si.quantite)), 0) AS profitNetBon,
               1 AS bonCount
        FROM bons_sortie bs
        LEFT JOIN sortie_items si ON si.bon_sortie_id = bs.id
        LEFT JOIN products p ON p.id = si.product_id
        LEFT JOIN product_snapshot ps ON ps.id = si.product_snapshot_id
        LEFT JOIN product_variants pv ON pv.id = ${buildVariantIdExpr('si', 'ps')}
        LEFT JOIN product_units pu ON pu.id = si.unit_id
        WHERE LOWER(TRIM(COALESCE(bs.statut, ''))) IN ${VALID_STATUSES_SQL}
          AND COALESCE(bs.isNotCalculated, 0) <> 1
          AND COALESCE(bs.vendre_au_fournisseur, 0) = 1
          ${sortieFilter.sql}
        GROUP BY bs.id, day
      ) t
      GROUP BY day
      ORDER BY day DESC
    `;

    const avoirsClientSql = `
      SELECT day,
             SUM(totalBon) AS ca,
             SUM(profitNetBon) AS profitNet,
             SUM(profitBrutBon) AS profitBrut,
             SUM(remiseBon) AS remises
      FROM (
        SELECT DATE_FORMAT(ac.date_creation, '%Y-%m-%d') AS day,
               ac.id AS bon_id,
               ac.montant_total AS totalBon,
           COALESCE(SUM((ai.prix_unitaire - ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')}) * ai.quantite - (COALESCE(ai.remise_montant, 0) * ai.quantite)), 0) AS profitNetBon,
           COALESCE(SUM((ai.prix_unitaire - ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')}) * ai.quantite), 0) AS profitBrutBon,
               COALESCE(SUM(COALESCE(ai.remise_montant, 0) * ai.quantite), 0) AS remiseBon
        FROM avoirs_client ac
        LEFT JOIN avoir_client_items ai ON ai.avoir_client_id = ac.id
        LEFT JOIN products p ON p.id = ai.product_id
        LEFT JOIN product_snapshot ps ON ps.id = ai.product_snapshot_id
         LEFT JOIN product_variants pv ON pv.id = ${buildVariantIdExpr('ai', 'ps')}
        LEFT JOIN product_units pu ON pu.id = ai.unit_id
        WHERE LOWER(TRIM(COALESCE(ac.statut, ''))) IN ${VALID_STATUSES_SQL}
          AND COALESCE(ac.isNotCalculated, 0) <> 1
          ${avoirClientFilter.sql}
        GROUP BY ac.id, day
      ) t
      GROUP BY day
      ORDER BY day DESC
    `;

    const avoirsComptantSql = `
      SELECT day,
             SUM(totalBon) AS ca,
             SUM(profitNetBon) AS profitNet,
             SUM(profitBrutBon) AS profitBrut,
             SUM(remiseBon) AS remises
      FROM (
        SELECT DATE_FORMAT(ac2.date_creation, '%Y-%m-%d') AS day,
               ac2.id AS bon_id,
               ac2.montant_total AS totalBon,
           COALESCE(SUM((ai2.prix_unitaire - ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')}) * ai2.quantite - (COALESCE(ai2.remise_montant, 0) * ai2.quantite)), 0) AS profitNetBon,
           COALESCE(SUM((ai2.prix_unitaire - ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')}) * ai2.quantite), 0) AS profitBrutBon,
               COALESCE(SUM(COALESCE(ai2.remise_montant, 0) * ai2.quantite), 0) AS remiseBon
        FROM avoirs_comptant ac2
        LEFT JOIN avoir_comptant_items ai2 ON ai2.avoir_comptant_id = ac2.id
        LEFT JOIN products p ON p.id = ai2.product_id
        LEFT JOIN product_snapshot ps ON ps.id = ai2.product_snapshot_id
         LEFT JOIN product_variants pv ON pv.id = ${buildVariantIdExpr('ai2', 'ps')}
        LEFT JOIN product_units pu ON pu.id = ai2.unit_id
        WHERE LOWER(TRIM(COALESCE(ac2.statut, ''))) IN ${VALID_STATUSES_SQL}
          AND COALESCE(ac2.isNotCalculated, 0) <> 1
          ${avoirComptantFilter.sql}
        GROUP BY ac2.id, day
      ) t
      GROUP BY day
      ORDER BY day DESC
    `;

    const avoirsEcommerceSql = `
      SELECT day,
             SUM(totalBon) AS ca,
             SUM(profitNetBon) AS profitNet,
             SUM(profitBrutBon) AS profitBrut,
             SUM(remiseBon) AS remises
      FROM (
        SELECT DATE_FORMAT(ae.date_creation, '%Y-%m-%d') AS day,
               ae.id AS bon_id,
               ae.montant_total AS totalBon,
           COALESCE(SUM((i.prix_unitaire - ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')}) * i.quantite - (COALESCE(i.remise_montant, 0) * i.quantite)), 0) AS profitNetBon,
           COALESCE(SUM((i.prix_unitaire - ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')}) * i.quantite), 0) AS profitBrutBon,
               COALESCE(SUM(COALESCE(i.remise_montant, 0) * i.quantite), 0) AS remiseBon
        FROM avoirs_ecommerce ae
        LEFT JOIN avoir_ecommerce_items i ON i.avoir_ecommerce_id = ae.id
        LEFT JOIN products p ON p.id = i.product_id
        LEFT JOIN product_snapshot ps ON ps.id = i.product_snapshot_id
         LEFT JOIN product_variants pv ON pv.id = ${buildVariantIdExpr('i', 'ps')}
        LEFT JOIN product_units pu ON pu.id = i.unit_id
        WHERE LOWER(TRIM(COALESCE(ae.statut, ''))) IN ${VALID_STATUSES_SQL}
          AND COALESCE(ae.isNotCalculated, 0) <> 1
          ${buildDateFilter(filterArgs, 'ae').sql}
        GROUP BY ae.id, day
      ) t
      GROUP BY day
      ORDER BY day DESC
    `;

    const chargesSql = `
      SELECT DATE_FORMAT(bch.date_creation, '%Y-%m-%d') AS day,
             COALESCE(SUM(bch.montant_total), 0) AS total
      FROM bons_charge bch
      WHERE LOWER(TRIM(COALESCE(bch.statut, ''))) IN ${VALID_STATUSES_SQL}
        ${chargeFilter.sql}
      GROUP BY day
      ORDER BY day DESC
    `;

    const avoirsChargeSql = `
      SELECT DATE_FORMAT(ach.date_creation, '%Y-%m-%d') AS day,
             COALESCE(SUM(ach.montant_total), 0) AS total
      FROM avoirs_charge ach
      WHERE LOWER(TRIM(COALESCE(ach.statut, ''))) IN ${VALID_STATUSES_SQL}
        ${avoirChargeFilter.sql}
      GROUP BY day
      ORDER BY day DESC
    `;

    // Salaires mensuels dus, rattaches au dernier jour du mois.
    // Comptes comme une charge supplementaire dans le chiffre d'affaires.
    const vehiculeSql = `
      SELECT DATE_FORMAT(bv.date_creation, '%Y-%m-%d') AS day,
             COALESCE(SUM(bv.montant_total), 0) AS total
      FROM bons_vehicule bv
      WHERE LOWER(TRIM(COALESCE(bv.statut, ''))) IN ${VALID_STATUSES_SQL}
        AND COALESCE(bv.isNotCalculated, 0) <> 1
        ${vehiculeFilter.sql}
      GROUP BY day
      ORDER BY day DESC
    `;

    const commandesSql = `
      SELECT DATE_FORMAT(bcmd.date_creation, '%Y-%m-%d') AS day,
             COALESCE(SUM(bcmd.montant_total), 0) AS total
      FROM bons_commande bcmd
      WHERE LOWER(TRIM(COALESCE(bcmd.statut, ''))) IN ${VALID_STATUSES_SQL}
        AND COALESCE(bcmd.isNotCalculated, 0) <> 1
        ${commandeFilter.sql}
      GROUP BY day
      ORDER BY day DESC
    `;

    // Note: ventesSql also contains ecommerce_orders date filter; reuse the same filterArgs and buildDateFilter("o") params.
    // We must append those params after the other unions' params.
    const ecomFilter = buildDateFilter(filterArgs, 'o', 'created_at');
    const ventesParams = [...sortieFilter.params, ...comptantFilter.params, ...ecomFilter.params];
    const avoirsClientParams = [...avoirClientFilter.params];
    const avoirsComptantParams = [...avoirComptantFilter.params];
    const avoirsEcommerceParams = [...buildDateFilter(filterArgs, 'ae').params];
    const chargesParams = [...chargeFilter.params];
    const avoirsChargeParams = [...avoirChargeFilter.params];
    const vehiculeParams = [...vehiculeFilter.params];
    const commandesParams = [...commandeFilter.params];

    const [ventesRows] = await pool.query(ventesSql, ventesParams);
    const [ventesFournisseurRows] = await pool.query(ventesFournisseurSql, [...sortieFilter.params]);
    const [avoirsClientRows] = await pool.query(avoirsClientSql, avoirsClientParams);
    const [avoirsComptantRows] = await pool.query(avoirsComptantSql, avoirsComptantParams);
    const [avoirsEcommerceRows] = await pool.query(avoirsEcommerceSql, avoirsEcommerceParams);
    const [chargesRows] = await pool.query(chargesSql, chargesParams);
    const [avoirsChargeRows] = await pool.query(avoirsChargeSql, avoirsChargeParams);
    const salairesRows = await getMonthlySalaryDueRows(filterArgs);
    const [vehiculeRows] = await pool.query(vehiculeSql, vehiculeParams);
    const [commandesRows] = await pool.query(commandesSql, commandesParams);

    const ventesMap = rowsToMap(ventesRows, 'day');
    const ventesFournisseurMap = rowsToMap(ventesFournisseurRows, 'day');
    const avoirsClientMap = rowsToMap(avoirsClientRows, 'day');
    const avoirsComptantMap = rowsToMap(avoirsComptantRows, 'day');
    const avoirsEcommerceMap = rowsToMap(avoirsEcommerceRows, 'day');
    const chargesMap = rowsToMap(chargesRows, 'day');
    const avoirsChargeMap = rowsToMap(avoirsChargeRows, 'day');
    const salairesMap = rowsToMap(salairesRows, 'day');
    const vehiculeMap = rowsToMap(vehiculeRows, 'day');
    const commandesMap = rowsToMap(commandesRows, 'day');

    const days = new Set([
      ...Array.from(ventesMap.keys()),
      ...Array.from(ventesFournisseurMap.keys()),
      ...Array.from(avoirsClientMap.keys()),
      ...Array.from(avoirsComptantMap.keys()),
      ...Array.from(avoirsEcommerceMap.keys()),
      ...Array.from(chargesMap.keys()),
      ...Array.from(avoirsChargeMap.keys()),
      ...Array.from(salairesMap.keys()),
      ...Array.from(vehiculeMap.keys()),
      ...Array.from(commandesMap.keys()),
    ]);

    // UX: for day filter, always return that day even if no activity (0 totals)
    if (filterType === 'day' && date) {
      days.add(formatDayKey(date));
    }

    const dailyDataRaw = Array.from(days)
      .map((day) => {
        const v = ventesMap.get(day) || {};
        const vf = ventesFournisseurMap.get(day) || {};
        const aClient = avoirsClientMap.get(day) || {};
        const aComptant = avoirsComptantMap.get(day) || {};
        const aEcom = avoirsEcommerceMap.get(day) || {};
        const charge = chargesMap.get(day) || {};
        const avoirCharge = avoirsChargeMap.get(day) || {};
        const salaire = salairesMap.get(day) || {};
        const veh = vehiculeMap.get(day) || {};
        const cmd = commandesMap.get(day) || {};

        const ventesCA = roundSafe(v.ca);
        const avoirsCA = roundSafe(aClient.ca) + roundSafe(aComptant.ca) + roundSafe(aEcom.ca);
        const ventesProfitNet = roundSafe(v.profitNet);
        const avoirsProfitNet = roundSafe(aClient.profitNet) + roundSafe(aComptant.profitNet) + roundSafe(aEcom.profitNet);
        const ventesProfitBrut = roundSafe(v.profitBrut);
        const avoirsProfitBrut = roundSafe(aClient.profitBrut) + roundSafe(aComptant.profitBrut) + roundSafe(aEcom.profitBrut);
        const ventesRemises = roundSafe(v.remises);
        const avoirsRemises = roundSafe(aClient.remises) + roundSafe(aComptant.remises) + roundSafe(aEcom.remises);

        const vehiculeTotal = roundSafe(veh.total);
        const salaireTotal = roundSafe(salaire.total);
        // Salaries and vehicle vouchers count as charges.
        const chargesTotal = roundSafe(charge.total) + salaireTotal + vehiculeTotal;
        const avoirsChargeTotal = roundSafe(avoirCharge.total);
        const chargesNet = chargesTotal - avoirsChargeTotal;
        const achatsTotal = roundSafe(cmd.total);

        const profitSansCharges = ventesProfitNet - avoirsProfitNet;
        const profitNetApresCharges = profitSansCharges - chargesNet;
        const chiffreAffaires = ventesCA - avoirsCA - chargesNet;
        const chiffreAffairesAchat = ventesProfitNet - avoirsProfitNet - chargesNet;
        const chiffreAffairesAchatBrut = ventesProfitBrut - avoirsProfitBrut - chargesNet;
        const totalRemises = ventesRemises - avoirsRemises;

        return {
          date: formatDayKey(day),
          chiffreAffaires,
          chiffreAffairesAchat,
          chiffreAffairesAchatBrut,
          profitSansCharges,
          profitNetApresCharges,
          chiffreAchats: achatsTotal,
          totalVentesFournisseur: roundSafe(vf.ca),
          profitVentesFournisseur: roundSafe(vf.profitNet),
          totalRemises,
          totalCharges: chargesNet,
          totalChargesBrut: chargesTotal,
          totalAvoirsCharge: avoirsChargeTotal,
          totalSalaires: salaireTotal,
          totalBonsVehicule: vehiculeTotal,
        };
      })
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const dailyData =
      filterType === 'day'
        ? dailyDataRaw
        : dailyDataRaw.filter(
            (d) =>
              Math.abs(d.chiffreAffaires) > 0.01 ||
              Math.abs(d.chiffreAffairesAchat) > 0.01 ||
              Math.abs(d.chiffreAchats) > 0.01 ||
              Math.abs(d.totalCharges || 0) > 0.01 ||
              Math.abs(d.totalSalaires || 0) > 0.01 ||
              Math.abs(d.totalAvoirsCharge || 0) > 0.01 ||
              Math.abs(d.totalBonsVehicule || 0) > 0.01
          );

    const totalChiffreAffaires = dailyData.reduce((s, d) => s + roundSafe(d.chiffreAffaires), 0);
    const totalChiffreAffairesAchat = dailyData.reduce((s, d) => s + roundSafe(d.chiffreAffairesAchat), 0);
    const totalChiffreAchats = dailyData.reduce((s, d) => s + roundSafe(d.chiffreAchats), 0);
    const totalVentesFournisseur = Array.from(ventesFournisseurMap.values()).reduce((s, r) => s + roundSafe(r.ca), 0);
    const totalProfitVentesFournisseur = Array.from(ventesFournisseurMap.values()).reduce((s, r) => s + roundSafe(r.profitNet), 0);
    const totalSalaires = Array.from(salairesMap.values()).reduce((s, r) => s + roundSafe(r.total), 0);
    const totalBonsVehicule = Array.from(vehiculeMap.values()).reduce((s, r) => s + roundSafe(r.total), 0);
    const totalChargesBrut = Array.from(chargesMap.values()).reduce((s, r) => s + roundSafe(r.total), 0) + totalSalaires + totalBonsVehicule;
    const totalAvoirsCharge = Array.from(avoirsChargeMap.values()).reduce((s, r) => s + roundSafe(r.total), 0);
    const totalCharges = totalChargesBrut - totalAvoirsCharge;

    const totalRemisesVente = Array.from(ventesMap.values()).reduce((s, r) => s + roundSafe(r.remises), 0);
    const totalRemisesAvoirClient = Array.from(avoirsClientMap.values()).reduce((s, r) => s + roundSafe(r.remises), 0);
    const totalRemisesAvoirComptant = Array.from(avoirsComptantMap.values()).reduce((s, r) => s + roundSafe(r.remises), 0);
    const totalRemisesAvoirEcommerce = Array.from(avoirsEcommerceMap.values()).reduce((s, r) => s + roundSafe(r.remises), 0);
    const totalRemisesAvoir = totalRemisesAvoirClient + totalRemisesAvoirComptant + totalRemisesAvoirEcommerce;

    const totalBons = Array.from(ventesMap.values()).reduce((s, r) => s + roundSafe(r.bonCount), 0);

    // Optional debug block to understand "day returns 0" cases.
    // Only meaningful for filterType=day.
    let debugInfo;
    if (debug && filterType === 'day' && date) {
      const day = formatDayKey(date);
      const statusList = VALID_STATUSES_LOWER;

      const tables = [
        { name: 'bons_sortie', alias: 't', dateCol: 'date_creation', statutCol: 'statut', totalCol: 'montant_total' },
        { name: 'bons_comptant', alias: 't', dateCol: 'date_creation', statutCol: 'statut', totalCol: 'montant_total' },
        { name: 'avoirs_client', alias: 't', dateCol: 'date_creation', statutCol: 'statut', totalCol: 'montant_total' },
        { name: 'avoirs_comptant', alias: 't', dateCol: 'date_creation', statutCol: 'statut', totalCol: 'montant_total' },
        { name: 'bons_commande', alias: 't', dateCol: 'date_creation', statutCol: 'statut', totalCol: 'montant_total' },
        { name: 'bons_charge', alias: 't', dateCol: 'date_creation', statutCol: 'statut', totalCol: 'montant_total' },
        { name: 'avoirs_charge', alias: 't', dateCol: 'date_creation', statutCol: 'statut', totalCol: 'montant_total' },
        { name: 'bons_vehicule', alias: 't', dateCol: 'date_creation', statutCol: 'statut', totalCol: 'montant_total' },
        { name: 'ecommerce_orders', alias: 't', dateCol: 'created_at', statutCol: 'status', totalCol: 'total_amount' },
        { name: 'avoirs_ecommerce', alias: 't', dateCol: 'date_creation', statutCol: 'statut', totalCol: 'montant_total' },
      ];

      const perTable = {};
      for (const tb of tables) {
        const baseWhere = `DATE(${tb.alias}.${tb.dateCol}) = ?`;
        const withStatusWhere =
          tb.name === 'ecommerce_orders'
            ? `${baseWhere} AND LOWER(COALESCE(${tb.alias}.${tb.statutCol}, '')) NOT IN ${ECOMMERCE_EXCLUDED_STATUSES_SQL}`
            : `${baseWhere} AND LOWER(TRIM(COALESCE(${tb.alias}.${tb.statutCol}, ''))) IN ${VALID_STATUSES_SQL}`;
        const notCalcWhere = tb.name === 'bons_charge'
          ? withStatusWhere
          : `${withStatusWhere} AND COALESCE(${tb.alias}.isNotCalculated, 0) <> 1`;

        const q1 = await tryQuery(
          `SELECT COUNT(*) AS c, COALESCE(SUM(${tb.alias}.${tb.totalCol}),0) AS total FROM ${tb.name} ${tb.alias} WHERE ${baseWhere}`,
          [day]
        );
        const q2 = await tryQuery(
          `SELECT COUNT(*) AS c, COALESCE(SUM(${tb.alias}.${tb.totalCol}),0) AS total FROM ${tb.name} ${tb.alias} WHERE ${withStatusWhere}`,
          [day]
        );
        const q3 = await tryQuery(
          `SELECT COUNT(*) AS c, COALESCE(SUM(${tb.alias}.${tb.totalCol}),0) AS total FROM ${tb.name} ${tb.alias} WHERE ${notCalcWhere}`,
          [day]
        );
        const qStatuses = await tryQuery(
          `SELECT ${tb.alias}.${tb.statutCol} AS statut, COUNT(*) AS c FROM ${tb.name} ${tb.alias} WHERE ${baseWhere} GROUP BY ${tb.alias}.${tb.statutCol} ORDER BY c DESC`,
          [day]
        );

        perTable[tb.name] = {
          day,
          statusList,
          any: q1.ok ? q1.rows?.[0] : { error: q1.error },
          withStatus: q2.ok ? q2.rows?.[0] : { error: q2.error },
          withStatusNotCalculated: q3.ok ? q3.rows?.[0] : { error: q3.error },
          statutsFound: qStatuses.ok ? qStatuses.rows : { error: qStatuses.error },
        };
      }

      debugInfo = {
        filterType,
        requestedDate: date,
        normalizedDay: day,
        perTable,
      };
    }

    res.json({
      totalChiffreAffaires,
      totalChiffreAffairesAchat,
      totalChiffreAchats,
      totalVentesFournisseur,
      totalProfitVentesFournisseur,
      totalCharges,
      totalChargesBrut,
      totalAvoirsCharge,
      totalSalaires,
      totalBonsVehicule,
      totalBons,
      dailyData,
      totalRemisesNet: totalRemisesVente - totalRemisesAvoir,
      totalRemisesVente,
      totalRemisesAvoirClient,
      totalRemisesAvoirComptant,
      totalRemisesAvoirEcommerce,
      ...(debugInfo ? { debug: debugInfo } : {}),
    });
  } catch (error) {
    const msg = error?.message || 'Erreur du serveur';
    res.status(msg.includes('Missing') ? 400 : 500).json({ message: msg, error: error?.sqlMessage || msg });
  }
});

router.get('/chiffre-affaires/detail/:date', async (req, res) => {
  try {
    const selectedDate = String(req.params.date || '');
    if (!selectedDate) return res.status(400).json({ message: 'Missing date' });

    // Ensure consistent collations across UNION queries.
    // Some tables/columns may be utf8mb4 while connection literals default to another collation,
    // which can trigger: "Illegal mix of collations for operation 'UNION'".
    const UNION_COLLATION = 'utf8mb4_unicode_ci';

    const commonParams = [selectedDate];

        const ventesLinesSql = `
          SELECT ('Comptant' COLLATE ${UNION_COLLATION}) AS bonType,
            bc.id AS bonId,
           (CONCAT('COM', LPAD(bc.id, GREATEST(LENGTH(bc.id), 2), '0')) COLLATE ${UNION_COLLATION}) AS bonNumero,
            bc.montant_total AS totalBon,
           (COALESCE(ct_bc.nom_complet, bc.client_nom, '') COLLATE ${UNION_COLLATION}) AS contact_nom,
           (p.designation COLLATE ${UNION_COLLATION}) AS designation,
            ci.product_id AS product_id,
            ${buildVariantIdExpr('ci', 'ps')} AS variant_id,
            ci.unit_id AS unit_id,
           (pv.variant_name COLLATE ${UNION_COLLATION}) AS variant_name,
            pu.unit_name AS unit_name,
            ci.quantite AS quantite,
            ci.prix_unitaire AS prix_unitaire,
            ${buildBaseCoutRevientExpr('p', 'ps', 'pv')} AS cout_revient,
            ${buildBasePrixAchatExpr('p', 'ps', 'pv')} AS prix_achat,
            (ci.prix_unitaire * ci.quantite) AS montant_ligne,
            COALESCE(pu.conversion_factor, 1) AS conversion_factor,
            ((ci.prix_unitaire - ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')}) * ci.quantite) AS profitBrut,
            COALESCE(ci.remise_montant, 0) AS remise_unitaire,
            (COALESCE(ci.remise_montant, 0) * ci.quantite) AS remise_total,
            (((ci.prix_unitaire - ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')}) * ci.quantite) - (COALESCE(ci.remise_montant, 0) * ci.quantite)) AS profit
          FROM bons_comptant bc
          LEFT JOIN contacts ct_bc ON ct_bc.id = bc.client_id
          LEFT JOIN comptant_items ci ON ci.bon_comptant_id = bc.id
          LEFT JOIN products p ON p.id = ci.product_id
          LEFT JOIN product_snapshot ps ON ps.id = ci.product_snapshot_id
          LEFT JOIN product_units pu ON pu.id = ci.unit_id
          LEFT JOIN product_variants pv ON pv.id = ${buildVariantIdExpr('ci', 'ps')}
      WHERE LOWER(TRIM(COALESCE(bc.statut, ''))) IN ${VALID_STATUSES_SQL}
        AND COALESCE(bc.isNotCalculated, 0) <> 1
        AND DATE(bc.date_creation) = ?

            UNION ALL

            SELECT ((CASE WHEN COALESCE(bs.vendre_au_fournisseur, 0) = 1 THEN 'Vente Fournisseur' ELSE 'Sortie' END) COLLATE ${UNION_COLLATION}) AS bonType,
              bs.id AS bonId,
             (CONCAT(CASE WHEN COALESCE(bs.vendre_au_fournisseur, 0) = 1 THEN 'SORF' ELSE 'SOR' END, LPAD(bs.id, GREATEST(LENGTH(bs.id), 2), '0')) COLLATE ${UNION_COLLATION}) AS bonNumero,
              bs.montant_total AS totalBon,
             (COALESCE(ct_f.nom_complet, ct_bs.nom_complet, '') COLLATE ${UNION_COLLATION}) AS contact_nom,
             (p.designation COLLATE ${UNION_COLLATION}) AS designation,
              si.product_id AS product_id,
              ${buildVariantIdExpr('si', 'ps')} AS variant_id,
              si.unit_id AS unit_id,
             (pv.variant_name COLLATE ${UNION_COLLATION}) AS variant_name,
              pu.unit_name AS unit_name,
              si.quantite AS quantite,
              si.prix_unitaire AS prix_unitaire,
              ${buildBaseCoutRevientExpr('p', 'ps', 'pv')} AS cout_revient,
              ${buildBasePrixAchatExpr('p', 'ps', 'pv')} AS prix_achat,
              (si.prix_unitaire * si.quantite) AS montant_ligne,
              COALESCE(pu.conversion_factor, 1) AS conversion_factor,
              ((si.prix_unitaire - ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')}) * si.quantite) AS profitBrut,
              COALESCE(si.remise_montant, 0) AS remise_unitaire,
              (COALESCE(si.remise_montant, 0) * si.quantite) AS remise_total,
              (((si.prix_unitaire - ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')}) * si.quantite) - (COALESCE(si.remise_montant, 0) * si.quantite)) AS profit
            FROM bons_sortie bs
            LEFT JOIN contacts ct_bs ON ct_bs.id = bs.client_id
            LEFT JOIN contacts ct_f ON ct_f.id = bs.fournisseur_id
            LEFT JOIN sortie_items si ON si.bon_sortie_id = bs.id
            LEFT JOIN products p ON p.id = si.product_id
            LEFT JOIN product_snapshot ps ON ps.id = si.product_snapshot_id
            LEFT JOIN product_units pu ON pu.id = si.unit_id
            LEFT JOIN product_variants pv ON pv.id = ${buildVariantIdExpr('si', 'ps')}
      WHERE LOWER(TRIM(COALESCE(bs.statut, ''))) IN ${VALID_STATUSES_SQL}
        AND COALESCE(bs.isNotCalculated, 0) <> 1
        AND DATE(bs.date_creation) = ?

            UNION ALL

            SELECT ('Ecommerce' COLLATE ${UNION_COLLATION}) AS bonType,
              o.id AS bonId,
             (COALESCE(o.order_number, CONCAT('ECOM', LPAD(o.id, GREATEST(LENGTH(o.id), 2), '0'))) COLLATE ${UNION_COLLATION}) AS bonNumero,
              o.total_amount AS totalBon,
             (COALESCE(o.customer_name, '') COLLATE ${UNION_COLLATION}) AS contact_nom,
             (COALESCE(oi.product_name, p.designation) COLLATE ${UNION_COLLATION}) AS designation,
              oi.product_id AS product_id,
              COALESCE(oi.variant_id, ps.variant_id) AS variant_id,
              oi.unit_id AS unit_id,
             (COALESCE(oi.variant_name, pv.variant_name) COLLATE ${UNION_COLLATION}) AS variant_name,
              COALESCE(oi.unit_name, pu.unit_name) AS unit_name,
              oi.quantity AS quantite,
              oi.unit_price AS prix_unitaire,
              ${buildBaseCoutRevientExpr('p', 'ps', 'pv')} AS cout_revient,
              ${buildBasePrixAchatExpr('p', 'ps', 'pv')} AS prix_achat,
              COALESCE(oi.subtotal, (oi.unit_price * oi.quantity)) AS montant_ligne,
              COALESCE(pu.conversion_factor, 1) AS conversion_factor,
              ((oi.unit_price - ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')}) * oi.quantity) AS profitBrut,
              COALESCE(oi.remise_percent_applied, 0) AS remise_unitaire,
              COALESCE(oi.remise_amount, 0) AS remise_total,
              (((oi.unit_price - ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')}) * oi.quantity) - COALESCE(oi.remise_amount, 0)) AS profit
            FROM ecommerce_orders o
            LEFT JOIN ecommerce_order_items oi ON oi.order_id = o.id
            LEFT JOIN products p ON p.id = oi.product_id
            LEFT JOIN product_snapshot ps ON ps.id = oi.product_snapshot_id
            LEFT JOIN product_units pu ON pu.id = oi.unit_id
            LEFT JOIN product_variants pv ON pv.id = ${buildVariantIdExpr('oi', 'ps')}
      WHERE LOWER(COALESCE(o.status, '')) NOT IN ${ECOMMERCE_EXCLUDED_STATUSES_SQL}
        AND DATE(o.created_at) = ?
    `;

        const avoirsLinesSql = `
          SELECT ((CASE WHEN COALESCE(ac.vendre_au_fournisseur, 0) = 1 THEN 'Avoir Vente Fournisseur' ELSE 'Avoir' END) COLLATE ${UNION_COLLATION}) AS bonType,
            ac.id AS bonId,
           (CONCAT(CASE WHEN COALESCE(ac.vendre_au_fournisseur, 0) = 1 THEN 'AVVF' ELSE 'AVC' END, LPAD(ac.id, GREATEST(LENGTH(ac.id), 2), '0')) COLLATE ${UNION_COLLATION}) AS bonNumero,
            ac.montant_total AS totalBon,
           (COALESCE(ct_af.nom_complet, ct_ac.nom_complet, '') COLLATE ${UNION_COLLATION}) AS contact_nom,
           (p.designation COLLATE ${UNION_COLLATION}) AS designation,
            ai.product_id AS product_id,
            ${buildVariantIdExpr('ai', 'ps')} AS variant_id,
            ai.unit_id AS unit_id,
           (pv.variant_name COLLATE ${UNION_COLLATION}) AS variant_name,
            pu.unit_name AS unit_name,
            ai.quantite AS quantite,
            ai.prix_unitaire AS prix_unitaire,
            ${buildBaseCoutRevientExpr('p', 'ps', 'pv')} AS cout_revient,
            ${buildBasePrixAchatExpr('p', 'ps', 'pv')} AS prix_achat,
            (ai.prix_unitaire * ai.quantite) AS montant_ligne,
            COALESCE(pu.conversion_factor, 1) AS conversion_factor,
            ((ai.prix_unitaire - ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')}) * ai.quantite) AS profitBrut,
            COALESCE(ai.remise_montant, 0) AS remise_unitaire,
            (COALESCE(ai.remise_montant, 0) * ai.quantite) AS remise_total,
            (((ai.prix_unitaire - ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')}) * ai.quantite) - (COALESCE(ai.remise_montant, 0) * ai.quantite)) AS profit
          FROM avoirs_client ac
          LEFT JOIN contacts ct_ac ON ct_ac.id = ac.client_id
          LEFT JOIN contacts ct_af ON ct_af.id = ac.fournisseur_id
          LEFT JOIN avoir_client_items ai ON ai.avoir_client_id = ac.id
          LEFT JOIN products p ON p.id = ai.product_id
          LEFT JOIN product_snapshot ps ON ps.id = ai.product_snapshot_id
          LEFT JOIN product_units pu ON pu.id = ai.unit_id
          LEFT JOIN product_variants pv ON pv.id = ${buildVariantIdExpr('ai', 'ps')}
      WHERE LOWER(TRIM(COALESCE(ac.statut, ''))) IN ${VALID_STATUSES_SQL}
        AND COALESCE(ac.isNotCalculated, 0) <> 1
        AND DATE(ac.date_creation) = ?

            UNION ALL

            SELECT ('Avoir' COLLATE ${UNION_COLLATION}) AS bonType,
              ac2.id AS bonId,
             (CONCAT('AVCC', LPAD(ac2.id, GREATEST(LENGTH(ac2.id), 2), '0')) COLLATE ${UNION_COLLATION}) AS bonNumero,
              ac2.montant_total AS totalBon,
             (COALESCE(ac2.client_nom, '') COLLATE ${UNION_COLLATION}) AS contact_nom,
             (p.designation COLLATE ${UNION_COLLATION}) AS designation,
              ai2.product_id AS product_id,
              ${buildVariantIdExpr('ai2', 'ps')} AS variant_id,
              ai2.unit_id AS unit_id,
             (pv.variant_name COLLATE ${UNION_COLLATION}) AS variant_name,
              pu.unit_name AS unit_name,
              ai2.quantite AS quantite,
              ai2.prix_unitaire AS prix_unitaire,
              ${buildBaseCoutRevientExpr('p', 'ps', 'pv')} AS cout_revient,
              ${buildBasePrixAchatExpr('p', 'ps', 'pv')} AS prix_achat,
              (ai2.prix_unitaire * ai2.quantite) AS montant_ligne,
              COALESCE(pu.conversion_factor, 1) AS conversion_factor,
              ((ai2.prix_unitaire - ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')}) * ai2.quantite) AS profitBrut,
              COALESCE(ai2.remise_montant, 0) AS remise_unitaire,
              (COALESCE(ai2.remise_montant, 0) * ai2.quantite) AS remise_total,
              (((ai2.prix_unitaire - ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')}) * ai2.quantite) - (COALESCE(ai2.remise_montant, 0) * ai2.quantite)) AS profit
            FROM avoirs_comptant ac2
            LEFT JOIN avoir_comptant_items ai2 ON ai2.avoir_comptant_id = ac2.id
            LEFT JOIN products p ON p.id = ai2.product_id
            LEFT JOIN product_snapshot ps ON ps.id = ai2.product_snapshot_id
            LEFT JOIN product_units pu ON pu.id = ai2.unit_id
            LEFT JOIN product_variants pv ON pv.id = ${buildVariantIdExpr('ai2', 'ps')}
      WHERE LOWER(TRIM(COALESCE(ac2.statut, ''))) IN ${VALID_STATUSES_SQL}
        AND COALESCE(ac2.isNotCalculated, 0) <> 1
        AND DATE(ac2.date_creation) = ?

            UNION ALL

            SELECT ('Avoir Ecommerce' COLLATE ${UNION_COLLATION}) AS bonType,
              ae.id AS bonId,
             (COALESCE(ae.order_number, CONCAT('AWE', LPAD(ae.id, GREATEST(LENGTH(ae.id), 2), '0'))) COLLATE ${UNION_COLLATION}) AS bonNumero,
              ae.montant_total AS totalBon,
             (COALESCE(ae.customer_name, '') COLLATE ${UNION_COLLATION}) AS contact_nom,
             (p.designation COLLATE ${UNION_COLLATION}) AS designation,
              i.product_id AS product_id,
                    COALESCE(i.variant_id, ps.variant_id) AS variant_id,
              i.unit_id AS unit_id,
                   (pv.variant_name COLLATE ${UNION_COLLATION}) AS variant_name,
                    pu.unit_name AS unit_name,
              i.quantite AS quantite,
              i.prix_unitaire AS prix_unitaire,
              ${buildBaseCoutRevientExpr('p', 'ps', 'pv')} AS cout_revient,
              ${buildBasePrixAchatExpr('p', 'ps', 'pv')} AS prix_achat,
              (i.prix_unitaire * i.quantite) AS montant_ligne,
              COALESCE(pu.conversion_factor, 1) AS conversion_factor,
              ((i.prix_unitaire - ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')}) * i.quantite) AS profitBrut,
              COALESCE(i.remise_montant, 0) AS remise_unitaire,
              (COALESCE(i.remise_montant, 0) * i.quantite) AS remise_total,
              (((i.prix_unitaire - ${buildConvertedCostExpr('p', 'ps', 'pv', 'pu')}) * i.quantite) - (COALESCE(i.remise_montant, 0) * i.quantite)) AS profit
            FROM avoirs_ecommerce ae
            LEFT JOIN avoir_ecommerce_items i ON i.avoir_ecommerce_id = ae.id
            LEFT JOIN products p ON p.id = i.product_id
            LEFT JOIN product_snapshot ps ON ps.id = i.product_snapshot_id
            LEFT JOIN product_units pu ON pu.id = i.unit_id
            LEFT JOIN product_variants pv ON pv.id = ${buildVariantIdExpr('i', 'ps')}
      WHERE LOWER(TRIM(COALESCE(ae.statut, ''))) IN ${VALID_STATUSES_SQL}
        AND COALESCE(ae.isNotCalculated, 0) <> 1
        AND DATE(ae.date_creation) = ?
    `;

        const commandesLinesSql = `
          SELECT ('Commande' COLLATE ${UNION_COLLATION}) AS bonType,
         bcmd.id AS bonId,
        (CONCAT('CMD', LPAD(bcmd.id, GREATEST(LENGTH(bcmd.id), 2), '0')) COLLATE ${UNION_COLLATION}) AS bonNumero,
         bcmd.montant_total AS totalBon,
        (COALESCE(ct_cmd.nom_complet, '') COLLATE ${UNION_COLLATION}) AS contact_nom,
        (p.designation COLLATE ${UNION_COLLATION}) AS designation,
         ci.product_id AS product_id,
         ci.variant_id AS variant_id,
         ci.unit_id AS unit_id,
         NULL AS variant_name,
         NULL AS unit_name,
         ci.quantite AS quantite,
         ci.prix_unitaire AS prix_unitaire,
         NULL AS cout_revient,
         NULL AS prix_achat,
         COALESCE(ci.total, (ci.prix_unitaire * ci.quantite)) AS montant_ligne,
         NULL AS profitBrut,
         COALESCE(ci.remise_montant, 0) AS remise_unitaire,
         (COALESCE(ci.remise_montant, 0) * ci.quantite) AS remise_total,
         NULL AS profit
        FROM bons_commande bcmd
      LEFT JOIN contacts ct_cmd ON ct_cmd.id = bcmd.fournisseur_id
      LEFT JOIN commande_items ci ON ci.bon_commande_id = bcmd.id
      LEFT JOIN products p ON p.id = ci.product_id
      WHERE LOWER(TRIM(COALESCE(bcmd.statut, ''))) IN ${VALID_STATUSES_SQL}
        AND COALESCE(bcmd.isNotCalculated, 0) <> 1
        AND DATE(bcmd.date_creation) = ?
    `;

    const chargesLinesSql = `
      SELECT ('Charge' COLLATE ${UNION_COLLATION}) AS bonType,
        bch.id AS bonId,
        (CONCAT('CHG', LPAD(bch.id, GREATEST(LENGTH(bch.id), 2), '0')) COLLATE ${UNION_COLLATION}) AS bonNumero,
        bch.montant_total AS totalBon,
        (COALESCE(ct_bch.nom_complet, '') COLLATE ${UNION_COLLATION}) AS contact_nom,
        (COALESCE(NULLIF(chi.designation_custom, ''), p.designation) COLLATE ${UNION_COLLATION}) AS designation,
        chi.product_id AS product_id,
        ${buildVariantIdExpr('chi', 'ps')} AS variant_id,
        chi.unit_id AS unit_id,
        (pv.variant_name COLLATE ${UNION_COLLATION}) AS variant_name,
        pu.unit_name AS unit_name,
        chi.quantite AS quantite,
        chi.prix_achat AS prix_unitaire,
        ${buildBaseCoutRevientExpr('p', 'ps', 'pv')} AS cout_revient,
        chi.prix_achat AS prix_achat,
        COALESCE(chi.total, (chi.prix_achat * chi.quantite)) AS montant_ligne,
        COALESCE(pu.conversion_factor, 1) AS conversion_factor,
        -COALESCE(chi.total, (chi.prix_achat * chi.quantite)) AS profitBrut,
        COALESCE(chi.remise_montant, 0) AS remise_unitaire,
        (COALESCE(chi.remise_montant, 0) * chi.quantite) AS remise_total,
        -(COALESCE(chi.total, (chi.prix_achat * chi.quantite))) AS profit
      FROM bons_charge bch
      LEFT JOIN contacts ct_bch ON ct_bch.id = bch.client_id
      LEFT JOIN charge_items chi ON chi.bon_charge_id = bch.id
      LEFT JOIN products p ON p.id = chi.product_id
      LEFT JOIN product_snapshot ps ON ps.id = chi.product_snapshot_id
      LEFT JOIN product_units pu ON pu.id = chi.unit_id
      LEFT JOIN product_variants pv ON pv.id = ${buildVariantIdExpr('chi', 'ps')}
      WHERE LOWER(TRIM(COALESCE(bch.statut, ''))) IN ${VALID_STATUSES_SQL}
        AND DATE(bch.date_creation) = ?
    `;

    const avoirsChargeLinesSql = `
      SELECT ('Avoir Charge' COLLATE ${UNION_COLLATION}) AS bonType,
        ach.id AS bonId,
        (CONCAT('ACH', LPAD(ach.id, GREATEST(LENGTH(ach.id), 2), '0')) COLLATE ${UNION_COLLATION}) AS bonNumero,
        ach.montant_total AS totalBon,
        (COALESCE(ct_ach.nom_complet, '') COLLATE ${UNION_COLLATION}) AS contact_nom,
        (COALESCE(NULLIF(achi.designation_custom, ''), p.designation) COLLATE ${UNION_COLLATION}) AS designation,
        achi.product_id AS product_id,
        ${buildVariantIdExpr('achi', 'ps')} AS variant_id,
        achi.unit_id AS unit_id,
        (pv.variant_name COLLATE ${UNION_COLLATION}) AS variant_name,
        pu.unit_name AS unit_name,
        achi.quantite AS quantite,
        achi.prix_achat AS prix_unitaire,
        ${buildBaseCoutRevientExpr('p', 'ps', 'pv')} AS cout_revient,
        achi.prix_achat AS prix_achat,
        COALESCE(achi.total, (achi.prix_achat * achi.quantite)) AS montant_ligne,
        COALESCE(pu.conversion_factor, 1) AS conversion_factor,
        COALESCE(achi.total, (achi.prix_achat * achi.quantite)) AS profitBrut,
        COALESCE(achi.remise_montant, 0) AS remise_unitaire,
        (COALESCE(achi.remise_montant, 0) * achi.quantite) AS remise_total,
        COALESCE(achi.total, (achi.prix_achat * achi.quantite)) AS profit
      FROM avoirs_charge ach
      LEFT JOIN contacts ct_ach ON ct_ach.id = ach.client_id
      LEFT JOIN items_avoir_charge achi ON achi.avoir_charge_id = ach.id
      LEFT JOIN products p ON p.id = achi.product_id
      LEFT JOIN product_snapshot ps ON ps.id = achi.product_snapshot_id
      LEFT JOIN product_units pu ON pu.id = achi.unit_id
      LEFT JOIN product_variants pv ON pv.id = ${buildVariantIdExpr('achi', 'ps')}
      WHERE LOWER(TRIM(COALESCE(ach.statut, ''))) IN ${VALID_STATUSES_SQL}
        AND DATE(ach.date_creation) = ?
    `;

    const vehiculeSql = `
      SELECT bv.id AS bonId,
             (CONCAT('VEH', LPAD(bv.id, GREATEST(LENGTH(bv.id), 2), '0')) COLLATE ${UNION_COLLATION}) AS bonNumero,
             bv.montant_total AS totalBon
      FROM bons_vehicule bv
            WHERE LOWER(TRIM(COALESCE(bv.statut, ''))) IN ${VALID_STATUSES_SQL}
        AND COALESCE(bv.isNotCalculated, 0) <> 1
        AND DATE(bv.date_creation) = ?
    `;

    const [ventesLines] = await pool.query(ventesLinesSql, [selectedDate, selectedDate, selectedDate]);
    const [avoirsLines] = await pool.query(avoirsLinesSql, [selectedDate, selectedDate, selectedDate]);
    const [commandesLines] = await pool.query(commandesLinesSql, [selectedDate]);
    const [chargesLines] = await pool.query(chargesLinesSql, [selectedDate]);
    const [avoirsChargeLines] = await pool.query(avoirsChargeLinesSql, [selectedDate]);
    const [vehicules] = await pool.query(vehiculeSql, commonParams);

    // Salaires: only posted on the LAST DAY of the month. If the selected date is the
    // last day of its month, calculate the monthly salary due for that month.
    let salaireMonthTotal = 0;
    let salaireIsLastDay = false;
    try {
      const sel = new Date(`${selectedDate}T00:00:00`);
      if (!Number.isNaN(sel.getTime())) {
        const lastDayOfMonth = new Date(sel.getFullYear(), sel.getMonth() + 1, 0).getDate();
        salaireIsLastDay = sel.getDate() === lastDayOfMonth;
        if (salaireIsLastDay) {
          const monthKey = `${sel.getFullYear()}-${String(sel.getMonth() + 1).padStart(2, '0')}`;
          const salRows = await getMonthlySalaryDueRows({ filterType: 'month', month: monthKey });
          salaireMonthTotal = roundSafe(salRows?.[0]?.total);
        }
      }
    } catch (e) {
      console.error('detail salaires query:', e?.sqlMessage || e?.message);
      salaireMonthTotal = 0;
    }

    const buildCalculs = (lines) => {
      // NOTE: ids can collide across different tables (Comptant/Sortie/Ecommerce/Avoir/etc.).
      // Use a composite key so each document keeps its own header (bonType/bonNumero).
      const byBon = new Map();
      for (const l of lines || []) {
        const bonId = Number(l.bonId);
        const bonType = String(l.bonType || 'Autre');
        const mapKey = `${bonType}:${Number.isFinite(bonId) ? bonId : String(l.bonId)}`;

        if (!byBon.has(mapKey)) {
          byBon.set(mapKey, {
            bonId,
            bonNumero: l.bonNumero,
            bonType,
            contact_nom: l.contact_nom || null,
            items: [],
            totalBon: roundSafe(l.totalBon),
            profitBon: 0,
            totalRemiseBon: 0,
            netTotalBon: null,
          });
        }
        const rec = byBon.get(mapKey);

        const hasItemData = !(l.designation == null && l.quantite == null && l.prix_unitaire == null);
        if (!hasItemData) continue;

        const itemProfit = l.profit == null ? null : roundSafe(l.profit);
        const itemRemiseTotal = roundSafe(l.remise_total);

        rec.items.push({
          designation: l.designation || 'Produit sans nom',
          quantite: roundSafe(l.quantite),
          prix_unitaire: roundSafe(l.prix_unitaire),
          cout_revient: l.cout_revient == null ? undefined : roundSafe(l.cout_revient),
          prix_achat: l.prix_achat == null ? undefined : roundSafe(l.prix_achat),
          montant_ligne: roundSafe(l.montant_ligne),
          profit: itemProfit == null ? undefined : itemProfit,
          remise_unitaire: roundSafe(l.remise_unitaire),
          remise_total: itemRemiseTotal,
          profitBrut: l.profitBrut == null ? undefined : roundSafe(l.profitBrut),
          product_id: l.product_id == null ? undefined : Number(l.product_id),
          variant_id: l.variant_id == null ? undefined : Number(l.variant_id),
          unit_id: l.unit_id == null ? undefined : Number(l.unit_id),
          variant_name: l.variant_name || null,
          unit_name: l.unit_name || null,
          conversion_factor: l.conversion_factor == null ? undefined : roundSafe(l.conversion_factor),
        });

        if (itemProfit != null) rec.profitBon += itemProfit;
        rec.totalRemiseBon += itemRemiseTotal;
      }

      for (const rec of byBon.values()) {
        rec.netTotalBon = roundSafe(rec.totalBon) - roundSafe(rec.totalRemiseBon);
      }

      return Array.from(byBon.values()).sort((a, b) => String(b.bonNumero).localeCompare(String(a.bonNumero)));
    };

    const ventesCalculs = buildCalculs(ventesLines);
    const avoirsCalculs = buildCalculs(avoirsLines);
    const commandesCalculs = buildCalculs(commandesLines);
    const chargesDisplayCalculs = buildCalculs(chargesLines);
    const avoirsChargeDisplayCalculs = buildCalculs(avoirsChargeLines);
    const chargesCalculs = chargesDisplayCalculs.map((c) => ({
      ...c,
      totalBon: -roundSafe(c.totalBon),
      profitBon: -roundSafe(Math.abs(c.totalBon)),
      netTotalBon: -roundSafe(Math.abs(c.totalBon)),
      totalRemiseBon: roundSafe(c.totalRemiseBon),
      items: (c.items || []).map((item) => ({
        ...item,
        profitBrut: -roundSafe(item.montant_ligne),
        profit: -roundSafe(item.montant_ligne),
      })),
    }));
    const avoirsChargeCalculs = avoirsChargeDisplayCalculs.map((c) => ({
      ...c,
      totalBon: roundSafe(c.totalBon),
      profitBon: roundSafe(Math.abs(c.totalBon)),
      netTotalBon: roundSafe(Math.abs(c.totalBon)),
      totalRemiseBon: roundSafe(c.totalRemiseBon),
      items: (c.items || []).map((item) => ({
        ...item,
        profitBrut: roundSafe(item.montant_ligne),
        profit: roundSafe(item.montant_ligne),
      })),
    }));

    // Virtual "Salaires" charge document, only when the date is the last day of the month
    // and salaries are due that month. Counted as a charge (negative for CA/profit).
    const salaireCalculs = (salaireIsLastDay && salaireMonthTotal > 0)
      ? [{
          bonId: 0,
          bonNumero: 'SAL',
          bonType: 'Salaires',
          contact_nom: null,
          items: [{
            designation: 'Salaires du mois',
            quantite: 1,
            prix_unitaire: roundSafe(salaireMonthTotal),
            montant_ligne: roundSafe(salaireMonthTotal),
            profit: -roundSafe(salaireMonthTotal),
            profitBrut: -roundSafe(salaireMonthTotal),
            remise_unitaire: 0,
            remise_total: 0,
          }],
          totalBon: -roundSafe(salaireMonthTotal),
          profitBon: -roundSafe(salaireMonthTotal),
          netTotalBon: -roundSafe(salaireMonthTotal),
          totalRemiseBon: 0,
        }]
      : [];
    const vehiculeCalculs = (vehicules || []).map((v) => ({
      bonId: Number(v.bonId),
      bonNumero: v.bonNumero,
      bonType: 'Bon Vehicule',
      contact_nom: null,
      items: [],
      totalBon: -roundSafe(v.totalBon),
      profitBon: -roundSafe(v.totalBon),
      netTotalBon: -roundSafe(v.totalBon),
      totalRemiseBon: 0,
    }));

    const caNetCalculs = [
      ...ventesCalculs,
      ...avoirsCalculs.map((c) => ({ ...c, totalBon: -roundSafe(c.totalBon) })),
      ...chargesCalculs,
      ...avoirsChargeCalculs,
      ...salaireCalculs,
      ...vehiculeCalculs,
    ];
    const caNetTotal = caNetCalculs.reduce((s, c) => s + roundSafe(c.totalBon), 0);

    const beneficiaireCalculs = [
      ...ventesCalculs,
      ...avoirsCalculs.map((c) => ({ ...c, profitBon: -roundSafe(c.profitBon) })),
      ...chargesCalculs,
      ...avoirsChargeCalculs,
      ...(vehicules || []).map((v) => ({
        bonId: Number(v.bonId),
        bonNumero: v.bonNumero,
        bonType: 'Bon Véhicule',
        items: [],
        totalBon: -roundSafe(v.totalBon),
        profitBon: -roundSafe(v.totalBon),
      })),
      ...salaireCalculs,
    ];
    const beneficiaireTotal = beneficiaireCalculs.reduce((s, c) => s + roundSafe(c.profitBon), 0);

    const achatsTotal = commandesCalculs.reduce((s, c) => s + roundSafe(c.totalBon), 0);
    const avoirsChargeNetDisplayCalculs = avoirsChargeDisplayCalculs.map((c) => ({
      ...c,
      totalBon: -roundSafe(c.totalBon),
      profitBon: -roundSafe(Math.abs(c.totalBon)),
      netTotalBon: -roundSafe(Math.abs(c.totalBon)),
    }));
    const chargesSectionCalculs = [
      ...chargesDisplayCalculs,
      ...avoirsChargeNetDisplayCalculs,
      ...salaireCalculs,
      ...vehiculeCalculs,
    ];
    const chargesTotal = chargesSectionCalculs.reduce((s, c) => s + roundSafe(c.totalBon), 0);

    const chiffresDetail = [
      {
        type: 'CA_NET',
        title: "Chiffre d'Affaires Net",
        total: caNetTotal,
        bons: caNetCalculs.map((c) => ({ id: c.bonId })),
        calculs: caNetCalculs,
      },
      {
        type: 'BENEFICIAIRE',
        title: "Chiffre Bénéficiaire (Profits)",
        total: beneficiaireTotal,
        bons: beneficiaireCalculs.map((c) => ({ id: c.bonId })),
        calculs: beneficiaireCalculs,
      },
      {
        type: 'ACHATS',
        title: 'CA des Achats (Commandes)',
        total: achatsTotal,
        bons: commandesCalculs.map((c) => ({ id: c.bonId })),
        calculs: commandesCalculs,
      },
      {
        type: 'CHARGES',
        title: 'Charges nettes (Bons Charge + Salaires + Bons Vehicule - Avoirs Charge)',
        total: chargesTotal,
        bons: chargesSectionCalculs.map((c) => ({ id: c.bonId })),
        calculs: chargesSectionCalculs,
      },
    ];

    res.json(chiffresDetail);
  } catch (error) {
    console.error('GET /stats/chiffre-affaires/detail/:date error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

export default router;
