/**
 * Codes sent by e-mail or SMS for customer accounts (mounted under /api/users/auth):
 *   POST /register/start      checks the sign-up and sends a code to the e-mail or phone chosen to sign up with
 *   POST /register/confirm    the right code creates the account (that address is then confirmed) and signs in
 *   POST /code/resend         a new code for the same request
 *   POST /password/forgot     the confirmed addresses an account can reset its password with (masked)
 *   POST /password/forgot/send   sends a reset code to the one chosen
 *   POST /password/reset      the right code sets the new password and signs in
 *   POST /verify/send         (signed in) sends a code to confirm the account's e-mail or phone
 *   POST /verify/confirm      (signed in) the right code marks it confirmed
 * A forgotten password can only be reset through an address that was confirmed.
 */
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db/pool.js';
import { getJwtSecret } from '../middleware/auth.js';
import {
  addressTaken,
  checkRegistration,
  createLocalAccount,
  generateCustomerToken,
  registrationAnswer,
} from '../utils/customerAccount.js';
import {
  checkCode,
  codeMessage,
  CODE_TTL_MINUTES,
  isValidEmail,
  maskEmail,
  maskPhone,
  normalizePhone,
  phoneVariants,
  RESEND_AFTER_SECONDS,
  resetChannels,
} from '../utils/otp.js';
import { availableChannels, deliverCode } from '../utils/otpDelivery.js';
import { consume, countAttempt, createCode, ensureOtpSchema, findRequest, otpSecret } from '../utils/otpStore.js';

const router = Router();

const clientIp = (req) => String(req.ip || req.headers['x-forwarded-for'] || '').slice(0, 64) || null;
const masked = (channel, target) => (channel === 'email' ? maskEmail(target) : maskPhone(target));

const WRONG_CODE = {
  NOT_FOUND: { status: 400, message: 'Cette demande de code est introuvable. Demandez un nouveau code.' },
  USED: { status: 400, message: 'Ce code a déjà été utilisé ou remplacé. Demandez un nouveau code.' },
  EXPIRED: { status: 400, message: 'Ce code a expiré. Demandez un nouveau code.' },
  TOO_MANY: { status: 429, message: 'Trop de codes erronés. Demandez un nouveau code.' },
  WRONG: { status: 400, message: 'Code incorrect.' },
};

/** Creates and sends a code; answers the request itself on refusal and returns null, otherwise the sent request. */
async function sendCode(req, res, { purpose, channel, target, contactId = null, payload = null, name = null }) {
  const created = await createCode({ purpose, channel, target, contactId, payload, ip: clientIp(req) });
  if (created.blocked) {
    res.status(429).json({
      message: `Trop de codes demandés. Réessayez dans ${created.retry_after < 120 ? `${created.retry_after} secondes` : `${Math.ceil(created.retry_after / 60)} minutes`}.`,
      error_type: 'TOO_MANY_CODES',
      retry_after: created.retry_after,
    });
    return null;
  }
  const message = codeMessage({ code: created.code, purpose, locale: req.body?.locale, name });
  try {
    await deliverCode({ channel, target, message });
  } catch (err) {
    await consume((await findRequest(created.request_id)).id);
    res.status(err.status || 502).json({ message: err.message, error_type: err.code || 'DELIVERY_FAILED', channel });
    return null;
  }
  return {
    request_id: created.request_id,
    channel,
    masked: masked(channel, target),
    expires_in: CODE_TTL_MINUTES * 60,
    resend_in: RESEND_AFTER_SECONDS,
  };
}

/** Checks the typed code; answers the request itself when it is wrong and returns false. */
async function codeAccepted(res, request, code, db) {
  const result = checkCode(request, code, otpSecret());
  if (result.ok) return true;
  if (result.reason === 'WRONG') await countAttempt(request.id, db);
  const info = WRONG_CODE[result.reason];
  res.status(info.status).json({
    message: result.reason === 'WRONG' && result.attempts_left != null
      ? `${info.message} ${result.attempts_left > 0 ? `Encore ${result.attempts_left} essai${result.attempts_left > 1 ? 's' : ''}.` : 'Demandez un nouveau code.'}`
      : info.message,
    error_type: `CODE_${result.reason}`,
    field: 'code',
    attempts_left: result.attempts_left,
  });
  return false;
}

/** The customer account (with a password) behind an e-mail or a phone number. */
async function findAccount(identifier, db = pool) {
  const id = String(identifier || '').trim();
  if (!id) return null;
  const byPhone = !id.includes('@');
  if (byPhone && !normalizePhone(id)) return null;
  if (!byPhone && !isValidEmail(id)) return null;
  const [rows] = await db.query(
    `SELECT id, prenom, email, telephone, auth_provider, password, email_verified, phone_verified, is_active, is_blocked
     FROM contacts
     WHERE ${byPhone ? "REPLACE(REPLACE(REPLACE(telephone, ' ', ''), '-', ''), '.', '') IN (?)" : 'email = ?'}
       AND deleted_at IS NULL AND auth_provider != 'none'
     ORDER BY (auth_provider = 'local') DESC, ${byPhone ? 'phone_verified' : 'email_verified'} DESC, id ASC
     LIMIT 1`,
    [byPhone ? phoneVariants(id) : id.toLowerCase()],
  );
  return rows[0] || null;
}

function signedIn(user, message) {
  return {
    message,
    token: generateCustomerToken(user),
    user: {
      id: user.id,
      prenom: user.prenom,
      nom: user.nom,
      email: user.email,
      telephone: user.telephone,
      type_compte: user.type_compte,
      auth_provider: user.auth_provider,
      email_verified: !!user.email_verified,
      phone_verified: !!user.phone_verified,
      avatar_url: user.avatar_url,
      locale: user.locale,
      demande_artisan: !!user.demande_artisan,
      artisan_approuve: !!user.artisan_approuve,
    },
  };
}

/* ------------------------------------------------------------------ sign-up */

router.post('/register/start', async (req, res, next) => {
  try {
    await ensureOtpSchema();
    const method = req.body?.method === 'phone' ? 'phone' : 'email';
    const checked = await checkRegistration(pool, req.body, method);
    if (checked.error) return res.status(checked.error.status).json(checked.error.body);
    const target = method === 'email' ? checked.data.email : checked.data.telephone;
    const sent = await sendCode(req, res, {
      purpose: 'register',
      channel: method,
      target,
      payload: { data: checked.data },
      name: checked.data.prenom,
    });
    if (sent) res.json(sent);
  } catch (err) {
    next(err);
  }
});

router.post('/register/confirm', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    await ensureOtpSchema(connection);
    await connection.beginTransaction();
    const request = await findRequest(req.body?.request_id, connection, { lock: true });
    if (request && request.purpose !== 'register') {
      await connection.rollback();
      return res.status(400).json({ message: WRONG_CODE.NOT_FOUND.message, error_type: 'CODE_NOT_FOUND' });
    }
    if (!(await codeAccepted(res, request, req.body?.code, connection))) {
      await connection.commit();
      return;
    }
    const data = request.payload?.data;
    // Someone may have taken the address meanwhile.
    const taken = await addressTaken(connection, { email: data.email, telephone: data.telephone });
    if (taken) {
      await connection.rollback();
      return res.status(taken.error.status).json(taken.error.body);
    }
    const created = await createLocalAccount(connection, data, {
      emailVerified: request.channel === 'email',
      phoneVerified: request.channel === 'phone',
    });
    if (created.error) {
      await connection.rollback();
      return res.status(created.error.status).json(created.error.body);
    }
    await consume(request.id, connection);
    await connection.commit();
    res.status(201).json(registrationAnswer(created.user, created.maalemProfile, data.type_compte));
  } catch (err) {
    await connection.rollback().catch(() => {});
    next(err);
  } finally {
    connection.release();
  }
});

router.post('/code/resend', async (req, res, next) => {
  try {
    const request = await findRequest(req.body?.request_id);
    if (!request || request.consumed_at) {
      return res.status(400).json({ message: 'Cette demande est terminée. Recommencez depuis le début.', error_type: 'CODE_NOT_FOUND' });
    }
    const sent = await sendCode(req, res, {
      purpose: request.purpose,
      channel: request.channel,
      target: request.target,
      contactId: request.contact_id,
      payload: request.payload,
      name: request.payload?.data?.prenom ?? null,
    });
    if (sent) res.json(sent);
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------------------------------- forgotten password */

async function resetTargets(identifier) {
  const account = await findAccount(identifier);
  if (!account || !account.is_active || account.is_blocked) {
    return { error: { status: 404, body: { message: 'Aucun compte ne correspond à cet email ou à ce numéro.', error_type: 'ACCOUNT_NOT_FOUND', field: 'identifier' } } };
  }
  if (account.auth_provider !== 'local' && !account.password) {
    const name = account.auth_provider === 'google' ? 'Google' : 'Facebook';
    return { error: { status: 409, body: { message: `Ce compte se connecte avec ${name} : il n'a pas de mot de passe à réinitialiser.`, error_type: 'SSO_ACCOUNT_ONLY', sso_provider: account.auth_provider } } };
  }
  const ready = availableChannels();
  const confirmed = resetChannels(account);
  const channels = confirmed.filter((c) => ready[c.channel]);
  if (!confirmed.length) {
    return { error: { status: 409, body: { message: "Ni l'email ni le téléphone de ce compte n'ont été confirmés : le mot de passe ne peut pas être réinitialisé ici. Contactez le magasin.", error_type: 'NO_CONFIRMED_ADDRESS' } } };
  }
  if (!channels.length) {
    return { error: { status: 503, body: { message: "L'envoi des codes n'est pas encore configuré sur le serveur. Contactez le magasin.", error_type: 'DELIVERY_UNAVAILABLE' } } };
  }
  return { account, channels };
}

router.post('/password/forgot', async (req, res, next) => {
  try {
    await ensureOtpSchema();
    const found = await resetTargets(req.body?.identifier);
    if (found.error) return res.status(found.error.status).json(found.error.body);
    res.json({ channels: found.channels });
  } catch (err) {
    next(err);
  }
});

router.post('/password/forgot/send', async (req, res, next) => {
  try {
    await ensureOtpSchema();
    const found = await resetTargets(req.body?.identifier);
    if (found.error) return res.status(found.error.status).json(found.error.body);
    const channel = req.body?.channel === 'phone' ? 'phone' : 'email';
    if (!found.channels.some((c) => c.channel === channel)) {
      return res.status(400).json({ message: 'Ce moyen de réception n’est pas confirmé sur ce compte.', error_type: 'CHANNEL_NOT_CONFIRMED' });
    }
    const target = channel === 'email' ? found.account.email : normalizePhone(found.account.telephone);
    const sent = await sendCode(req, res, { purpose: 'reset', channel, target, contactId: found.account.id, name: found.account.prenom });
    if (sent) res.json(sent);
  } catch (err) {
    next(err);
  }
});

router.post('/password/reset', async (req, res, next) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (password.length < 8 || password.length > 100) {
    return res.status(400).json({ message: 'Le mot de passe doit contenir entre 8 et 100 caractères', field: 'password' });
  }
  if (req.body?.confirm_password !== undefined && req.body.confirm_password !== password) {
    return res.status(400).json({ message: 'Les mots de passe ne correspondent pas', field: 'confirm_password' });
  }
  const connection = await pool.getConnection();
  try {
    await ensureOtpSchema(connection);
    await connection.beginTransaction();
    const request = await findRequest(req.body?.request_id, connection, { lock: true });
    if (request && request.purpose !== 'reset') {
      await connection.rollback();
      return res.status(400).json({ message: WRONG_CODE.NOT_FOUND.message, error_type: 'CODE_NOT_FOUND' });
    }
    if (!(await codeAccepted(res, request, req.body?.code, connection))) {
      await connection.commit();
      return;
    }
    await connection.query(
      `UPDATE contacts SET password = ?, auth_provider = IF(auth_provider = 'none', 'local', auth_provider),
         login_attempts = 0, locked_until = NULL, updated_at = NOW()
       WHERE id = ?`,
      [await bcrypt.hash(password, 10), request.contact_id],
    );
    // Every other reset code of this account stops working.
    await connection.query(
      `UPDATE contact_verification_codes SET consumed_at = NOW() WHERE contact_id = ? AND purpose = 'reset' AND consumed_at IS NULL`,
      [request.contact_id],
    );
    const [rows] = await connection.query(
      `SELECT id, prenom, nom, email, telephone, type_compte, auth_provider, email_verified, phone_verified,
              avatar_url, locale, demande_artisan, artisan_approuve
       FROM contacts WHERE id = ?`,
      [request.contact_id],
    );
    await connection.commit();
    res.json(signedIn(rows[0], 'Mot de passe modifié. Vous êtes connecté.'));
  } catch (err) {
    await connection.rollback().catch(() => {});
    next(err);
  } finally {
    connection.release();
  }
});

/* ------------------------------------------- confirming an address, signed in */

function customerId(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(header.slice(7), getJwtSecret());
    // A customer's token, never an employee's (whose id would point at another table).
    if (!decoded?.id || decoded.role || decoded.cin || decoded.type_compte == null) return null;
    return Number(decoded.id);
  } catch {
    return null;
  }
}

async function signedInAccount(req) {
  const id = customerId(req);
  if (!id) return null;
  const [rows] = await pool.query(
    `SELECT id, prenom, email, telephone, email_verified, phone_verified, is_active
     FROM contacts WHERE id = ? AND deleted_at IS NULL AND auth_provider != 'none'`,
    [id],
  );
  return rows[0] || null;
}

router.post('/verify/send', async (req, res, next) => {
  try {
    await ensureOtpSchema();
    const account = await signedInAccount(req);
    if (!account) return res.status(401).json({ message: 'Authentification requise' });
    const channel = req.body?.channel === 'phone' ? 'phone' : 'email';
    const target = channel === 'email' ? (isValidEmail(account.email) ? account.email : null) : normalizePhone(account.telephone);
    if (!target) {
      return res.status(400).json({ message: channel === 'email' ? "Ce compte n'a pas d'email valide." : "Ce compte n'a pas de numéro de téléphone valide.", error_type: 'NO_ADDRESS' });
    }
    if (channel === 'email' ? account.email_verified : account.phone_verified) {
      return res.status(409).json({ message: 'Déjà confirmé.', error_type: 'ALREADY_CONFIRMED' });
    }
    const sent = await sendCode(req, res, { purpose: 'verify', channel, target, contactId: account.id, name: account.prenom });
    if (sent) res.json(sent);
  } catch (err) {
    next(err);
  }
});

router.post('/verify/confirm', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    await ensureOtpSchema(connection);
    const account = await signedInAccount(req);
    if (!account) return res.status(401).json({ message: 'Authentification requise' });
    await connection.beginTransaction();
    const request = await findRequest(req.body?.request_id, connection, { lock: true });
    if (request && (request.purpose !== 'verify' || Number(request.contact_id) !== Number(account.id))) {
      await connection.rollback();
      return res.status(400).json({ message: WRONG_CODE.NOT_FOUND.message, error_type: 'CODE_NOT_FOUND' });
    }
    if (!(await codeAccepted(res, request, req.body?.code, connection))) {
      await connection.commit();
      return;
    }
    // The address must still be the account's own (it may have been changed since the code was sent).
    const current = request.channel === 'email' ? String(account.email || '').toLowerCase() : normalizePhone(account.telephone);
    if (current !== request.target) {
      await consume(request.id, connection);
      await connection.commit();
      return res.status(409).json({ message: "L'adresse a changé depuis l'envoi du code. Demandez un nouveau code.", error_type: 'ADDRESS_CHANGED' });
    }
    await connection.query(`UPDATE contacts SET ${request.channel === 'email' ? 'email_verified' : 'phone_verified'} = 1 WHERE id = ?`, [account.id]);
    await consume(request.id, connection);
    await connection.commit();
    res.json({
      message: request.channel === 'email' ? 'Email confirmé.' : 'Numéro confirmé.',
      email_verified: request.channel === 'email' ? true : !!account.email_verified,
      phone_verified: request.channel === 'phone' ? true : !!account.phone_verified,
    });
  } catch (err) {
    await connection.rollback().catch(() => {});
    next(err);
  } finally {
    connection.release();
  }
});

export default router;
