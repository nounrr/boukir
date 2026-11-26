import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import { normalizeProfileAvatar, avatarForProviderLogin, saveProfileAvatar } from '../utils/profileAvatar.js';
import pool from '../db/pool.js';
import bcrypt from 'bcryptjs';
import { getJwtSecret } from '../middleware/auth.js';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';
import { emitToPDG } from '../socket/socketServer.js';
import {
  ensureContactsCheckoutColumns,
  ensureContactsRemiseBalance,
} from '../utils/ensureRemiseSchema.js';
import { getEcommerceCredit } from '../utils/ecommerceCredit.js';
import { findMaalemProfileByContactId } from '../utils/maalemProfile.js';
import { parseMaalemRegistrationIntent } from '../utils/maalemRegistration.js';
import { consumeMaalemActivationToken } from '../utils/maalemTeamCreation.js';
import { checkRegistration, createLocalAccount, registrationAnswer } from '../utils/customerAccount.js';
import { normalizePhone, phoneVariants } from '../utils/otp.js';
import { ensureOtpSchema } from '../utils/otpStore.js';
import { deleteCustomerAccount } from '../utils/accountDeletion.js';

const router = Router();
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 20 },
  fileFilter: (_req, file, callback) => {
    if (!['avatar', 'image', 'photo', 'file'].includes(file.fieldname)) {
      return callback(Object.assign(new Error('Champ photo invalide : utilisez avatar, image, photo ou file.'), { status: 400 }));
    }
    callback(null, true);
  },
}).any();
function receiveProfileAvatar(req, res, next) {
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
    const decoded = jwt.verify(token, getJwtSecret());
    if (!decoded.id) throw new Error('Token invalide');
  } catch {
    return res.status(401).json({ message: 'Authentification requise' });
  }
  avatarUpload(req, res, error => {
    if (error) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ message: error.code === 'LIMIT_FILE_SIZE' ? 'La photo dépasse 5 Mo.' : error.message });
    req.file = req.files?.[0];
    next();
  });
}

// Ensure contacts has remise_balance column (used as "remise points" balance)
ensureContactsRemiseBalance().catch(e => console.error('ensureContactsRemiseBalance:', e));

// Ensure the one-time codes table and contacts.phone_verified exist (sign-up and password codes)
ensureOtpSchema().catch(e => console.error('ensureOtpSchema:', e.message));

// Ensure contacts has checkout shipping columns (used for /api/users/auth/me prefill)
ensureContactsCheckoutColumns().catch(e => console.error('ensureContactsCheckoutColumns:', e));

// Initialize Google OAuth client
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Helper function to generate JWT token
function generateToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    type_compte: user.type_compte,
    auth_provider: user.auth_provider,
  };
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

// Helper function to validate email format
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Helper function to check if account is locked
function isAccountLocked(user) {
  if (user.is_blocked) {
    return { locked: true, reason: 'Account has been blocked by administrator' };
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return { locked: true, reason: 'Account is temporarily locked due to multiple failed login attempts' };
  }
  return { locked: false };
}

// ==================== TRADITIONAL REGISTRATION ====================
// POST /api/users/auth/register - Register with email/password
router.post('/register', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    await ensureOtpSchema(connection);
    const checked = await checkRegistration(connection, req.body, 'legacy');
    if (checked.error) return res.status(checked.error.status).json(checked.error.body);

    await connection.beginTransaction();
    const created = await createLocalAccount(connection, checked.data);
    if (created.error) {
      await connection.rollback();
      return res.status(created.error.status).json(created.error.body);
    }
    await connection.commit();
    res.status(201).json(registrationAnswer(created.user, created.maalemProfile, checked.data.type_compte));
  } catch (err) {
    await connection.rollback().catch(() => {});
    console.error('Registration error:', err);
    if (err?.code === 'ER_DUP_ENTRY') {
      const duplicateEmail = String(err.sqlMessage || err.message || '').toLowerCase().includes('email');
      return res.status(409).json({
        message: duplicateEmail
          ? 'Un compte existe déjà avec cet email'
          : 'Ces informations sont déjà utilisées par un autre compte',
        field: duplicateEmail ? 'email' : undefined,
      });
    }
    next(err);
  } finally {
    connection.release();
  }
});

// ==================== TRADITIONAL LOGIN ====================
// POST /api/users/auth/activate - Consume a one-time team invitation and choose a password.
router.post('/activate', async (req, res, next) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const confirmPassword = typeof req.body?.confirm_password === 'string' ? req.body.confirm_password : '';

  if (!token || token.length > 200) {
    return res.status(400).json({ message: 'Lien d’activation invalide ou expiré' });
  }
  if (password.length < 8 || password.length > 100) {
    return res.status(400).json({ message: 'Le mot de passe doit contenir entre 8 et 100 caractères' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ message: 'Les mots de passe ne correspondent pas' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const contactId = await consumeMaalemActivationToken(connection, { token, password });
    if (!contactId) {
      await connection.rollback();
      return res.status(400).json({ message: 'Lien d’activation invalide ou expiré' });
    }
    await connection.commit();
    return res.json({ message: 'Compte activé. Vous pouvez maintenant vous connecter.' });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

// ==================== TRADITIONAL LOGIN ====================
// POST /api/users/auth/login - Login with email/password
router.post('/login', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { email, password } = req.body;
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    await ensureContactsCheckoutColumns(connection);

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        message: 'Email et mot de passe requis',
        field: !email ? 'email' : 'password',
      });
    }

    // The identifier is an e-mail, or the phone number of an account created with it.
    await ensureOtpSchema(connection);
    const identifier = String(email).trim();
    const byPhone = !identifier.includes('@') && !!normalizePhone(identifier);
    const [users] = await connection.query(
      `SELECT id, prenom, nom, email, telephone, type_compte, password, auth_provider,
              email_verified, phone_verified, avatar_url, locale, is_active, is_blocked,
              login_attempts, locked_until, last_login_at, demande_artisan, artisan_approuve,
              nom_complet, adresse,
              shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_postal_code, shipping_country,
              societe, ice, is_company, is_solde,
              COALESCE(remise_balance, 0) AS remise_balance
       FROM contacts
       WHERE ${byPhone ? "REPLACE(REPLACE(REPLACE(telephone, ' ', ''), '-', ''), '.', '') IN (?) AND auth_provider = 'local'" : 'email = ?'}
         AND deleted_at IS NULL AND auth_provider != 'none'
       ORDER BY ${byPhone ? 'phone_verified DESC, ' : ''}id ASC`,
      [byPhone ? phoneVariants(identifier) : identifier.toLowerCase()]
    );

    const user = users[0];

    // User not found
    if (!user) {
      return res.status(401).json({
        message: 'Email ou mot de passe incorrect',
        field: 'email',
      });
    }

    // Check if account is SSO-only
    if (user.auth_provider !== 'local' || !user.password) {
      return res.status(403).json({
        message: `Ce compte a été créé avec ${user.auth_provider === 'google' ? 'Google' : 'Facebook'}. Veuillez vous connecter avec ${user.auth_provider === 'google' ? 'Google' : 'Facebook'}.`,
        error_type: 'SSO_ACCOUNT_ONLY',
        sso_provider: user.auth_provider,
      });
    }

    // Check if account is locked or blocked
    const lockStatus = isAccountLocked(user);
    if (lockStatus.locked) {
      return res.status(403).json({
        message: lockStatus.reason,
        error_type: user.is_blocked ? 'ACCOUNT_BLOCKED' : 'ACCOUNT_LOCKED',
      });
    }

    // Check if account is active
    if (!user.is_active) {
      return res.status(403).json({
        message: 'Ce compte a été désactivé',
        error_type: 'ACCOUNT_INACTIVE',
      });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      // Increment login attempts
      const newAttempts = user.login_attempts + 1;
      const maxAttempts = 5;
      let lockUntil = null;

      if (newAttempts >= maxAttempts) {
        // Lock account for 15 minutes after 5 failed attempts
        lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      }

      await connection.query(
        'UPDATE contacts SET login_attempts = ?, locked_until = ? WHERE id = ?',
        [newAttempts, lockUntil, user.id]
      );

      if (lockUntil) {
        return res.status(403).json({
          message: 'Compte verrouillé pour 15 minutes en raison de tentatives de connexion multiples',
          error_type: 'ACCOUNT_LOCKED',
        });
      }

      return res.status(401).json({
        message: 'Email ou mot de passe incorrect',
        field: 'password',
        attempts_left: maxAttempts - newAttempts,
      });
    }

    await connection.beginTransaction();

    // Reset login attempts and update last login
    await connection.query(
      `UPDATE contacts
       SET login_attempts = 0, locked_until = NULL, 
           last_login_at = NOW(), last_login_ip = ? 
       WHERE id = ?`,
      [clientIp, user.id]
    );

    await connection.commit();

    const token = generateToken(user);

    res.json({
      message: 'Connexion réussie',
      user: {
        id: user.id,
        prenom: user.prenom,
        nom: user.nom,
        nom_complet: user.nom_complet,
        email: user.email,
        telephone: user.telephone,
        adresse: user.adresse,
        societe: user.societe,
        ice: user.ice,
        is_company: !!user.is_company,
        shipping_address_line1: user.shipping_address_line1,
        shipping_address_line2: user.shipping_address_line2,
        shipping_city: user.shipping_city,
        shipping_state: user.shipping_state,
        shipping_postal_code: user.shipping_postal_code,
        shipping_country: user.shipping_country,
        type_compte: user.type_compte,
        is_solde: !!user.is_solde,
        auth_provider: user.auth_provider,
        email_verified: !!user.email_verified,
        phone_verified: !!user.phone_verified,
        avatar_url: user.avatar_url,
        locale: user.locale,
        demande_artisan: !!user.demande_artisan,
        artisan_approuve: !!user.artisan_approuve,
        remise_balance: Number(user.remise_balance || 0),
      },
      token,
    });
  } catch (err) {
    await connection.rollback();
    console.error('Login error:', err);
    next(err);
  } finally {
    connection.release();
  }
});

// ==================== REQUEST ARTISAN ROLE (EXISTING CLIENT) ====================
// POST /api/users/auth/request-artisan - Existing authenticated client requests Artisan/Promoteur role
router.post('/request-artisan', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ message: 'Token manquant' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, getJwtSecret());
    } catch (err) {
      return res.status(401).json({ message: 'Token invalide' });
    }

    const requestedType = req.body?.type_compte === 'Promoteur' ? 'Promoteur' : 'Artisan';
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, prenom, nom, nom_complet, email, telephone, avatar_url,
              type_compte, demande_artisan, artisan_approuve,
              is_active, is_blocked, locked_until
       FROM contacts
       WHERE id = ? AND deleted_at IS NULL AND auth_provider != 'none'
       FOR UPDATE`,
      [decoded.id]
    );

    const user = rows[0];
    if (!user) {
      await connection.rollback();
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    if (!user.is_active) {
      await connection.rollback();
      return res.status(403).json({ message: 'Compte désactivé', error_type: 'ACCOUNT_INACTIVE' });
    }

    const lockStatus = isAccountLocked(user);
    if (lockStatus.locked) {
      await connection.rollback();
      return res.status(403).json({ message: lockStatus.reason, error_type: 'ACCOUNT_LOCKED' });
    }

    // If already artisan
    const isArtisan = ['Artisan', 'Promoteur', 'Artisan/Promoteur'].includes(user.type_compte) || !!user.artisan_approuve;
    if (isArtisan) {
      await connection.rollback();
      return res.status(400).json({ message: 'Vous êtes déjà Artisan/Promoteur', status: 'already_artisan' });
    }

    // If already requested and pending
    if (!!user.demande_artisan && !user.artisan_approuve) {
      await connection.commit();
      return res.json({
        message: 'Votre demande est déjà en attente',
        status: 'pending',
        user: {
          id: user.id,
          type_compte: user.type_compte,
          demande_artisan: true,
          artisan_approuve: false,
        },
      });
    }

    // Create (or re-create) the request
    await connection.query(
      `UPDATE contacts
       SET demande_artisan = TRUE,
           type_compte_demande = ?,
           artisan_approuve = FALSE,
           updated_at = NOW()
       WHERE id = ?`,
      [requestedType, user.id]
    );

    await connection.commit();

    // Notify PDG/admins (same event as registration flow)
    try {
      emitToPDG('artisan-request:new', {
        contact_id: user.id,
        nom_complet: user.nom_complet || `${user.prenom || ''} ${user.nom || ''}`.trim(),
        prenom: user.prenom,
        nom: user.nom,
        email: user.email,
        telephone: user.telephone,
        avatar_url: user.avatar_url,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('emitToPDG artisan-request:new failed', e?.message || e);
    }

    return res.json({
      message: 'Demande envoyée avec succès. Elle sera validée par un administrateur.',
      status: 'requested',
      user: {
        id: user.id,
        type_compte: user.type_compte,
        demande_artisan: true,
        artisan_approuve: false,
      },
    });
  } catch (err) {
    try {
      await connection.rollback();
    } catch {
      // ignore
    }
    console.error('Request artisan error:', err);
    next(err);
  } finally {
    connection.release();
  }
});

// ==================== GOOGLE SSO ====================
// POST /api/users/auth/google - Login/Register with Google
router.post('/google', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const {
      credential,
      access_token,
      type_compte,
      artisan_path,
      maalem_category_id,
    } = req.body;
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    const registrationIntent = parseMaalemRegistrationIntent({
      type_compte: type_compte || 'Client',
      artisan_path,
      maalem_category_id,
    });
    if (!registrationIntent.valid) {
      return res.status(400).json({
        message: registrationIntent.error,
        field: registrationIntent.error.includes('catégorie') ? 'maalem_category_id' : 'artisan_path',
      });
    }

    if (!credential && !access_token) {
      return res.status(400).json({
        message: 'Google credential ou access token requis',
      });
    }

    // Verify Google token
    let googleUser;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      googleUser = ticket.getPayload();
    } catch (verifyError) {
      console.error('Google token verification error:', verifyError);
      return res.status(401).json({
        message: 'Token Google invalide',
        error_type: 'INVALID_GOOGLE_TOKEN',
      });
    }

    const {
      sub: googleId,
      email,
      given_name: prenom,
      family_name: nom,
      picture: avatar_url,
      email_verified,
      locale,
    } = googleUser;

    await connection.beginTransaction();

    // Check if user exists with Google ID
    let [users] = await connection.query(
      `SELECT id, prenom, nom, email, telephone, type_compte, auth_provider, 
              email_verified, avatar_url, locale, is_active, is_blocked, 
              locked_until, google_id, demande_artisan, artisan_approuve,
              is_solde
       FROM contacts WHERE google_id = ? AND deleted_at IS NULL`,
      [googleId]
    );

    let user = users[0];
    let isNewUser = false;
    let maalemProfile = null;

    if (user) {
      // Existing Google user - update and login
      const lockStatus = isAccountLocked(user);
      if (lockStatus.locked) {
        await connection.rollback();
        return res.status(403).json({
          message: lockStatus.reason,
          error_type: user.is_blocked ? 'ACCOUNT_BLOCKED' : 'ACCOUNT_LOCKED',
        });
      }

      if (!user.is_active) {
        await connection.rollback();
        return res.status(403).json({
          message: 'Ce compte a été désactivé',
          error_type: 'ACCOUNT_INACTIVE',
        });
      }

      // Preserve a photo already saved on the shared customer profile.
      const nextAvatar = avatarForProviderLogin(user.avatar_url, avatar_url);
      await connection.query(
        `UPDATE contacts
         SET avatar_url = ?, email_verified = TRUE, locale = ?,
             last_login_at = NOW(), last_login_ip = ?,
             provider_access_token = ?, login_attempts = 0, locked_until = NULL
         WHERE id = ?`,
        [nextAvatar, locale || 'fr', clientIp, access_token || null, user.id]
      );

      user.avatar_url = nextAvatar;
      user.email_verified = true;
      user.locale = locale || 'fr';
    } else {
      isNewUser = true;
      // Check if email exists with different auth method
      [users] = await connection.query(
        'SELECT id, auth_provider FROM contacts WHERE email = ? AND deleted_at IS NULL',
        [email.toLowerCase()]
      );

      if (users.length > 0) {
        const existingUser = users[0];
        if (existingUser.auth_provider === 'local') {
          await connection.rollback();
          return res.status(409).json({
            message: 'Un compte existe déjà avec cet email. Veuillez vous connecter avec votre email et mot de passe.',
            error_type: 'EMAIL_EXISTS_LOCAL',
          });
        } else if (existingUser.auth_provider === 'facebook') {
          await connection.rollback();
          return res.status(409).json({
            message: 'Un compte existe déjà avec cet email via Facebook. Veuillez vous connecter avec Facebook.',
            error_type: 'EMAIL_EXISTS_FACEBOOK',
          });
        }
      }

      // Create new user with Google
      const prenomValue = prenom || 'Utilisateur';
      const nomValue = nom || 'Google';
      const nomComplet = `${prenomValue} ${nomValue}`;

      let selectedMaalemCategory = null;
      if (registrationIntent.wants_maalem && registrationIntent.category_id != null) {
        const [categoryRows] = await connection.query(
          `SELECT id, nom, nom_ar, is_active
           FROM maalem_categories
           WHERE id = ? AND is_active = 1 AND deleted_at IS NULL
           LIMIT 1
           FOR UPDATE`,
          [registrationIntent.category_id]
        );
        selectedMaalemCategory = categoryRows[0] || null;
        if (!selectedMaalemCategory) {
          await connection.rollback();
          return res.status(400).json({
            message: 'Catégorie Maalem inactive ou introuvable',
            field: 'maalem_category_id',
          });
        }
      }

      const [result] = await connection.query(
        `INSERT INTO contacts
         (nom_complet, prenom, nom, email, type, type_compte, auth_provider, google_id,
          avatar_url, email_verified, locale, is_active, last_login_at, last_login_ip,
          provider_access_token, source, demande_artisan, type_compte_demande, artisan_approuve)
         VALUES (?, ?, ?, ?, 'Client', 'Client', 'google', ?, ?, TRUE, ?, TRUE, NOW(), ?, ?, 'ecommerce', ?, ?, FALSE)`,
        [
          nomComplet,
          prenomValue,
          nomValue,
          email.toLowerCase(),
          googleId,
          avatar_url,
          locale || 'fr',
          clientIp,
          access_token || null,
          registrationIntent.is_artisan_request ? 1 : 0,
          registrationIntent.is_artisan_request ? (type_compte === 'Promoteur' ? 'Promoteur' : 'Artisan') : null,
        ]
      );

      const userId = result.insertId;

      if (registrationIntent.wants_maalem) {
        const [profileResult] = await connection.query(
          `INSERT INTO maalem_profiles (contact_id, category_id, status, origin)
           VALUES (?, ?, 'draft', 'NEW_REGISTRATION')`,
          [userId, registrationIntent.category_id]
        );
        maalemProfile = {
          id: Number(profileResult.insertId),
          user_id: Number(userId),
          contact_id: Number(userId),
          category_id: registrationIntent.category_id,
          status: 'draft',
          status_label: 'Brouillon',
          origin: 'NEW_REGISTRATION',
          origin_label: 'Nouvelle inscription',
          created_by_employee_id: null,
          professional_data: null,
          category: selectedMaalemCategory ? {
            id: Number(selectedMaalemCategory.id),
            nom: selectedMaalemCategory.nom,
            nom_ar: selectedMaalemCategory.nom_ar,
            is_active: true,
          } : null,
        };
      }

      [users] = await connection.query(
        `SELECT id, prenom, nom, email, telephone, type_compte, auth_provider, 
                email_verified, avatar_url, locale, demande_artisan, artisan_approuve,
                is_solde
         FROM contacts WHERE id = ?`,
        [userId]
      );

      user = users[0];
    }

    if (!isNewUser) {
      maalemProfile = await findMaalemProfileByContactId(connection, user.id);
    }

    await connection.commit();

    const token = generateToken(user);

    if (isNewUser && user.demande_artisan && !user.artisan_approuve) {
      emitToPDG('artisan-request:new', {
        contact_id: user.id,
        nom_complet: `${user.prenom} ${user.nom}`,
        prenom: user.prenom,
        nom: user.nom,
        email: user.email,
        telephone: user.telephone,
        avatar_url: user.avatar_url,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      message: isNewUser ? 'Compte créé avec Google' : 'Connexion réussie avec Google',
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
        is_solde: !!user.is_solde,
        maalem_profile: maalemProfile,
      },
      token,
      isNewUser,
      next_path: isNewUser && maalemProfile ? '/profile/maalem' : null,
    });
  } catch (err) {
    await connection.rollback();
    console.error('Google authentication error:', err);
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        message: 'Un compte existe déjà avec cet email',
        field: 'email',
      });
    }
    next(err);
  } finally {
    connection.release();
  }
});

// ==================== FACEBOOK SSO ====================
// POST /api/users/auth/facebook - Login/Register with Facebook
router.post('/facebook', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { accessToken, userID, type_compte } = req.body;
    if (type_compte && !['Client', 'Artisan', 'Promoteur'].includes(type_compte)) {
      return res.status(400).json({ message: 'Type de compte invalide', field: 'type_compte' });
    }
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    if (!accessToken || !userID) {
      return res.status(400).json({
        message: 'Facebook access token et userID requis',
      });
    }

    // Verify Facebook token and get user info
    let facebookUser;
    try {
      const response = await axios.get(
        `https://graph.facebook.com/v18.0/me?fields=id,first_name,last_name,email,picture&access_token=${accessToken}`
      );
      facebookUser = response.data;

      // Verify the userID matches
      if (facebookUser.id !== userID) {
        return res.status(401).json({
          message: 'Facebook userID invalide',
          error_type: 'INVALID_FACEBOOK_ID',
        });
      }
    } catch (verifyError) {
      console.error('Facebook token verification error:', verifyError);
      return res.status(401).json({
        message: 'Token Facebook invalide',
        error_type: 'INVALID_FACEBOOK_TOKEN',
      });
    }

    const {
      id: facebookId,
      email,
      first_name: prenom,
      last_name: nom,
      picture,
    } = facebookUser;

    const avatar_url = picture?.data?.url || null;

    // Facebook doesn't always provide email
    if (!email) {
      return res.status(400).json({
        message: 'Impossible de récupérer l\'email depuis Facebook. Veuillez autoriser l\'accès à votre email.',
        error_type: 'FACEBOOK_EMAIL_MISSING',
      });
    }

    await connection.beginTransaction();

    // Check if user exists with Facebook ID
    let [users] = await connection.query(
      `SELECT id, prenom, nom, email, telephone, type_compte, auth_provider, 
              email_verified, avatar_url, locale, is_active, is_blocked, 
              locked_until, facebook_id, demande_artisan, artisan_approuve,
              is_solde
       FROM contacts WHERE facebook_id = ? AND deleted_at IS NULL`,
      [facebookId]
    );

    let user = users[0];

    if (user) {
      // Existing Facebook user - update and login
      const lockStatus = isAccountLocked(user);
      if (lockStatus.locked) {
        return res.status(403).json({
          message: lockStatus.reason,
          error_type: user.is_blocked ? 'ACCOUNT_BLOCKED' : 'ACCOUNT_LOCKED',
        });
      }

      if (!user.is_active) {
        return res.status(403).json({
          message: 'Ce compte a été désactivé',
          error_type: 'ACCOUNT_INACTIVE',
        });
      }

      // Update user info from Facebook
      const nextAvatar = avatarForProviderLogin(user.avatar_url, avatar_url);
      await connection.query(
        `UPDATE contacts
         SET avatar_url = ?, email_verified = TRUE,
             last_login_at = NOW(), last_login_ip = ?,
             provider_access_token = ?, login_attempts = 0, locked_until = NULL
         WHERE id = ?`,
        [nextAvatar, clientIp, accessToken, user.id]
      );

      user.avatar_url = nextAvatar;
      user.email_verified = true;
    } else {
      // Check if email exists with different auth method
      [users] = await connection.query(
        'SELECT id, auth_provider FROM contacts WHERE email = ? AND deleted_at IS NULL',
        [email.toLowerCase()]
      );

      if (users.length > 0) {
        const existingUser = users[0];
        if (existingUser.auth_provider === 'local') {
          return res.status(409).json({
            message: 'Un compte existe déjà avec cet email. Veuillez vous connecter avec votre email et mot de passe.',
            error_type: 'EMAIL_EXISTS_LOCAL',
          });
        } else if (existingUser.auth_provider === 'google') {
          return res.status(409).json({
            message: 'Un compte existe déjà avec cet email via Google. Veuillez vous connecter avec Google.',
            error_type: 'EMAIL_EXISTS_GOOGLE',
          });
        }
      }

      // Create new user with Facebook
      const prenomValue = prenom || 'Utilisateur';
      const nomValue = nom || 'Facebook';
      const nomComplet = `${prenomValue} ${nomValue}`;

      const [result] = await connection.query(
        `INSERT INTO contacts
         (nom_complet, prenom, nom, email, type, type_compte, auth_provider, facebook_id,
          avatar_url, email_verified, is_active, last_login_at, last_login_ip,
          provider_access_token, source, demande_artisan, type_compte_demande, artisan_approuve)
         VALUES (?, ?, ?, ?, 'Client', 'Client', 'facebook', ?, ?, TRUE, TRUE, NOW(), ?, ?, 'ecommerce', ?, ?, FALSE)`,
        [
          nomComplet,
          prenomValue,
          nomValue,
          email.toLowerCase(),
          facebookId,
          avatar_url,
          clientIp,
          accessToken,
          type_compte === 'Artisan' || type_compte === 'Promoteur' ? 1 : 0,
          type_compte === 'Artisan' || type_compte === 'Promoteur' ? type_compte : null,
        ]
      );

      const userId = result.insertId;

      [users] = await connection.query(
        `SELECT id, prenom, nom, email, telephone, type_compte, auth_provider, 
                email_verified, avatar_url, locale, demande_artisan, artisan_approuve,
                is_solde
         FROM contacts WHERE id = ?`,
        [userId]
      );

      user = users[0];
    }

    await connection.commit();

    const token = generateToken(user);

    res.json({
      message: user.id ? 'Connexion réussie avec Facebook' : 'Compte créé avec Facebook',
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
        is_solde: !!user.is_solde,
      },
      token,
    });
  } catch (err) {
    await connection.rollback();
    console.error('Facebook authentication error:', err);
    next(err);
  } finally {
    connection.release();
  }
});

// ==================== GET CURRENT USER ====================
// GET /api/users/auth/me - Get current authenticated user
router.get('/me', async (req, res, next) => {
  try {
    const debug = String(process.env.DEBUG_AUTH_ME || '').toLowerCase() === '1' ||
      String(process.env.DEBUG_AUTH_ME || '').toLowerCase() === 'true';
    const reqId = req.headers['x-request-id'] || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const t0 = process.hrtime.bigint();

    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: 'Token manquant' });
    }

    let decoded;
    try {
      if (debug) console.log(`[auth/me][${reqId}] jwt.verify:start`);
      decoded = jwt.verify(token, getJwtSecret());
      if (debug) console.log(`[auth/me][${reqId}] jwt.verify:ok userId=${decoded?.id}`);
    } catch (err) {
      if (debug) console.log(`[auth/me][${reqId}] jwt.verify:fail ${(err && err.message) ? err.message : err}`);
      return res.status(401).json({ message: 'Token invalide' });
    }

    // Schema ensure is executed once at process startup (and is cached if called elsewhere).
    await ensureOtpSchema().catch(() => {});

    const tQueryStart = process.hrtime.bigint();
    const [users] = await pool.query(
      `SELECT id, prenom, nom, email, telephone, type_compte, auth_provider, 
              email_verified, phone_verified, avatar_url, locale, is_active, last_login_at, created_at,
              nom_complet, adresse,
              shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_postal_code, shipping_country,
              societe, ice, is_company, is_solde,
              plafond, montant_garantie, numero_garantie,
              demande_artisan, artisan_approuve, type_compte_demande,
              COALESCE(remise_balance, 0) AS remise_balance
       FROM contacts WHERE id = ? AND deleted_at IS NULL AND auth_provider != 'none'`,
      [decoded.id]
    );
    const tQueryEnd = process.hrtime.bigint();

    const user = users[0];

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: 'Compte désactivé' });
    }

    const { plafond, montant_garantie, limite_solde, solde_cumule, solde_available } =
      await getEcommerceCredit(pool, user);
    const maalem_profile = await findMaalemProfileByContactId(pool, user.id);

    if (debug) {
      const tEnd = process.hrtime.bigint();
      const totalMs = Number(tEnd - t0) / 1e6;
      const queryMs = Number(tQueryEnd - tQueryStart) / 1e6;
      console.log(
        `[auth/me][${reqId}] ok total=${totalMs.toFixed(1)}ms db=${queryMs.toFixed(1)}ms ip=${req.ip}`
      );
    }

    res.json({
      user: {
        id: user.id,
        prenom: user.prenom,
        nom: user.nom,
        nom_complet: user.nom_complet,
        email: user.email,
        telephone: user.telephone,
        adresse: user.adresse,
        societe: user.societe,
        ice: user.ice,
        is_company: !!user.is_company,
        is_solde: !!user.is_solde,
        plafond: plafond,
        montant_garantie,
        numero_garantie: user.numero_garantie,
        limite_solde,
        solde_cumule,
        solde_available,
        shipping_address_line1: user.shipping_address_line1,
        shipping_address_line2: user.shipping_address_line2,
        shipping_city: user.shipping_city,
        shipping_state: user.shipping_state,
        shipping_postal_code: user.shipping_postal_code,
        shipping_country: user.shipping_country,
        type_compte: user.type_compte,
        auth_provider: user.auth_provider,
        email_verified: !!user.email_verified,
        phone_verified: !!user.phone_verified,
        avatar_url: user.avatar_url,
        locale: user.locale,
        last_login_at: user.last_login_at,
        created_at: user.created_at,
        demande_artisan: !!user.demande_artisan,
        artisan_approuve: !!user.artisan_approuve,
        type_compte_demande: user.type_compte_demande || null,
        remise_balance: Number(user.remise_balance || 0),
        maalem_profile,
      },
    });
  } catch (err) {
    const debug = String(process.env.DEBUG_AUTH_ME || '').toLowerCase() === '1' ||
      String(process.env.DEBUG_AUTH_ME || '').toLowerCase() === 'true';
    if (debug) console.log(`[auth/me] error`, err);
    next(err);
  }
});

// ==================== UPDATE CURRENT USER PROFILE ====================
// PUT /api/users/auth/me - Update authenticated user's profile (no email changes)
router.put('/me', receiveProfileAvatar, async (req, res, next) => {
  const connection = await pool.getConnection();
  let savedAvatar;
  let committed = false;
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: 'Token manquant' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, getJwtSecret());
    } catch (err) {
      return res.status(401).json({ message: 'Token invalide' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'email')) {
      return res.status(400).json({
        message: "La mise à jour de l'email n'est pas autorisée via cet endpoint",
        field: 'email',
      });
    }

    await ensureContactsCheckoutColumns(connection);
    await ensureOtpSchema(connection).catch(() => {});

    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, prenom, nom, telephone, is_active
       FROM contacts
       WHERE id = ? AND deleted_at IS NULL AND auth_provider != 'none'
       FOR UPDATE`,
      [decoded.id]
    );

    const current = rows[0];
    if (!current) {
      await connection.rollback();
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }
    if (!current.is_active) {
      await connection.rollback();
      return res.status(403).json({ message: 'Compte désactivé' });
    }

    const normalizeNullableText = (value) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      const s = String(value).trim();
      return s.length === 0 ? null : s;
    };

    const updates = [];
    const params = [];
    if (req.file) {
      savedAvatar = await saveProfileAvatar(req.file, current.id);
      updates.push('avatar_url = ?');
      params.push(savedAvatar.publicUrl);
    } else if (Object.prototype.hasOwnProperty.call(req.body || {}, 'avatar_url')) {
      updates.push('avatar_url = ?');
      params.push(normalizeProfileAvatar(req.body.avatar_url));
    }

    const allowed = {
      // avatar_url is validated separately above and included in allowed_fields.
      prenom: 'prenom',
      nom: 'nom',
      telephone: 'telephone',
      adresse: 'adresse',
      shipping_address_line1: 'shipping_address_line1',
      shipping_address_line2: 'shipping_address_line2',
      shipping_city: 'shipping_city',
      shipping_state: 'shipping_state',
      shipping_postal_code: 'shipping_postal_code',
      shipping_country: 'shipping_country',
    };

    for (const [bodyKey, column] of Object.entries(allowed)) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, bodyKey)) {
        const value = normalizeNullableText(req.body[bodyKey]);
        updates.push(`${column} = ?`);
        params.push(value);
      }
    }

    // A new phone number has to be confirmed again before it can reset the password.
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'telephone')) {
      const before = normalizePhone(current.telephone) || String(current.telephone || '').trim();
      const after = normalizePhone(req.body.telephone) || String(req.body.telephone || '').trim();
      if (before !== after) updates.push('phone_verified = 0');
    }

    // Keep nom_complet in sync if prenom/nom were provided
    const nextPrenom = Object.prototype.hasOwnProperty.call(req.body || {}, 'prenom')
      ? normalizeNullableText(req.body.prenom)
      : (current.prenom != null ? String(current.prenom) : null);
    const nextNom = Object.prototype.hasOwnProperty.call(req.body || {}, 'nom')
      ? normalizeNullableText(req.body.nom)
      : (current.nom != null ? String(current.nom) : null);

    const prenomWasProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'prenom');
    const nomWasProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'nom');
    if (prenomWasProvided || nomWasProvided) {
      const nomComplet = `${nextPrenom || ''} ${nextNom || ''}`.trim();
      updates.push('nom_complet = ?');
      params.push(nomComplet.length > 0 ? nomComplet : null);
    }

    if (updates.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        message: 'Aucune mise à jour fournie',
        allowed_fields: [...Object.keys(allowed), 'avatar_url'],
      });
    }

    params.push(decoded.id);
    await connection.query(
      `UPDATE contacts
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = ?`,
      params
    );

    await connection.commit();
    committed = true;

    // Return fresh profile (same shape as GET /me)
    const [users] = await pool.query(
      `SELECT id, prenom, nom, email, telephone, type_compte, auth_provider,
              email_verified, phone_verified, avatar_url, locale, is_active, last_login_at, created_at,
              nom_complet, adresse,
              shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_postal_code, shipping_country,
              societe, ice, is_company, is_solde,
              demande_artisan, artisan_approuve,
              COALESCE(remise_balance, 0) AS remise_balance
       FROM contacts WHERE id = ? AND deleted_at IS NULL AND auth_provider != 'none'`,
      [decoded.id]
    );

    const user = users[0];
    res.json({
      message: 'Profil mis à jour avec succès',
      user: {
        id: user.id,
        prenom: user.prenom,
        nom: user.nom,
        nom_complet: user.nom_complet,
        email: user.email,
        telephone: user.telephone,
        adresse: user.adresse,
        societe: user.societe,
        ice: user.ice,
        is_company: !!user.is_company,
        is_solde: !!user.is_solde,
        shipping_address_line1: user.shipping_address_line1,
        shipping_address_line2: user.shipping_address_line2,
        shipping_city: user.shipping_city,
        shipping_state: user.shipping_state,
        shipping_postal_code: user.shipping_postal_code,
        shipping_country: user.shipping_country,
        type_compte: user.type_compte,
        auth_provider: user.auth_provider,
        email_verified: !!user.email_verified,
        phone_verified: !!user.phone_verified,
        avatar_url: user.avatar_url,
        locale: user.locale,
        last_login_at: user.last_login_at,
        created_at: user.created_at,
        demande_artisan: !!user.demande_artisan,
        artisan_approuve: !!user.artisan_approuve,
        remise_balance: Number(user.remise_balance || 0),
      },
    });
  } catch (err) {
    if (savedAvatar && !committed) await fs.unlink(savedAvatar.absolutePath).catch(() => {});
    try {
      await connection.rollback();
    } catch (e) {
      // ignore rollback errors
    }
    next(err);
  } finally {
    connection.release();
  }
});

// ==================== DELETE CURRENT USER ====================
// DELETE /api/users/auth/me - The customer deletes their own account (from the app or the site).
// An account with a password confirms it; Google / Facebook / code-only accounts confirm with their session.
router.delete('/me', async (req, res, next) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Token manquant' });
  let decoded;
  try {
    decoded = jwt.verify(token, getJwtSecret());
  } catch {
    return res.status(401).json({ message: 'Token invalide' });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[user]] = await connection.query(
      "SELECT id, password FROM contacts WHERE id = ? AND deleted_at IS NULL AND auth_provider != 'none' FOR UPDATE",
      [decoded.id],
    );
    if (!user) {
      await connection.rollback();
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }
    if (user.password) {
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!password || !(await bcrypt.compare(password, user.password))) {
        await connection.rollback();
        return res.status(403).json({ message: 'Mot de passe incorrect', field: 'password', code: 'PASSWORD_REQUIRED' });
      }
    }
    const { kept } = await deleteCustomerAccount(connection, user.id);
    await connection.commit();
    res.json({ ok: true, kept });
  } catch (err) {
    await connection.rollback().catch(() => {});
    next(err);
  } finally {
    connection.release();
  }
});

// ==================== LOGOUT ====================
// POST /api/users/auth/logout - Logout (client-side token removal mainly)
router.post('/logout', async (req, res) => {
  // For JWT, logout is mainly client-side (remove token)
  // But we can track logout events if needed
  res.json({ message: 'Déconnexion réussie' });
});

export default router;
