import crypto from 'node:crypto';
import { Router } from 'express';
import pool from '../../db/pool.js';
import {
  buildCmiPaymentForm,
  cmiAmountsMatch,
  cmiCallbackResponse,
  getCmiConfig,
  isCmiConfigured,
  isCmiPaymentApproved,
  normalizeCmiLang,
  verifyCmiHash,
} from '../../utils/cmiPayment.js';

// ==================== SCHEMA ====================

let schemaReady = null;

export function ensureCmiPaymentSchema(db = pool) {
  if (!schemaReady) {
    schemaReady = db.query(`
      CREATE TABLE IF NOT EXISTS ecommerce_payment_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        provider VARCHAR(20) NOT NULL DEFAULT 'cmi',
        oid VARCHAR(64) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        currency VARCHAR(3) NOT NULL DEFAULT '504',
        status ENUM('initiated','approved','declined','error') NOT NULL DEFAULT 'initiated',
        proc_return_code VARCHAR(10) NULL,
        response VARCHAR(20) NULL,
        err_code VARCHAR(50) NULL,
        err_msg VARCHAR(255) NULL,
        trans_id VARCHAR(64) NULL,
        auth_code VARCHAR(20) NULL,
        acq_stan VARCHAR(20) NULL,
        host_ref_num VARCHAR(32) NULL,
        md_status VARCHAR(4) NULL,
        tx_status VARCHAR(4) NULL,
        card_brand VARCHAR(30) NULL,
        card_issuer VARCHAR(100) NULL,
        masked_pan VARCHAR(25) NULL,
        trx_date VARCHAR(30) NULL,
        callback_received_at DATETIME NULL,
        callback_response VARCHAR(20) NULL,
        redirect_received_at DATETIME NULL,
        raw_response JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_payment_oid (provider, oid),
        KEY idx_payment_order (order_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

// ==================== HELPERS ====================

// Jeton qui permet au client (même invité) de consulter / relancer le paiement de SA commande
// sans exposer les commandes des autres à partir du seul numéro de commande.
export function cmiOrderToken(orderNumber, config = getCmiConfig()) {
  return crypto
    .createHmac('sha256', `cmi-order-token:${config.storeKey}`)
    .update(String(orderNumber))
    .digest('base64url')
    .slice(0, 32);
}

function isValidOrderToken(orderNumber, token, config) {
  if (!token || typeof token !== 'string' || !config.storeKey) return false;
  const expected = Buffer.from(cmiOrderToken(orderNumber, config));
  const received = Buffer.from(token);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

export function amountToPay(order) {
  const total = Number(order.total_amount || 0);
  const remise = Number(order.remise_used_amount || 0);
  return Math.max(0, Math.round((total - remise) * 100) / 100);
}

function pick(params, key, maxLength) {
  const value = params?.[key];
  if (value == null || value === '') return null;
  return String(value).slice(0, maxLength);
}

function resultUrl(config, { lang, status, orderNumber }) {
  const safeLang = ['fr', 'ar', 'en', 'zh'].includes(lang) ? lang : 'fr';
  const query = new URLSearchParams({ status });
  if (orderNumber) {
    query.set('order', orderNumber);
    query.set('token', cmiOrderToken(orderNumber, config));
  }
  return `${config.shopPublicUrl}/${safeLang}/checkout/payment-result?${query.toString()}`;
}

/**
 * Crée une tentative de paiement CMI pour la commande et renvoie le formulaire signé.
 * Le 1er essai utilise le numéro de commande comme oid ; les essais suivants ajoutent "-2", "-3"...
 * (l'oid doit être unique côté CMI pour chaque transaction).
 */
export async function createCmiPaymentForOrder(db, order, { locale } = {}) {
  await ensureCmiPaymentSchema(db);
  const config = getCmiConfig();
  const amount = amountToPay(order);

  const [[{ attempts }]] = await db.query(
    `SELECT COUNT(*) AS attempts FROM ecommerce_payment_transactions WHERE order_id = ? AND provider = 'cmi'`,
    [order.id]
  );
  const oid = Number(attempts) === 0 ? order.order_number : `${order.order_number}-${Number(attempts) + 1}`;
  const lang = normalizeCmiLang(locale);
  const token = cmiOrderToken(order.order_number, config);

  const form = buildCmiPaymentForm({
    oid,
    amount,
    locale,
    customerName: order.customer_name,
    customerEmail: order.customer_email,
    customerPhone: order.customer_phone,
    address: order.shipping_address_line1,
    city: order.shipping_city,
    postalCode: order.shipping_postal_code,
    // Le bouton "Annuler" de la page CMI ramène le client sur la page résultat avec son jeton.
    shopUrl: resultUrl(config, { lang, status: 'cancel', orderNumber: order.order_number }),
  }, config);

  await db.query(
    `INSERT INTO ecommerce_payment_transactions (order_id, provider, oid, amount, currency, status)
     VALUES (?, 'cmi', ?, ?, ?, 'initiated')`,
    [order.id, oid, amount, config.currency]
  );

  return { ...form, oid, token };
}

/**
 * Traite un résultat CMI (callback serveur ou retour navigateur okUrl/failUrl).
 * Contrôles imposés par CMI : HASH, oid connu, montant identique, ProcReturnCode = 00.
 */
async function processCmiResult(params, source) {
  const config = getCmiConfig();
  const hashValid = verifyCmiHash(params, config.storeKey);
  const approved = isCmiPaymentApproved(params);
  const oid = String(params?.oid || params?.ReturnOid || '').slice(0, 64);
  const lang = String(params?.lang || 'fr');

  const result = { hashValid, approved, orderFound: false, amountValid: false, order: null, lang, oid };
  if (!hashValid || !oid) return result;

  await ensureCmiPaymentSchema();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [txRows] = await connection.query(
      `SELECT * FROM ecommerce_payment_transactions WHERE provider = 'cmi' AND oid = ? LIMIT 1 FOR UPDATE`,
      [oid]
    );
    const tx = txRows[0];
    if (!tx) {
      await connection.rollback();
      return result;
    }

    const [orderRows] = await connection.query(
      `SELECT id, order_number, payment_status, total_amount, remise_used_amount
       FROM ecommerce_orders WHERE id = ? LIMIT 1 FOR UPDATE`,
      [tx.order_id]
    );
    const order = orderRows[0];
    if (!order) {
      await connection.rollback();
      return result;
    }

    result.orderFound = true;
    result.order = order;
    result.amountValid = cmiAmountsMatch(params.amount, tx.amount);

    if (!result.amountValid) {
      console.error('CMI: montant différent', { oid, received: params.amount, expected: tx.amount });
      await connection.rollback();
      return result;
    }

    const newStatus = approved
      ? 'approved'
      : String(params.Response || '').toLowerCase() === 'error' ? 'error' : 'declined';

    // Un échec reçu après un succès (même oid réutilisé, double callback...) ne doit pas écraser le succès.
    const keepApproved = tx.status === 'approved' && !approved;
    const isCallback = source === 'callback';
    const callbackResponse = isCallback
      ? cmiCallbackResponse({ ...result, approved, autoCapture: config.autoCapture })
      : null;

    if (!keepApproved) {
      await connection.query(
        `UPDATE ecommerce_payment_transactions SET
           status = ?, proc_return_code = ?, response = ?, err_code = ?, err_msg = ?,
           trans_id = ?, auth_code = ?, acq_stan = ?, host_ref_num = ?, md_status = ?, tx_status = ?,
           card_brand = ?, card_issuer = ?, masked_pan = ?, trx_date = ?, raw_response = ?
         WHERE id = ?`,
        [
          newStatus,
          pick(params, 'ProcReturnCode', 10),
          pick(params, 'Response', 20),
          pick(params, 'ErrCode', 50),
          pick(params, 'ErrMsg', 255),
          pick(params, 'TransId', 64),
          pick(params, 'AuthCode', 20),
          pick(params, 'acqStan', 20),
          pick(params, 'HostRefNum', 32),
          pick(params, 'mdStatus', 4),
          pick(params, 'txstatus', 4),
          pick(params, 'EXTRA.CARDBRAND', 30),
          pick(params, 'EXTRA.CARDISSUER', 100),
          pick(params, 'MaskedPan', 25),
          pick(params, 'EXTRA.TRXDATE', 30),
          JSON.stringify(params),
          tx.id,
        ]
      );
    }

    await connection.query(
      isCallback
        ? `UPDATE ecommerce_payment_transactions SET callback_received_at = NOW(), callback_response = ? WHERE id = ?`
        : `UPDATE ecommerce_payment_transactions SET redirect_received_at = NOW() WHERE id = ?`,
      isCallback ? [callbackResponse, tx.id] : [tx.id]
    );

    // Seul un paiement accepté modifie la commande (un échec la laisse en attente, cf. doc CMI).
    if (approved && order.payment_status !== 'paid') {
      await connection.query(
        `UPDATE ecommerce_orders SET payment_status = 'paid', updated_at = NOW() WHERE id = ?`,
        [order.id]
      );
      await connection.query(
        `INSERT INTO ecommerce_order_status_history (order_id, old_status, new_status, changed_by_type, notes)
         VALUES (?, ?, 'payment:paid', 'system', ?)`,
        [
          order.id,
          `payment:${order.payment_status}`,
          `Paiement carte CMI accepté (oid ${oid}, TransId ${params.TransId || '-'}, via ${isCallback ? 'callback' : 'retour client'})`,
        ]
      );
      order.payment_status = 'paid';
    }

    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback().catch(() => {});
    throw err;
  } finally {
    connection.release();
  }
}

// ==================== GATEWAY ROUTES (appelées par CMI) ====================
// Montées AVANT le middleware CORS : les retours navigateur viennent du domaine CMI.

export const cmiGatewayRouter = Router();

// Callback serveur à serveur : réponse texte ACTION=POSTAUTH / APPROVED / FAILURE.
cmiGatewayRouter.post('/callback', async (req, res) => {
  const params = req.body || {};
  let body = 'FAILURE';
  try {
    const result = await processCmiResult(params, 'callback');
    body = cmiCallbackResponse({ ...result, autoCapture: getCmiConfig().autoCapture });
    if (body === 'FAILURE') {
      console.error('CMI callback refusé', {
        oid: result.oid,
        hashValid: result.hashValid,
        orderFound: result.orderFound,
        amountValid: result.amountValid,
      });
    }
  } catch (err) {
    console.error('CMI callback erreur technique:', err);
    body = 'FAILURE';
  }
  res.type('text/plain').send(body);
});

async function handleBrowserReturn(req, res, expectedStatus) {
  const config = getCmiConfig();
  const params = req.body && Object.keys(req.body).length ? req.body : req.query;
  try {
    const result = await processCmiResult(params, 'redirect');
    let status = 'error';
    if (result.hashValid && result.orderFound && result.amountValid) {
      status = result.approved || result.order?.payment_status === 'paid' ? 'success' : 'failed';
    } else if (expectedStatus === 'failed' && !result.hashValid) {
      // Ex. test de certification "clé de hachage invalide" (3D-1004) : on affiche un échec.
      status = 'failed';
    }
    const orderNumber = result.order?.order_number
      || (status === 'failed' ? await findOrderNumberByOid(result.oid) : null);
    return res.redirect(303, resultUrl(config, { lang: result.lang, status, orderNumber }));
  } catch (err) {
    console.error('CMI retour client erreur:', err);
    return res.redirect(303, resultUrl(config, { lang: String(params?.lang || 'fr'), status: 'error' }));
  }
}

async function findOrderNumberByOid(oid) {
  if (!oid) return null;
  try {
    await ensureCmiPaymentSchema();
    const [rows] = await pool.query(
      `SELECT o.order_number FROM ecommerce_payment_transactions t
       JOIN ecommerce_orders o ON o.id = t.order_id
       WHERE t.provider = 'cmi' AND t.oid = ? LIMIT 1`,
      [oid]
    );
    return rows[0]?.order_number || null;
  } catch {
    return null;
  }
}

cmiGatewayRouter.post('/ok', (req, res) => handleBrowserReturn(req, res, 'success'));
cmiGatewayRouter.post('/fail', (req, res) => handleBrowserReturn(req, res, 'failed'));
cmiGatewayRouter.get('/ok', (req, res) => handleBrowserReturn(req, res, 'success'));
cmiGatewayRouter.get('/fail', (req, res) => handleBrowserReturn(req, res, 'failed'));

// ==================== SHOP ROUTES (appelées par l'ecom) ====================

const router = Router();

async function loadOrderForCustomer(req, orderNumber, token) {
  const [rows] = await pool.query(
    `SELECT id, order_number, user_id, customer_name, customer_email, customer_phone,
            shipping_address_line1, shipping_city, shipping_postal_code,
            total_amount, remise_used_amount, status, payment_status, payment_method, created_at
     FROM ecommerce_orders WHERE order_number = ? LIMIT 1`,
    [String(orderNumber || '').slice(0, 64)]
  );
  const order = rows[0];
  if (!order) return null;

  const config = getCmiConfig();
  const isOwner = req.user?.id && order.user_id && Number(req.user.id) === Number(order.user_id);
  if (!isOwner && !isValidOrderToken(order.order_number, token, config)) return null;
  return order;
}

// GET /api/ecommerce/payments/cmi/orders/:orderNumber?token=... -> état du paiement (page résultat)
router.get('/orders/:orderNumber', async (req, res, next) => {
  try {
    const order = await loadOrderForCustomer(req, req.params.orderNumber, req.query.token);
    if (!order) return res.status(404).json({ message: 'Commande introuvable' });

    await ensureCmiPaymentSchema();
    const [txRows] = await pool.query(
      `SELECT oid, amount, status, err_msg, trans_id, auth_code, card_brand, masked_pan, trx_date, updated_at
       FROM ecommerce_payment_transactions
       WHERE order_id = ? AND provider = 'cmi'
       ORDER BY (status = 'approved') DESC, id DESC
       LIMIT 1`,
      [order.id]
    );
    const tx = txRows[0] || null;

    res.json({
      order: {
        order_number: order.order_number,
        status: order.status,
        payment_status: order.payment_status,
        payment_method: order.payment_method,
        amount_to_pay: amountToPay(order),
        total_amount: Number(order.total_amount || 0),
        created_at: order.created_at,
        can_retry: order.payment_method === 'card'
          && order.payment_status !== 'paid'
          && !['cancelled', 'refunded'].includes(order.status),
      },
      transaction: tx && {
        oid: tx.oid,
        amount: Number(tx.amount),
        status: tx.status,
        error_message: tx.status === 'approved' ? null : tx.err_msg,
        trans_id: tx.trans_id,
        auth_code: tx.auth_code,
        card_brand: tx.card_brand,
        masked_pan: tx.masked_pan,
        trx_date: tx.trx_date,
        updated_at: tx.updated_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/ecommerce/payments/cmi/orders/:orderNumber/pay { token?, locale } -> nouveau formulaire signé
router.post('/orders/:orderNumber/pay', async (req, res, next) => {
  try {
    if (!isCmiConfigured()) {
      return res.status(503).json({ message: 'Paiement par carte indisponible', error_type: 'CMI_NOT_CONFIGURED' });
    }
    const order = await loadOrderForCustomer(req, req.params.orderNumber, req.body?.token);
    if (!order) return res.status(404).json({ message: 'Commande introuvable' });

    if (order.payment_method !== 'card' || order.payment_status === 'paid' || ['cancelled', 'refunded'].includes(order.status)) {
      return res.status(409).json({ message: 'Cette commande ne peut pas être payée par carte', error_type: 'CMI_NOT_PAYABLE' });
    }
    if (amountToPay(order) <= 0) {
      return res.status(409).json({ message: 'Aucun montant à payer', error_type: 'CMI_NOTHING_TO_PAY' });
    }

    const payment = await createCmiPaymentForOrder(pool, order, { locale: req.body?.locale });
    res.json({ cmi_payment: { url: payment.url, fields: payment.fields } });
  } catch (err) {
    next(err);
  }
});

export default router;
