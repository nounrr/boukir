import { Router } from 'express';
import pool from '../db/pool.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';

const router = Router();

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
  return jwt.sign(payload, process.env.JWT_SECRET || 'dev-secret', {
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
    const { prenom, nom, email, telephone, type_compte, password, confirm_password } = req.body;

    // Validation
    if (!prenom || !nom || !email || !password) {
      return res.status(400).json({
        message: 'Les champs prénom, nom, email et mot de passe sont obligatoires',
        field: !prenom ? 'prenom' : !nom ? 'nom' : !email ? 'email' : 'password',
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Format d\'email invalide', field: 'email' });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: 'Le mot de passe doit contenir au moins 8 caractères',
        field: 'password',
      });
    }

    if (password !== confirm_password) {
      return res.status(400).json({
        message: 'Les mots de passe ne correspondent pas',
        field: 'confirm_password',
      });
    }

    if (type_compte && !['Client', 'Artisan/Promoteur'].includes(type_compte)) {
      return res.status(400).json({
        message: 'Type de compte invalide',
        field: 'type_compte',
      });
    }

    await connection.beginTransaction();

    // Check if email already exists
    const [existing] = await connection.query(
      'SELECT id, email, auth_provider FROM contacts WHERE email = ? AND deleted_at IS NULL',
      [email.toLowerCase()]
    );

    if (existing.length > 0) {
      const existingUser = existing[0];
      if (existingUser.auth_provider === 'local') {
        return res.status(409).json({
          message: 'Un compte existe déjà avec cet email',
          field: 'email',
        });
      } else if (existingUser.auth_provider !== 'none') {
        return res.status(409).json({
          message: `Un compte existe déjà avec cet email via ${existingUser.auth_provider === 'google' ? 'Google' : 'Facebook'}. Veuillez vous connecter avec ${existingUser.auth_provider === 'google' ? 'Google' : 'Facebook'}.`,
          field: 'email',
          sso_provider: existingUser.auth_provider,
        });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Determine account type and approval status
    const isArtisanRequest = type_compte === 'Artisan/Promoteur';
    const effectiveTypeCompte = isArtisanRequest ? 'Client' : (type_compte || 'Client');
    const demandeArtisan = isArtisanRequest;

    // Create nom_complet for BO compatibility
    const nomComplet = `${prenom.trim()} ${nom.trim()}`;

    // Insert new contact/user
    const [result] = await connection.query(
      `INSERT INTO contacts 
       (nom_complet, prenom, nom, email, telephone, type, type_compte, 
        demande_artisan, artisan_approuve, password, auth_provider, 
        email_verified, is_active) 
       VALUES (?, ?, ?, ?, ?, 'Client', ?, ?, FALSE, ?, 'local', FALSE, TRUE)`,
      [
        nomComplet,
        prenom.trim(),
        nom.trim(),
        email.toLowerCase().trim(),
        telephone?.trim() || null,
        effectiveTypeCompte,
        demandeArtisan,
        hashedPassword,
      ]
    );

    const userId = result.insertId;

    // Fetch created user
    const [users] = await connection.query(
      `SELECT id, prenom, nom, email, telephone, type_compte, auth_provider, 
              email_verified, avatar_url, locale, is_active, demande_artisan,
              artisan_approuve, created_at
       FROM contacts WHERE id = ?`,
      [userId]
    );

    await connection.commit();

    const user = users[0];
    const token = generateToken(user);

    // Prepare response message
    let message = 'Compte créé avec succès';
    if (user.demande_artisan && !user.artisan_approuve) {
      message = 'Compte créé avec succès. Votre demande pour devenir Artisan/Promoteur est en attente d\'approbation par un administrateur.';
    }

    res.status(201).json({
      message,
      user: {
        id: user.id,
        prenom: user.prenom,
        nom: user.nom,
        email: user.email,
        telephone: user.telephone,
        type_compte: user.type_compte,
        auth_provider: user.auth_provider,
        email_verified: !!user.email_verified,
        avatar_url: user.avatar_url,
        locale: user.locale,
        demande_artisan: !!user.demande_artisan,
        artisan_approuve: !!user.artisan_approuve,
      },
      token,
    });
  } catch (err) {
    await connection.rollback();
    console.error('Registration error:', err);
    next(err);
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

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        message: 'Email et mot de passe requis',
        field: !email ? 'email' : 'password',
      });
    }

    // Find user by email
    const [users] = await connection.query(
      `SELECT id, prenom, nom, email, telephone, type_compte, password, auth_provider, 
              email_verified, avatar_url, locale, is_active, is_blocked, 
              login_attempts, locked_until, last_login_at, demande_artisan, artisan_approuve
       FROM contacts WHERE email = ? AND deleted_at IS NULL AND auth_provider != 'none'`,
      [email.toLowerCase()]
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
        email: user.email,
        telephone: user.telephone,
        type_compte: user.type_compte,
        auth_provider: user.auth_provider,
        email_verified: !!user.email_verified,
        avatar_url: user.avatar_url,
        locale: user.locale,
        demande_artisan: !!user.demande_artisan,
        artisan_approuve: !!user.artisan_approuve,
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

// ==================== GOOGLE SSO ====================
// POST /api/users/auth/google - Login/Register with Google
router.post('/google', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { credential, access_token } = req.body;
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;

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
              locked_until, google_id, demande_artisan, artisan_approuve
       FROM contacts WHERE google_id = ? AND deleted_at IS NULL`,
      [googleId]
    );

    let user = users[0];

    if (user) {
      // Existing Google user - update and login
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

      // Update user info from Google
      await connection.query(
        `UPDATE contacts
         SET avatar_url = ?, email_verified = TRUE, locale = ?,
             last_login_at = NOW(), last_login_ip = ?,
             provider_access_token = ?, login_attempts = 0, locked_until = NULL
         WHERE id = ?`,
        [avatar_url, locale || 'fr', clientIp, access_token || null, user.id]
      );

      user.avatar_url = avatar_url;
      user.email_verified = true;
      user.locale = locale || 'fr';
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
        } else if (existingUser.auth_provider === 'facebook') {
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

      const [result] = await connection.query(
        `INSERT INTO contacts
         (nom_complet, prenom, nom, email, type, type_compte, auth_provider, google_id,
          avatar_url, email_verified, locale, is_active, last_login_at, last_login_ip,
          provider_access_token) 
         VALUES (?, ?, ?, ?, 'Client', 'Client', 'google', ?, ?, TRUE, ?, TRUE, NOW(), ?, ?)`,
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
        ]
      );

      const userId = result.insertId;

      [users] = await connection.query(
        `SELECT id, prenom, nom, email, telephone, type_compte, auth_provider, 
                email_verified, avatar_url, locale, demande_artisan, artisan_approuve
         FROM contacts WHERE id = ?`,
        [userId]
      );

      user = users[0];
    }

    await connection.commit();

    const token = generateToken(user);

    res.json({
      message: user.id ? 'Connexion réussie avec Google' : 'Compte créé avec Google',
      user: {
        id: user.id,
        prenom: user.prenom,
        nom: user.nom,
        email: user.email,
        telephone: user.telephone,
        type_compte: user.type_compte,
        auth_provider: user.auth_provider,
        email_verified: !!user.email_verified,
        avatar_url: user.avatar_url,
        locale: user.locale,
        demande_artisan: !!user.demande_artisan,
        artisan_approuve: !!user.artisan_approuve,
      },
      token,
    });
  } catch (err) {
    await connection.rollback();
    console.error('Google authentication error:', err);
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
    const { accessToken, userID } = req.body;
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
              locked_until, facebook_id, demande_artisan, artisan_approuve
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
      await connection.query(
        `UPDATE contacts
         SET avatar_url = ?, email_verified = TRUE,
             last_login_at = NOW(), last_login_ip = ?,
             provider_access_token = ?, login_attempts = 0, locked_until = NULL
         WHERE id = ?`,
        [avatar_url, clientIp, accessToken, user.id]
      );

      user.avatar_url = avatar_url;
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
          provider_access_token) 
         VALUES (?, ?, ?, ?, 'Client', 'Client', 'facebook', ?, ?, TRUE, TRUE, NOW(), ?, ?)`,
        [
          nomComplet,
          prenomValue,
          nomValue,
          email.toLowerCase(),
          facebookId,
          avatar_url,
          clientIp,
          accessToken,
        ]
      );

      const userId = result.insertId;

      [users] = await connection.query(
        `SELECT id, prenom, nom, email, telephone, type_compte, auth_provider, 
                email_verified, avatar_url, locale, demande_artisan, artisan_approuve
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
        avatar_url: user.avatar_url,
        locale: user.locale,
        demande_artisan: !!user.demande_artisan,
        artisan_approuve: !!user.artisan_approuve,
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
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: 'Token manquant' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    } catch (err) {
      return res.status(401).json({ message: 'Token invalide' });
    }

    const [users] = await pool.query(
      `SELECT id, prenom, nom, email, telephone, type_compte, auth_provider, 
              email_verified, avatar_url, locale, is_active, last_login_at, created_at,
              demande_artisan, artisan_approuve
       FROM contacts WHERE id = ? AND deleted_at IS NULL AND auth_provider != 'none'`,
      [decoded.id]
    );

    const user = users[0];

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: 'Compte désactivé' });
    }

    res.json({
      user: {
        id: user.id,
        prenom: user.prenom,
        nom: user.nom,
        email: user.email,
        telephone: user.telephone,
        type_compte: user.type_compte,
        auth_provider: user.auth_provider,
        email_verified: !!user.email_verified,
        avatar_url: user.avatar_url,
        locale: user.locale,
        last_login_at: user.last_login_at,
        created_at: user.created_at,
        demande_artisan: !!user.demande_artisan,
        artisan_approuve: !!user.artisan_approuve,
      },
    });
  } catch (err) {
    next(err);
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
