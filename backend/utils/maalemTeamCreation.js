import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { validateMaalemProfessionalData } from './maalemProfile.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trimmedText(value, maxLength, label, { required = false } = {}) {
  if (value == null || value === '') {
    return required
      ? { valid: false, error: `${label} est requis(e)` }
      : { valid: true, value: null };
  }
  if (typeof value !== 'string') return { valid: false, error: `${label} doit être un texte` };
  const normalized = value.trim();
  if (required && !normalized) return { valid: false, error: `${label} est requis(e)` };
  if (normalized.length > maxLength) {
    return { valid: false, error: `${label} ne peut pas dépasser ${maxLength} caractères` };
  }
  return { valid: true, value: normalized || null };
}

export function normalizeMaalemIdentityEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function normalizeMoroccanPhone(value) {
  const compact = String(value || '').replace(/[\s().-]/g, '');
  if (/^0[5-7]\d{8}$/.test(compact)) return `+212${compact.slice(1)}`;
  if (/^212[5-7]\d{8}$/.test(compact)) return `+${compact}`;
  if (/^\+212[5-7]\d{8}$/.test(compact)) return compact;
  return null;
}

export function phoneIdentityCandidates(value) {
  const canonical = normalizeMoroccanPhone(value);
  return canonical ? [canonical, `0${canonical.slice(4)}`] : [];
}

export function validateMaalemTeamLookup(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Recherche invalide' };
  }
  const email = normalizeMaalemIdentityEmail(body.email);
  const phone = normalizeMoroccanPhone(body.telephone);
  if (!email && !phone) return { valid: false, error: 'Un email ou un téléphone est requis' };
  if (email && !EMAIL_PATTERN.test(email)) return { valid: false, error: 'Format d’email invalide' };
  if (email.length > 255) return { valid: false, error: 'L’email ne peut pas dépasser 255 caractères' };
  if (body.telephone != null && String(body.telephone).trim() && !phone) {
    return { valid: false, error: 'Format de téléphone marocain invalide' };
  }
  return { valid: true, email: email || null, telephone: phone };
}

export function validateMaalemTeamCreateInput(body) {
  const lookup = validateMaalemTeamLookup(body);
  if (!lookup.valid) return lookup;

  const prenom = trimmedText(body.prenom, 100, 'Le prénom', { required: true });
  if (!prenom.valid) return prenom;
  const nom = trimmedText(body.nom, 100, 'Le nom', { required: true });
  if (!nom.valid) return nom;
  if (!lookup.telephone) return { valid: false, error: 'Le téléphone est requis pour sécuriser l’invitation' };
  if (!lookup.email) return { valid: false, error: 'L’email est requis pour créer le compte e-commerce' };
  if (!Number.isSafeInteger(body.category_id) || body.category_id <= 0) {
    return { valid: false, error: 'Une catégorie Maalem active est requise' };
  }

  if (body.professional_data != null && (
    typeof body.professional_data !== 'object' || Array.isArray(body.professional_data)
  )) {
    return { valid: false, error: 'Les informations professionnelles sont invalides' };
  }
  const professionalData = validateMaalemProfessionalData({
    ...(body.professional_data || {}),
    contact_phone: body.professional_data?.contact_phone || lookup.telephone,
  });
  if (!professionalData.valid) return professionalData;

  return {
    valid: true,
    prenom: prenom.value,
    nom: nom.value,
    email: lookup.email,
    telephone: lookup.telephone,
    category_id: body.category_id,
    professional_data: professionalData.data,
  };
}

export function createMaalemActivationToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, token_hash: hashMaalemActivationToken(token) };
}

export function hashMaalemActivationToken(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

export function buildMaalemActivationUrl(token, locale = 'fr') {
  const configured = String(process.env.ECOMMERCE_FRONTEND_URL || 'http://localhost:3002').trim();
  const base = configured.replace(/\/+$/, '');
  const safeLocale = ['fr', 'ar', 'en', 'zh'].includes(locale) ? locale : 'fr';
  // Keep the secret in the URL fragment so it is not sent in HTTP/RSC access logs.
  return `${base}/${safeLocale}/activate-account#token=${encodeURIComponent(token)}`;
}

export async function consumeMaalemActivationToken(connection, { token, password }) {
  const tokenHash = hashMaalemActivationToken(token);
  const [rows] = await connection.query(
    `SELECT id
     FROM contacts
     WHERE reset_token = ? AND reset_token_expires_at > CURRENT_TIMESTAMP
       AND deleted_at IS NULL AND auth_provider = 'local'
       AND is_active = 1 AND COALESCE(is_blocked, 0) = 0
     LIMIT 1
     FOR UPDATE`,
    [tokenHash]
  );
  const contact = rows[0];
  if (!contact) return null;

  const hashedPassword = await bcrypt.hash(password, 10);
  const [result] = await connection.query(
    `UPDATE contacts
     SET password = ?, reset_token = NULL, reset_token_expires_at = NULL,
         login_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND reset_token = ?`,
    [hashedPassword, contact.id, tokenHash]
  );
  return result.affectedRows ? Number(contact.id) : null;
}
