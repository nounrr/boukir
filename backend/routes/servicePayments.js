import { Router } from 'express';
import pool from '../db/pool.js';
import { requireRoles } from '../middleware/auth.js';
import { canReceiveServiceAssignments } from '../utils/maalemAccess.js';
import { isEcommerceRequester } from '../utils/serviceRequest.js';
import {
  CLIENT_PAYMENT_METHODS,
  OFFLINE_PAYMENT_METHODS,
  billingView,
  checkPayout,
  earningsSelect,
  earningView,
  recordSettlement,
  roundMoney,
  summarizeEarnings,
  validateAmount,
} from '../utils/servicePayments.js';
import {
  contactLocale,
  maalemPayoutMessage,
  notifyCustomer,
  serviceAmountMessage,
  servicePaidMessage,
} from '../utils/customerNotify.js';

const STAFF = ['PDG', 'Manager', 'ManagerPlus'];

function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function fail(status, message, errors) {
  const error = new Error(message);
  error.status = status;
  if (errors) error.errors = errors;
  throw error;
}

const cleanText = (value, max) => {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
};

/** Notifications never block or undo the money operation that triggered them. */
function notifyLater(contactId, build, href) {
  if (!contactId) return;
  void (async () => {
    const locale = await contactLocale(contactId);
    await notifyCustomer(contactId, { kind: 'order', ...build(locale), href });
  })().catch(() => {});
}

async function loadEmployee(connection, employeeId) {
  const [rows] = await connection.query(
    'SELECT id, nom_complet FROM employees WHERE id = ? AND deleted_at IS NULL LIMIT 1', [employeeId]
  );
  if (!rows[0]) fail(403, 'Employé Back-office introuvable');
  return { id: Number(rows[0].id), name: rows[0].nom_complet || `Employé #${rows[0].id}` };
}

async function writeRequestEvent(connection, requestId, employee, eventType, oldValue, newValue) {
  await connection.query(
    `INSERT INTO service_request_history
       (request_id, event_type, old_value, new_value, actor_type, actor_employee_id, actor_name)
     VALUES (?, ?, ?, ?, 'EMPLOYEE', ?, ?)`,
    [requestId, eventType, oldValue == null ? null : JSON.stringify(oldValue), newValue == null ? null : JSON.stringify(newValue), employee.id, employee.name]
  );
}

async function loadRequestForUpdate(connection, requestId) {
  const [rows] = await connection.query(
    `SELECT id, request_number, status, requester_contact_id, current_assignment_id
     FROM service_requests WHERE id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE`, [requestId]
  );
  return rows[0] || null;
}

async function loadBillingForUpdate(connection, requestId) {
  const [rows] = await connection.query(
    'SELECT * FROM service_request_billing WHERE service_request_id = ? LIMIT 1 FOR UPDATE', [requestId]
  );
  return rows[0] || null;
}

// ---- Back-office, inside /api/admin/service-requests (the parent router already checks the roles) ----

export const adminServiceBillingRouter = Router();

// What the request costs the client, how it is paid, and what each assigned Maalem receives.
adminServiceBillingRouter.get('/:id(\\d+)/payments', async (req, res, next) => {
  try {
    const requestId = positiveId(req.params.id);
    const [[billingRows], [earnings]] = await Promise.all([
      pool.query('SELECT * FROM service_request_billing WHERE service_request_id = ? LIMIT 1', [requestId]),
      pool.query(earningsSelect('e.service_request_id = ?'), [requestId]),
    ]);
    const billing = billingRows[0];
    res.json({
      billing: billing ? { ...billingView(billing), paid_by_employee_id: billing.paid_by_employee_id ?? null } : null,
      earnings: earnings.map(earningView),
    });
  } catch (error) { next(error); }
});

// Sets or changes the client amount (until the request is paid). Required before "Confirmer la demande".
adminServiceBillingRouter.put('/:id(\\d+)/billing', async (req, res, next) => {
  const check = validateAmount(req.body?.client_amount);
  if (!check.valid) return res.status(422).json({ message: check.error, errors: { client_amount: check.error } });
  let connection;
  try {
    const requestId = positiveId(req.params.id);
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const employee = await loadEmployee(connection, req.user.id);
    const request = await loadRequestForUpdate(connection, requestId);
    if (!request) fail(404, 'Demande introuvable');
    if (request.status === 'cancelled') fail(409, 'Cette demande est annulée');
    const before = await loadBillingForUpdate(connection, requestId);
    if (before?.payment_status === 'paid') fail(409, 'Cette demande est déjà payée : le montant ne peut plus changer');
    if (before && roundMoney(before.client_amount) === check.value) {
      await connection.commit();
      return res.json({ billing: billingView(before) });
    }
    if (before) {
      await connection.query('UPDATE service_request_billing SET client_amount = ?, amount_set_by_employee_id = ? WHERE service_request_id = ?',
        [check.value, employee.id, requestId]);
    } else {
      await connection.query(`INSERT INTO service_request_billing (service_request_id, client_amount, amount_set_by_employee_id)
        VALUES (?, ?, ?)`, [requestId, check.value, employee.id]);
    }
    await writeRequestEvent(connection, requestId, employee, 'client_amount_set',
      before ? { client_amount: roundMoney(before.client_amount) } : null, { client_amount: check.value });
    await connection.commit();
    // The client hears about it once the request is confirmed (before that, the amount can still move;
    // the confirmation itself announces the amount).
    if (PAYABLE_REQUEST_STATUSES.includes(request.status)) {
      notifyLater(request.requester_contact_id, (locale) => serviceAmountMessage({ number: request.request_number, amount: check.value, locale }), `/service-requests/${requestId}`);
    }
    const [after] = await pool.query('SELECT * FROM service_request_billing WHERE service_request_id = ? LIMIT 1', [requestId]);
    res.json({ billing: billingView(after[0]) });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    next(error);
  } finally { connection?.release(); }
});

// The team received the transfer / cheque / cash (or a card payment recorded by hand).
adminServiceBillingRouter.post('/:id(\\d+)/billing/mark-paid', async (req, res, next) => {
  const method = req.body?.method;
  if (!CLIENT_PAYMENT_METHODS.includes(method)) return res.status(422).json({ message: 'Mode de paiement invalide' });
  const reference = cleanText(req.body?.reference, 120);
  let connection;
  try {
    const requestId = positiveId(req.params.id);
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const employee = await loadEmployee(connection, req.user.id);
    const request = await loadRequestForUpdate(connection, requestId);
    if (!request) fail(404, 'Demande introuvable');
    const billing = await loadBillingForUpdate(connection, requestId);
    if (!billing) fail(409, 'Saisissez d’abord le montant de la demande');
    if (billing.payment_status === 'paid') fail(409, 'Cette demande est déjà payée');
    await connection.query(`UPDATE service_request_billing SET payment_status = 'paid', payment_method = ?, payment_reference = ?,
      paid_at = NOW(), paid_by_employee_id = ? WHERE service_request_id = ?`, [method, reference, employee.id, requestId]);
    await writeRequestEvent(connection, requestId, employee, 'client_payment_received', null,
      { method, reference, amount: roundMoney(billing.client_amount) });
    await connection.commit();
    notifyLater(request.requester_contact_id, (locale) => servicePaidMessage({ number: request.request_number, amount: billing.client_amount, locale }), `/service-requests/${requestId}`);
    res.json({ message: 'Paiement enregistré' });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    next(error);
  } finally { connection?.release(); }
});

// Undo a reception recorded by mistake (a card payment approved by the bank cannot be undone here).
adminServiceBillingRouter.post('/:id(\\d+)/billing/mark-unpaid', async (req, res, next) => {
  let connection;
  try {
    const requestId = positiveId(req.params.id);
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const employee = await loadEmployee(connection, req.user.id);
    if (!await loadRequestForUpdate(connection, requestId)) fail(404, 'Demande introuvable');
    const billing = await loadBillingForUpdate(connection, requestId);
    if (billing?.payment_status !== 'paid') fail(409, 'Cette demande n’est pas marquée payée');
    if (billing.cmi_oid) fail(409, 'Un paiement par carte accepté par la banque ne peut pas être annulé ici');
    await connection.query(`UPDATE service_request_billing SET payment_status = 'unpaid', payment_reference = NULL,
      paid_at = NULL, paid_by_employee_id = NULL WHERE service_request_id = ?`, [requestId]);
    await writeRequestEvent(connection, requestId, employee, 'client_payment_cancelled',
      { method: billing.payment_method, reference: billing.payment_reference }, null);
    await connection.commit();
    res.json({ message: 'Paiement annulé' });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    next(error);
  } finally { connection?.release(); }
});

// Sets or changes what the current Maalem receives (until it is paid out).
adminServiceBillingRouter.put('/:id(\\d+)/maalem-amount', async (req, res, next) => {
  const check = validateAmount(req.body?.amount);
  if (!check.valid) return res.status(422).json({ message: check.error, errors: { maalem_amount: check.error } });
  let connection;
  try {
    const requestId = positiveId(req.params.id);
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const employee = await loadEmployee(connection, req.user.id);
    const request = await loadRequestForUpdate(connection, requestId);
    if (!request) fail(404, 'Demande introuvable');
    if (!request.current_assignment_id) fail(409, 'Affectez d’abord un Maalem');
    const [assignments] = await connection.query(
      'SELECT id, maalem_profile_id FROM service_request_assignments WHERE id = ? AND unassigned_at IS NULL LIMIT 1',
      [request.current_assignment_id]
    );
    const assignment = assignments[0];
    if (!assignment) fail(409, 'Affectation courante introuvable');
    const [existing] = await connection.query(
      'SELECT id, amount, settlement_id FROM service_maalem_earnings WHERE assignment_id = ? LIMIT 1 FOR UPDATE', [assignment.id]
    );
    if (existing[0]?.settlement_id) fail(409, 'Le Maalem a déjà reçu ce montant');
    if (existing[0]) {
      await connection.query('UPDATE service_maalem_earnings SET amount = ?, set_by_employee_id = ? WHERE id = ?',
        [check.value, employee.id, existing[0].id]);
    } else {
      await connection.query(`INSERT INTO service_maalem_earnings
        (service_request_id, assignment_id, maalem_profile_id, amount, set_by_employee_id) VALUES (?, ?, ?, ?, ?)`,
      [requestId, assignment.id, assignment.maalem_profile_id, check.value, employee.id]);
    }
    await writeRequestEvent(connection, requestId, employee, 'maalem_amount_set',
      existing[0] ? { maalem_amount: roundMoney(existing[0].amount) } : null, { maalem_amount: check.value, assignment_id: Number(assignment.id) });
    await connection.commit();
    res.json({ maalem_amount: check.value });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    next(error);
  } finally { connection?.release(); }
});

/** Inserts the Maalem amount of a new assignment, inside the assignment transaction. */
export async function saveAssignmentEarning(connection, { requestId, assignmentId, maalemProfileId, amount, employeeId }) {
  await connection.query(`INSERT INTO service_maalem_earnings
    (service_request_id, assignment_id, maalem_profile_id, amount, set_by_employee_id) VALUES (?, ?, ?, ?, ?)`,
  [requestId, assignmentId, maalemProfileId, amount, employeeId]);
}

// ---- Back-office: Maalem payouts, /api/admin/maalem-earnings ----

export const adminMaalemEarningsRouter = Router();
adminMaalemEarningsRouter.use(requireRoles(...STAFF));

// One line per Maalem with money: available to pay now, still to come, already paid.
adminMaalemEarningsRouter.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(earningsSelect('1 = 1'));
    const byMaalem = new Map();
    for (const row of rows.map(earningView)) {
      if (row.state === 'void') continue;
      const entry = byMaalem.get(row.maalem_profile_id) ?? { maalem_profile_id: row.maalem_profile_id, maalem_name: row.maalem_name, rows: [] };
      entry.rows.push(row);
      byMaalem.set(row.maalem_profile_id, entry);
    }
    const maalems = [...byMaalem.values()].map(({ rows: list, ...entry }) => ({
      ...entry, ...summarizeEarnings(list), available_count: list.filter((r) => r.state === 'available').length,
    })).sort((a, b) => b.available - a.available || String(a.maalem_name).localeCompare(String(b.maalem_name)));
    res.json({ maalems });
  } catch (error) { next(error); }
});

adminMaalemEarningsRouter.get('/:profileId(\\d+)', async (req, res, next) => {
  try {
    const profileId = positiveId(req.params.profileId);
    const [rows] = await pool.query(earningsSelect('e.maalem_profile_id = ?'), [profileId]);
    const earnings = rows.map(earningView).filter((row) => row.state !== 'void');
    const [settlements] = await pool.query(
      `SELECT id, kind, total, employee_name, note, created_at FROM maalem_settlements
       WHERE maalem_profile_id = ? ORDER BY created_at DESC, id DESC LIMIT 50`, [profileId]
    );
    res.json({
      maalem_profile_id: profileId,
      maalem_name: rows[0]?.maalem_name ?? null,
      summary: summarizeEarnings(earnings),
      earnings,
      settlements: settlements.map((s) => ({ ...s, id: Number(s.id), total: roundMoney(s.total) })),
    });
  } catch (error) { next(error); }
});

// The Maalem came to the shop: pay one or several available missions in cash.
adminMaalemEarningsRouter.post('/settle', async (req, res, next) => {
  const profileId = positiveId(req.body?.maalem_profile_id);
  if (!profileId) return res.status(422).json({ message: 'Maalem invalide' });
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const employee = await loadEmployee(connection, req.user.id);
    const ids = (Array.isArray(req.body?.earning_ids) ? req.body.earning_ids : []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0);
    if (!ids.length) fail(422, 'Choisissez au moins une mission');
    const [rows] = await connection.query(earningsSelect(`e.id IN (${ids.map(() => '?').join(', ')})`, { forUpdate: true }), ids);
    const payout = checkPayout(ids, rows, profileId);
    if (!payout.ok) fail(payout.status, payout.message);
    const settlementId = await recordSettlement(connection, {
      maalemProfileId: profileId, kind: 'cash', ids: payout.ids, total: payout.total, employee, note: cleanText(req.body?.note, 255),
    });
    const [profiles] = await connection.query('SELECT contact_id FROM maalem_profiles WHERE id = ? LIMIT 1', [profileId]);
    await connection.commit();
    notifyLater(profiles[0]?.contact_id, (locale) => maalemPayoutMessage({ amount: payout.total, kind: 'cash', locale }), '/maalem-missions/earnings');
    res.status(201).json({ settlement_id: settlementId, total: payout.total, count: payout.ids.length });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    next(error);
  } finally { connection?.release(); }
});

// ---- Client, inside /api/service-requests ----

export const clientServicePaymentRouter = Router();
clientServicePaymentRouter.use((req, res, next) => {
  if (!isEcommerceRequester(req.user)) return res.status(403).json({ message: 'Compte e-commerce authentifié requis', error_type: 'ECOMMERCE_ACCOUNT_REQUIRED' });
  return next();
});

async function loadOwnedRequest(db, requestId, contactId, forUpdate = false) {
  const [rows] = await db.query(
    `SELECT id, request_number, status FROM service_requests
     WHERE id = ? AND requester_contact_id = ? AND deleted_at IS NULL LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [requestId, contactId]
  );
  return rows[0] || null;
}

/** The client can pay from the confirmation on (never a request still being qualified, nor a cancelled one). */
export const PAYABLE_REQUEST_STATUSES = Object.freeze(['confirmed', 'assigned', 'scheduled', 'to_do', 'en_route', 'arrived', 'work_in_progress', 'completed', 'closed']);

clientServicePaymentRouter.get('/:id(\\d+)/payment', async (req, res, next) => {
  try {
    const requestId = positiveId(req.params.id);
    const request = await loadOwnedRequest(pool, requestId, Number(req.user.id));
    if (!request) return res.status(404).json({ message: 'Demande introuvable' });
    const [rows] = await pool.query('SELECT * FROM service_request_billing WHERE service_request_id = ? LIMIT 1', [requestId]);
    const payable = PAYABLE_REQUEST_STATUSES.includes(request.status);
    res.json({ billing: payable ? billingView(rows[0]) : null, methods: CLIENT_PAYMENT_METHODS });
  } catch (error) { next(error); }
});

// The client says how they will pay (transfer / cheque / cash); the team then records the reception.
clientServicePaymentRouter.post('/:id(\\d+)/payment/method', async (req, res, next) => {
  const method = req.body?.method;
  if (!OFFLINE_PAYMENT_METHODS.includes(method)) return res.status(422).json({ message: 'Mode de paiement invalide' });
  let connection;
  try {
    const requestId = positiveId(req.params.id);
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const request = await loadOwnedRequest(connection, requestId, Number(req.user.id), true);
    if (!request) fail(404, 'Demande introuvable');
    if (!PAYABLE_REQUEST_STATUSES.includes(request.status)) fail(409, 'Le paiement s’ouvre une fois la demande confirmée');
    const billing = await loadBillingForUpdate(connection, requestId);
    if (!billing) fail(409, 'Le montant n’est pas encore fixé');
    if (billing.payment_status === 'paid') fail(409, 'Cette demande est déjà payée');
    await connection.query(`UPDATE service_request_billing SET payment_method = ?, payment_status = 'declared', declared_at = NOW()
      WHERE service_request_id = ?`, [method, requestId]);
    await connection.query(
      `INSERT INTO service_request_history (request_id, event_type, new_value, actor_type, actor_contact_id, actor_name)
       VALUES (?, 'client_payment_method_chosen', ?, 'CONTACT', ?, 'Client')`,
      [requestId, JSON.stringify({ method }), Number(req.user.id)]
    );
    await connection.commit();
    const [after] = await pool.query('SELECT * FROM service_request_billing WHERE service_request_id = ? LIMIT 1', [requestId]);
    res.json({ billing: billingView(after[0]) });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    next(error);
  } finally { connection?.release(); }
});

// ---- Maalem, inside /api/maalem-missions ----

export const maalemEarningsRouter = Router();

async function loadActiveMaalem(db, contactId) {
  const [rows] = await db.query(
    `SELECT mp.id, mp.contact_id, mp.status, mp.deleted_at, c.deleted_at AS contact_deleted_at, c.is_active, c.is_blocked
     FROM maalem_profiles mp INNER JOIN contacts c ON c.id = mp.contact_id WHERE mp.contact_id = ? LIMIT 1`, [contactId]
  );
  const row = rows[0];
  if (!row || row.deleted_at || row.contact_deleted_at || !canReceiveServiceAssignments(row)
      || Number(row.is_active ?? 1) !== 1 || Number(row.is_blocked ?? 0) === 1) {
    fail(403, 'Accès réservé au Maalem approuvé et actif');
  }
  return { id: Number(row.id), contactId: Number(row.contact_id) };
}

maalemEarningsRouter.get('/earnings', async (req, res, next) => {
  try {
    const maalem = await loadActiveMaalem(pool, req.user?.id);
    const [rows] = await pool.query(earningsSelect('e.maalem_profile_id = ?'), [maalem.id]);
    const earnings = rows.map(earningView).filter((row) => row.state !== 'void')
      .map(({ maalem_name: _name, maalem_profile_id: _profile, ...row }) => row);
    res.json({ summary: summarizeEarnings(earnings), earnings });
  } catch (error) { next(error); }
});

// The Maalem moves available missions to their shopping balance (spent at checkout like the points earned).
maalemEarningsRouter.post('/earnings/to-shop', async (req, res, next) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const maalem = await loadActiveMaalem(connection, req.user?.id);
    const ids = (Array.isArray(req.body?.earning_ids) ? req.body.earning_ids : []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0);
    if (!ids.length) fail(422, 'Choisissez au moins une mission');
    const [rows] = await connection.query(earningsSelect(`e.id IN (${ids.map(() => '?').join(', ')})`, { forUpdate: true }), ids);
    const payout = checkPayout(ids, rows, maalem.id);
    if (!payout.ok) fail(payout.status, payout.message);
    const settlementId = await recordSettlement(connection, { maalemProfileId: maalem.id, kind: 'shop', ids: payout.ids, total: payout.total });
    await connection.query('UPDATE contacts SET remise_balance = COALESCE(remise_balance, 0) + ? WHERE id = ?', [payout.total, maalem.contactId]);
    const [balances] = await connection.query('SELECT COALESCE(remise_balance, 0) AS remise_balance FROM contacts WHERE id = ? LIMIT 1', [maalem.contactId]);
    await connection.commit();
    notifyLater(maalem.contactId, (locale) => maalemPayoutMessage({ amount: payout.total, kind: 'shop', locale }), '/remise');
    res.status(201).json({ settlement_id: settlementId, total: payout.total, remise_balance: roundMoney(balances[0]?.remise_balance ?? 0) });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    next(error);
  } finally { connection?.release(); }
});
