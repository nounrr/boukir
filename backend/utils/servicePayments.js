/**
 * Money of a service request.
 *
 * - The client amount: what the shop receives. The back-office enters it before confirming the request; the
 *   client then pays whenever they want, by card (CMI, online) or by transfer / cheque / cash (the client says
 *   which, the team records the reception).
 * - The Maalem amount: what the Maalem receives for the mission, entered when the team assigns them. It becomes
 *   available once the team closes the mission (work checked), then the Maalem takes it in cash at the shop
 *   (recorded in the back-office) or moves it to their shopping balance (contacts.remise_balance) from the app.
 *
 * Everything lives in its own tables, so no existing table is altered.
 */

export const CLIENT_PAYMENT_METHODS = Object.freeze(['cmi', 'virement', 'cheque', 'especes']);
/** Methods the client picks themselves and the team then confirms (the card is paid online instead). */
export const OFFLINE_PAYMENT_METHODS = Object.freeze(['virement', 'cheque', 'especes']);
export const MAX_SERVICE_AMOUNT = 10_000_000;

export const SERVICE_PAY_OID_PREFIX = 'SRVPAY-';
export const isServicePayOid = (oid) => typeof oid === 'string' && oid.startsWith(SERVICE_PAY_OID_PREFIX);
/** Unique per attempt (CMI wants a new oid for each transaction), well under the 64 characters CMI allows. */
export const makeServicePayOid = (requestId, now = Date.now()) =>
  `${SERVICE_PAY_OID_PREFIX}${Number(requestId)}-${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 64);

export const roundMoney = (n) => Math.round(Number(n) * 100) / 100;

/** A positive amount in DH, at most 2 decimals ("1 250,50" and "1250.5" are accepted). */
export function validateAmount(value) {
  if (value == null || value === '') return { valid: false, error: 'Montant obligatoire' };
  const text = typeof value === 'number' ? String(value) : String(value).replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { valid: false, error: 'Montant invalide (2 décimales au plus)' };
  const amount = roundMoney(text);
  if (!(amount > 0)) return { valid: false, error: 'Le montant doit être supérieur à 0' };
  if (amount > MAX_SERVICE_AMOUNT) return { valid: false, error: 'Montant trop élevé' };
  return { valid: true, value: amount };
}

/** What the client sees of the billing (null when the shop has not set the amount yet). */
export function billingView(row) {
  if (!row) return null;
  return {
    amount: roundMoney(row.client_amount),
    method: row.payment_method || null,
    status: row.payment_status || 'unpaid',
    reference: row.payment_reference || null,
    declared_at: row.declared_at || null,
    paid_at: row.paid_at || null,
  };
}

/**
 * Where a Maalem's amount stands:
 * - pending: the mission is not closed yet (the amount shows as "to come"),
 * - available: the team closed it with this Maalem as the one who did the work,
 * - paid_cash / to_shop: already taken,
 * - void: this assignment was replaced or the request cancelled (never paid, hidden).
 */
export function earningState(row) {
  if (row.settlement_id) return row.settlement_kind === 'shop' ? 'to_shop' : 'paid_cash';
  const executedHere = row.executing_assignment_id != null && Number(row.executing_assignment_id) === Number(row.assignment_id);
  if (row.intervention_status === 'closed' && executedHere) return 'available';
  if (row.request_status === 'cancelled') return 'void';
  if (row.intervention_status === 'closed' && !executedHere) return 'void';
  if (row.unassigned_at) return 'void';
  return 'pending';
}

/** Totals for a Maalem's earnings list (void rows are left out). */
export function summarizeEarnings(rows) {
  const sum = { available: 0, pending: 0, paid_cash: 0, to_shop: 0 };
  for (const row of rows) {
    const state = row.state ?? earningState(row);
    if (state in sum) sum[state] = roundMoney(sum[state] + Number(row.amount));
  }
  return sum;
}

/** Checks a payout of `ids` against the rows read FOR UPDATE: every one must be this Maalem's and available. */
export function checkPayout(ids, rows, maalemProfileId) {
  const wanted = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!wanted.length) return { ok: false, status: 422, message: 'Choisissez au moins une mission' };
  const byId = new Map(rows.map((row) => [Number(row.id), row]));
  for (const id of wanted) {
    const row = byId.get(id);
    if (!row || Number(row.maalem_profile_id) !== Number(maalemProfileId)) return { ok: false, status: 404, message: 'Mission introuvable pour ce Maalem' };
    const state = earningState(row);
    if (state !== 'available') {
      return { ok: false, status: 409, message: state === 'pending' ? 'Une mission n’est pas encore clôturée par l’équipe' : 'Une mission est déjà payée' };
    }
  }
  const total = roundMoney(wanted.reduce((acc, id) => acc + Number(byId.get(id).amount), 0));
  return { ok: true, ids: wanted, total };
}

export async function ensureServicePaymentSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS service_request_billing (
      service_request_id INT NOT NULL PRIMARY KEY,
      client_amount DECIMAL(12,2) NOT NULL,
      payment_method ENUM('cmi','virement','cheque','especes') NULL,
      payment_status ENUM('unpaid','declared','paid') NOT NULL DEFAULT 'unpaid',
      payment_reference VARCHAR(120) NULL,
      declared_at DATETIME NULL,
      paid_at DATETIME NULL,
      paid_by_employee_id INT NULL,
      cmi_oid VARCHAR(64) NULL,
      amount_set_by_employee_id INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_service_billing_status (payment_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS service_payment_transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      service_request_id INT NOT NULL,
      contact_id INT NOT NULL,
      oid VARCHAR(64) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT '504',
      status ENUM('initiated','approved','declined','error') NOT NULL DEFAULT 'initiated',
      proc_return_code VARCHAR(10) NULL,
      response VARCHAR(20) NULL,
      err_msg VARCHAR(255) NULL,
      trans_id VARCHAR(64) NULL,
      auth_code VARCHAR(20) NULL,
      masked_pan VARCHAR(25) NULL,
      card_brand VARCHAR(30) NULL,
      callback_received_at DATETIME NULL,
      raw_response JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_service_payment_oid (oid),
      KEY idx_service_payment_request (service_request_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS maalem_settlements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      maalem_profile_id INT NOT NULL,
      kind ENUM('cash','shop') NOT NULL,
      total DECIMAL(12,2) NOT NULL,
      employee_id INT NULL,
      employee_name VARCHAR(255) NULL,
      note VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_maalem_settlements_profile (maalem_profile_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS service_maalem_earnings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      service_request_id INT NOT NULL,
      assignment_id INT NOT NULL,
      maalem_profile_id INT NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      settlement_id INT NULL,
      set_by_employee_id INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_maalem_earning_assignment (assignment_id),
      KEY idx_maalem_earning_profile (maalem_profile_id),
      KEY idx_maalem_earning_request (service_request_id),
      KEY idx_maalem_earning_settlement (settlement_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

/** The earnings with everything earningState needs (`where` filters on e.*, sra.*, sr.*). */
export function earningsSelect(where, { forUpdate = false } = {}) {
  return `SELECT e.id, e.service_request_id, e.assignment_id, e.maalem_profile_id, e.amount, e.settlement_id,
            e.created_at, st.kind AS settlement_kind, st.created_at AS settled_at, st.employee_name AS settled_by,
            sr.request_number, sr.status AS request_status, sra.unassigned_at,
            si.id AS intervention_id, si.status AS intervention_status, si.executing_assignment_id, si.closed_at,
            si.planned_date, COALESCE(svc.nom, mc.nom, sr.title) AS service_name,
            maalem.nom_complet AS maalem_name
     FROM service_maalem_earnings e
     INNER JOIN service_requests sr ON sr.id = e.service_request_id AND sr.deleted_at IS NULL
     INNER JOIN service_request_assignments sra ON sra.id = e.assignment_id
     INNER JOIN maalem_profiles mp ON mp.id = e.maalem_profile_id
     INNER JOIN contacts maalem ON maalem.id = mp.contact_id
     LEFT JOIN service_interventions si ON si.service_request_id = e.service_request_id
     LEFT JOIN services svc ON svc.id = COALESCE(sr.qualified_service_id, sr.service_id)
     LEFT JOIN maalem_categories mc ON mc.id = sr.qualified_category_id
     LEFT JOIN maalem_settlements st ON st.id = e.settlement_id
     WHERE ${where}
     ORDER BY COALESCE(si.closed_at, e.created_at) DESC, e.id DESC${forUpdate ? ' FOR UPDATE' : ''}`;
}

/** One earning row as the apps and the back-office see it. */
export function earningView(row) {
  return {
    id: Number(row.id),
    service_request_id: Number(row.service_request_id),
    assignment_id: Number(row.assignment_id),
    intervention_id: row.intervention_id == null ? null : Number(row.intervention_id),
    request_number: row.request_number,
    service_name: row.service_name || null,
    maalem_profile_id: Number(row.maalem_profile_id),
    maalem_name: row.maalem_name || null,
    amount: roundMoney(row.amount),
    state: earningState(row),
    closed_at: row.closed_at || null,
    planned_date: row.planned_date || null,
    settled_at: row.settled_at || null,
    settled_by: row.settled_by || null,
  };
}

/**
 * Records a payout (cash at the shop, or moved to the shopping balance) for earnings already read FOR UPDATE.
 * Returns the settlement id; the caller commits.
 */
export async function recordSettlement(connection, { maalemProfileId, kind, ids, total, employee = null, note = null }) {
  const [insert] = await connection.query(
    `INSERT INTO maalem_settlements (maalem_profile_id, kind, total, employee_id, employee_name, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [maalemProfileId, kind, total, employee?.id ?? null, employee?.name ?? null, note]
  );
  const settlementId = Number(insert.insertId);
  const [updated] = await connection.query(
    `UPDATE service_maalem_earnings SET settlement_id = ?
     WHERE id IN (${ids.map(() => '?').join(', ')}) AND settlement_id IS NULL`,
    [settlementId, ...ids]
  );
  if (Number(updated.affectedRows) !== ids.length) {
    const error = new Error('Une mission vient d’être payée par ailleurs');
    error.status = 409;
    throw error;
  }
  return settlementId;
}

const pick = (params, key, max) => {
  const v = params?.[key];
  return v == null || v === '' ? null : String(v).slice(0, max);
};

/**
 * The bank's answer for a service payment (server callback or browser return). Same checks as orders and the
 * balance: known oid, same amount. An approval marks the request paid once (a second callback changes nothing).
 */
export async function processServicePaymentResult(pool, params, { source, approved, oid, hashValid, lang }) {
  const result = { hashValid, approved, orderFound: false, amountValid: false, order: null, lang, oid, service: true, paid: null, tx: null };
  if (!hashValid || !oid) return result;
  const { cmiAmountsMatch } = await import('./cmiPayment.js');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT * FROM service_payment_transactions WHERE oid = ? LIMIT 1 FOR UPDATE', [oid]);
    const tx = rows[0];
    if (!tx) {
      await connection.rollback();
      return result;
    }
    result.orderFound = true;
    result.tx = tx;
    result.amountValid = cmiAmountsMatch(params.amount, tx.amount);
    if (!result.amountValid) {
      await connection.rollback();
      return result;
    }
    const newStatus = approved ? 'approved' : String(params.Response || '').toLowerCase() === 'error' ? 'error' : 'declined';
    const keepApproved = tx.status === 'approved' && !approved;
    if (!keepApproved) {
      await connection.query(
        `UPDATE service_payment_transactions SET status = ?, proc_return_code = ?, response = ?, err_msg = ?, trans_id = ?,
                auth_code = ?, masked_pan = ?, card_brand = ?, raw_response = ? WHERE id = ?`,
        [newStatus, pick(params, 'ProcReturnCode', 10), pick(params, 'Response', 20), pick(params, 'ErrMsg', 255), pick(params, 'TransId', 64),
          pick(params, 'AuthCode', 20), pick(params, 'MaskedPan', 25), pick(params, 'EXTRA.CARDBRAND', 30), JSON.stringify(params), tx.id]
      );
    }
    if (source === 'callback') await connection.query('UPDATE service_payment_transactions SET callback_received_at = NOW() WHERE id = ?', [tx.id]);
    if (approved) {
      const [marked] = await connection.query(
        `UPDATE service_request_billing
         SET payment_status = 'paid', payment_method = 'cmi', paid_at = NOW(), cmi_oid = ?, payment_reference = ?
         WHERE service_request_id = ? AND payment_status <> 'paid'`,
        [oid, pick(params, 'TransId', 64), tx.service_request_id]
      );
      if (Number(marked.affectedRows) === 1) {
        result.paid = { service_request_id: Number(tx.service_request_id), contact_id: Number(tx.contact_id), amount: roundMoney(tx.amount) };
      }
    }
    result.order = { order_number: null, payment_status: approved || tx.status === 'approved' ? 'paid' : 'pending' };
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}
