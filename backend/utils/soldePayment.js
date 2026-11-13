/**
 * "Payer mon solde" by card (CMI): a customer with a credit account (is_solde) pays part or all of what they owe.
 *
 * It reuses the whole CMI gateway of the shop (signed form, callback, browser return) with its own transaction table.
 * When the bank approves, ONE accounting line is created in `payments` (Client, mode Carte, status "En attente"):
 * the customer's balance goes down at once and the team validates the line like any other payment.
 */

const money = (n) => Math.round(Number(n) * 100) / 100;

export const MIN_SOLDE_PAYMENT = 1;
export const SOLDE_OID_PREFIX = 'SOLDE-';

export const isSoldeOid = (oid) => typeof oid === 'string' && oid.startsWith(SOLDE_OID_PREFIX);

/** Unique per attempt (CMI wants a new oid for each transaction); well under the 64 characters CMI allows. */
export const makeSoldeOid = (contactId, now = Date.now()) => `${SOLDE_OID_PREFIX}${Number(contactId)}-${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 64);

/** What the customer may pay: nothing above what they owe, at least 1 DH, the whole debt by default. */
export function validateSoldeAmount({ requested, owed }) {
  const due = money(owed);
  if (!(due > 0)) return { ok: false, status: 400, error_type: 'SOLDE_NOTHING_DUE', message: 'Aucun solde à régler' };
  const wanted = requested == null || requested === '' ? due : money(requested);
  if (!Number.isFinite(wanted) || wanted <= 0) return { ok: false, status: 400, error_type: 'SOLDE_AMOUNT_INVALID', message: 'Montant invalide' };
  if (wanted + 0.0001 < Math.min(MIN_SOLDE_PAYMENT, due)) {
    return { ok: false, status: 400, error_type: 'SOLDE_AMOUNT_TOO_LOW', message: `Montant minimum : ${MIN_SOLDE_PAYMENT} DH`, min: Math.min(MIN_SOLDE_PAYMENT, due) };
  }
  if (wanted - due > 0.005) {
    return { ok: false, status: 400, error_type: 'SOLDE_AMOUNT_TOO_HIGH', message: 'Le montant dépasse votre solde', owed: due };
  }
  return { ok: true, amount: Math.min(wanted, due) };
}

export function ensureSoldePaymentSchema(db) {
  return db.query(`
    CREATE TABLE IF NOT EXISTS solde_payment_transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
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
      payment_id INT NULL,
      callback_received_at DATETIME NULL,
      raw_response JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_solde_payment_oid (oid),
      KEY idx_solde_payment_contact (contact_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

const pick = (params, key, max) => {
  const v = params?.[key];
  return v == null || v === '' ? null : String(v).slice(0, max);
};

/**
 * The accounting line: a pending "Carte" payment of the customer. Falls back to "Virement" when the database
 * still has the old mode list without "Carte".
 */
export async function bookSoldePayment(connection, { contactId, amount, oid, transId }) {
  const designation = `Paiement du solde par carte CMI (${oid})`;
  const insert = (mode) =>
    connection.query(
      `INSERT INTO payments (numero, type_paiement, contact_id, montant_total, mode_paiement, date_paiement, designation, code_reglement, statut, created_at)
       VALUES ('', 'Client', ?, ?, ?, NOW(), ?, ?, 'En attente', NOW())`,
      [contactId, amount, mode, designation, transId || null]
    );
  let result;
  try {
    [result] = await insert('Carte');
  } catch (error) {
    if (!['WARN_DATA_TRUNCATED', 'ER_TRUNCATED_WRONG_VALUE', 'ER_WRONG_VALUE_FOR_TYPE'].includes(error?.code)) throw error;
    [result] = await insert('Virement');
  }
  await connection.query('UPDATE payments SET numero = CAST(id AS CHAR) WHERE id = ?', [result.insertId]);
  return result.insertId;
}

/**
 * The bank's answer for a "Payer mon solde" transaction (server callback or browser return). Same checks as orders:
 * known oid, same amount. An approval books the payment once (a second callback changes nothing).
 */
export async function processSoldeResult(pool, params, { source, approved, oid, hashValid, lang }) {
  const result = { hashValid, approved, orderFound: false, amountValid: false, order: null, lang, oid, solde: true, payment: null, tx: null };
  if (!hashValid || !oid) return result;
  const { cmiAmountsMatch } = await import('./cmiPayment.js');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT * FROM solde_payment_transactions WHERE oid = ? LIMIT 1 FOR UPDATE', [oid]);
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
        `UPDATE solde_payment_transactions SET status = ?, proc_return_code = ?, response = ?, err_msg = ?, trans_id = ?, auth_code = ?,
                masked_pan = ?, card_brand = ?, raw_response = ? WHERE id = ?`,
        [newStatus, pick(params, 'ProcReturnCode', 10), pick(params, 'Response', 20), pick(params, 'ErrMsg', 255), pick(params, 'TransId', 64), pick(params, 'AuthCode', 20),
          pick(params, 'MaskedPan', 25), pick(params, 'EXTRA.CARDBRAND', 30), JSON.stringify(params), tx.id]
      );
    }
    if (source === 'callback') await connection.query('UPDATE solde_payment_transactions SET callback_received_at = NOW() WHERE id = ?', [tx.id]);

    let paymentId = tx.payment_id;
    if (approved && !paymentId) {
      paymentId = await bookSoldePayment(connection, { contactId: tx.contact_id, amount: tx.amount, oid, transId: pick(params, 'TransId', 64) });
      await connection.query('UPDATE solde_payment_transactions SET payment_id = ? WHERE id = ?', [paymentId, tx.id]);
      result.payment = { id: paymentId, amount: Number(tx.amount), contact_id: tx.contact_id, first: true };
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
