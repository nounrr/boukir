/**
 * Creating a customer account with a password: the checks and the insert shared by
 * POST /register (the website's direct sign-up) and the code-confirmed sign-up of the app
 * (POST /register/start then /register/confirm).
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../middleware/auth.js';
import { emitToPDG } from '../socket/socketServer.js';
import { parseMaalemRegistrationIntent } from './maalemRegistration.js';
import { isValidEmail, normalizePhone, phoneVariants } from './otp.js';

export function generateCustomerToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, type_compte: user.type_compte, auth_provider: user.auth_provider },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
  );
}

const fail = (status, message, field, extra = {}) => ({ error: { status, body: { message, ...(field ? { field } : {}), ...extra } } });

/** A customer account (with a password, Google or Facebook) already using this phone number. */
export async function accountWithPhone(db, phone, exceptId = null) {
  const variants = phoneVariants(phone);
  if (!variants.length) return null;
  const [rows] = await db.query(
    `SELECT id, auth_provider FROM contacts
     WHERE REPLACE(REPLACE(REPLACE(telephone, ' ', ''), '-', ''), '.', '') IN (?)
       AND deleted_at IS NULL AND auth_provider != 'none'${exceptId ? ' AND id != ?' : ''}
     ORDER BY phone_verified DESC, id ASC LIMIT 1`,
    exceptId ? [variants, exceptId] : [variants],
  );
  return rows[0] || null;
}

/**
 * Checks a sign-up. `method`:
 *   'legacy'  the website's form: e-mail and phone both required (as before);
 *   'email'   signing up with an e-mail confirmed by code (phone optional);
 *   'phone'   signing up with a phone confirmed by SMS code (e-mail optional).
 * Returns { data } ready for createLocalAccount (password already hashed), or { error: { status, body } }.
 */
export async function checkRegistration(db, body, method = 'legacy') {
  const {
    prenom, nom, type_compte, password, confirm_password,
    profil_client, client_profile, is_company, societe, company_name, ice,
    artisan_path, maalem_category_id,
  } = body || {};
  const email = String(body?.email ?? '').trim().toLowerCase();
  const telephone = String(body?.telephone ?? '').trim();

  if (!String(prenom || '').trim() || !String(nom || '').trim() || !password) {
    return fail(400, 'Les champs prénom, nom et mot de passe sont obligatoires', !String(prenom || '').trim() ? 'prenom' : !String(nom || '').trim() ? 'nom' : 'password');
  }
  if (method !== 'phone' && !email) return fail(400, "L'email est obligatoire", 'email');
  if (email && !isValidEmail(email)) return fail(400, "Format d'email invalide", 'email');
  if (method !== 'email' && !telephone) return fail(400, 'Le numéro de téléphone est obligatoire', 'telephone');
  if (telephone && !(method === 'legacy' ? /^(\+212|0)[5-7]\d{8}$/.test(telephone) : normalizePhone(telephone))) {
    return fail(400, 'Format de téléphone invalide', 'telephone');
  }
  if (String(password).length < 8) return fail(400, 'Le mot de passe doit contenir au moins 8 caractères', 'password');
  if (String(password).length > 100) return fail(400, 'Le mot de passe doit contenir au plus 100 caractères', 'password');
  if (password !== confirm_password) return fail(400, 'Les mots de passe ne correspondent pas', 'confirm_password');
  if (type_compte && !['Client', 'Artisan', 'Promoteur', 'Artisan/Promoteur'].includes(type_compte)) {
    return fail(400, 'Type de compte invalide', 'type_compte');
  }

  const registrationIntent = parseMaalemRegistrationIntent({ type_compte: type_compte || 'Client', artisan_path, maalem_category_id });
  if (!registrationIntent.valid) {
    return fail(400, registrationIntent.error, registrationIntent.error.includes('catégorie') ? 'maalem_category_id' : 'artisan_path');
  }

  const taken = await addressTaken(db, { email, telephone: method === 'legacy' ? null : telephone });
  if (taken) return taken;

  const isArtisanRequest = registrationIntent.is_artisan_request;
  const effectiveTypeCompte = isArtisanRequest ? 'Client' : (type_compte || 'Client');
  const profileValue = String(profil_client ?? client_profile ?? '').trim().toLowerCase();
  const requestedIsCompany =
    is_company === true || is_company === 1 || String(is_company ?? '').toLowerCase() === 'true' ||
    ['societe', 'société', 'society', 'company'].includes(profileValue);
  const isCompanyProfile = !isArtisanRequest && effectiveTypeCompte === 'Client' && requestedIsCompany;
  const companyName = String(societe ?? company_name ?? '').trim();
  const iceValue = String(ice ?? '').trim();
  if (isCompanyProfile) {
    if (!companyName) return fail(400, 'Nom de la société obligatoire', 'societe');
    if (!iceValue) return fail(400, 'ICE obligatoire', 'ice');
    if (!/^\d{15}$/.test(iceValue)) return fail(400, "L'ICE doit contenir 15 chiffres.", 'ice');
    const [iceRows] = await db.query('SELECT id FROM contacts WHERE ice = ? AND deleted_at IS NULL LIMIT 1', [iceValue]);
    if (iceRows.length) return fail(409, 'ICE déjà utilisé par un autre compte', 'ice');
  }

  return {
    data: {
      prenom: String(prenom).trim(),
      nom: String(nom).trim(),
      email: email || null,
      telephone: telephone ? (method === 'legacy' ? telephone : normalizePhone(telephone)) : null,
      password_hash: await bcrypt.hash(String(password), 10),
      type_compte: type_compte || 'Client',
      effective_type_compte: effectiveTypeCompte,
      is_artisan_request: isArtisanRequest,
      wants_maalem: !!registrationIntent.wants_maalem,
      maalem_category_id: registrationIntent.category_id ?? null,
      is_company: isCompanyProfile,
      societe: isCompanyProfile ? companyName : null,
      ice: isCompanyProfile ? iceValue : null,
    },
  };
}

/** Whether the e-mail or phone already belongs to an account; checked again right before the account is made. */
export async function addressTaken(db, { email, telephone }) {
  if (email) {
    const [existing] = await db.query('SELECT id, auth_provider FROM contacts WHERE email = ? AND deleted_at IS NULL', [email]);
    const local = existing.find((u) => u.auth_provider === 'local');
    const sso = existing.find((u) => u.auth_provider === 'google' || u.auth_provider === 'facebook');
    if (local) return fail(409, 'Un compte existe déjà avec cet email', 'email');
    if (sso) {
      const name = sso.auth_provider === 'google' ? 'Google' : 'Facebook';
      return fail(409, `Un compte existe déjà avec cet email via ${name}. Veuillez vous connecter avec ${name}.`, 'email', { sso_provider: sso.auth_provider });
    }
  }
  if (telephone && (await accountWithPhone(db, telephone))) {
    return fail(409, 'Un compte existe déjà avec ce numéro de téléphone', 'telephone');
  }
  return null;
}

const USER_COLUMNS = `id, prenom, nom, email, telephone, type_compte, auth_provider,
  email_verified, phone_verified, avatar_url, locale, is_active, demande_artisan,
  artisan_approuve, created_at, societe, ice, is_company, is_solde`;

/**
 * Inserts the account inside the caller's transaction and returns { user, maalemProfile } or { error }.
 * `verified` says which address was just confirmed by code.
 */
export async function createLocalAccount(connection, data, { emailVerified = false, phoneVerified = false } = {}) {
  let category = null;
  if (data.wants_maalem && data.maalem_category_id != null) {
    const [rows] = await connection.query(
      `SELECT id, nom, nom_ar FROM maalem_categories
       WHERE id = ? AND is_active = 1 AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,
      [data.maalem_category_id],
    );
    category = rows[0] || null;
    if (!category) return fail(400, 'Catégorie Maalem inactive ou introuvable', 'maalem_category_id');
  }

  const [result] = await connection.query(
    `INSERT INTO contacts
     (nom_complet, prenom, nom, email, telephone, type, type_compte,
      demande_artisan, type_compte_demande, artisan_approuve, password, auth_provider,
      email_verified, phone_verified, is_active, source, societe, ice, is_company)
     VALUES (?, ?, ?, ?, ?, 'Client', ?, ?, ?, FALSE, ?, 'local', ?, ?, TRUE, 'ecommerce', ?, ?, ?)`,
    [
      `${data.prenom} ${data.nom}`,
      data.prenom,
      data.nom,
      data.email,
      data.telephone,
      data.effective_type_compte,
      data.is_artisan_request,
      data.is_artisan_request ? (data.type_compte === 'Promoteur' ? 'Promoteur' : 'Artisan') : null,
      data.password_hash,
      emailVerified ? 1 : 0,
      phoneVerified ? 1 : 0,
      data.societe,
      data.ice,
      data.is_company ? 1 : 0,
    ],
  );
  const userId = result.insertId;

  let maalemProfile = null;
  if (data.wants_maalem) {
    const [profile] = await connection.query(
      `INSERT INTO maalem_profiles (contact_id, category_id, status, origin) VALUES (?, ?, 'draft', 'NEW_REGISTRATION')`,
      [userId, data.maalem_category_id],
    );
    maalemProfile = {
      id: Number(profile.insertId),
      user_id: Number(userId),
      contact_id: Number(userId),
      category_id: data.maalem_category_id,
      status: 'draft',
      status_label: 'Brouillon',
      origin: 'NEW_REGISTRATION',
      origin_label: 'Nouvelle inscription',
      created_by_employee_id: null,
      professional_data: null,
      status_reason: null,
      submitted_at: null,
      reviewed_at: null,
      reviewed_by: null,
      category: category ? { id: Number(category.id), nom: category.nom, nom_ar: category.nom_ar, is_active: true } : null,
    };
  }

  const [users] = await connection.query(`SELECT ${USER_COLUMNS} FROM contacts WHERE id = ?`, [userId]);
  return { user: users[0], maalemProfile };
}

/** The 201 answer after a sign-up (same shape as before), and the shop's alert for an Artisan request. */
export function registrationAnswer(user, maalemProfile, typeCompte) {
  if (user.demande_artisan && !user.artisan_approuve) {
    emitToPDG('artisan-request:new', {
      contact_id: user.id,
      nom_complet: `${user.prenom} ${user.nom}`,
      prenom: user.prenom,
      nom: user.nom,
      email: user.email,
      telephone: user.telephone,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
      timestamp: new Date().toISOString(),
    });
  }
  let message = 'Compte créé avec succès';
  if (user.demande_artisan && !user.artisan_approuve) {
    message = `Compte créé avec succès. Votre demande pour devenir ${typeCompte === 'Promoteur' ? 'Promoteur' : 'Artisan'} est en attente d'approbation par un administrateur.`;
  }
  if (maalemProfile) message = 'Compte créé avec succès. Votre brouillon Maalem est prêt à être complété.';
  return {
    message,
    user: {
      id: user.id,
      prenom: user.prenom,
      nom: user.nom,
      email: user.email,
      telephone: user.telephone,
      societe: user.societe,
      ice: user.ice,
      is_company: !!user.is_company,
      is_solde: !!user.is_solde,
      type_compte: user.type_compte,
      auth_provider: user.auth_provider,
      email_verified: !!user.email_verified,
      phone_verified: !!user.phone_verified,
      avatar_url: user.avatar_url,
      locale: user.locale,
      demande_artisan: !!user.demande_artisan,
      artisan_approuve: !!user.artisan_approuve,
      maalem_profile: maalemProfile,
    },
    token: generateCustomerToken(user),
    next_path: maalemProfile ? '/profile/maalem' : null,
  };
}
