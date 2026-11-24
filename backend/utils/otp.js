/**
 * One-time codes for customer accounts: confirming a new account's e-mail or phone, and resetting a forgotten password.
 * Pure rules only (no database, no network) so they can be tested on their own.
 */
import crypto from 'node:crypto';

export const CODE_LENGTH = 6;
export const CODE_TTL_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
/** Seconds to wait before asking for another code to the same address. */
export const RESEND_AFTER_SECONDS = 60;
/** Codes sent to one address per hour, and from one network address per hour. */
export const MAX_PER_TARGET_PER_HOUR = 5;
export const MAX_PER_IP_PER_HOUR = 20;

export const PURPOSES = ['register', 'verify', 'reset'];
export const CHANNELS = ['email', 'phone'];

export function generateCode() {
  return String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
}

/** The code is never stored as such: only a keyed hash, tied to its request. */
export function hashCode(code, requestId, secret) {
  return crypto.createHmac('sha256', String(secret)).update(`${requestId}:${String(code).trim()}`).digest('hex');
}

export function sameHash(a, b) {
  const x = Buffer.from(String(a || ''), 'hex');
  const y = Buffer.from(String(b || ''), 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

/** A request id the app keeps between "send" and "confirm": random, so ids cannot be guessed. */
export function newRequestId() {
  return crypto.randomBytes(18).toString('base64url');
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

/**
 * A Moroccan mobile or landline number in any usual spelling ("06 12 34 56 78", "+212612345678", "00212 6…"),
 * as its national form "0612345678"; null when it is not one.
 */
export function normalizePhone(value) {
  let digits = String(value || '').replace(/[\s.\-()]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith('212') && digits.length === 12) digits = `0${digits.slice(3)}`;
  if (digits.length === 9 && /^[5-7]/.test(digits)) digits = `0${digits}`;
  return /^0[5-7]\d{8}$/.test(digits) ? digits : null;
}

/** The ways the same number can be stored on a contact, to find it whatever its spelling. */
export function phoneVariants(value) {
  const national = normalizePhone(value);
  if (!national) return [];
  const rest = national.slice(1);
  return [national, `+212${rest}`, `212${rest}`, `00212${rest}`];
}

/** The number in international form, as SMS services want it. */
export function internationalPhone(value) {
  const national = normalizePhone(value);
  return national ? `+212${national.slice(1)}` : null;
}

/** "an••••@gmail.com": enough to recognise one's own address, not to learn someone else's. */
export function maskEmail(email) {
  const [user, domain] = String(email || '').split('@');
  if (!user || !domain) return '';
  const keep = user.length <= 2 ? user.slice(0, 1) : user.slice(0, 2);
  return `${keep}${'•'.repeat(Math.max(2, Math.min(6, user.length - keep.length)))}@${domain}`;
}

/** "06 •• •• •• 78". */
export function maskPhone(phone) {
  const national = normalizePhone(phone);
  if (!national) return '';
  return `${national.slice(0, 2)} •• •• •• ${national.slice(8)}`;
}

/**
 * Whether another code may be sent now. `recent` is the list of codes sent in the last hour to this address
 * (`created_at`), `fromIp` the number sent from the caller's network address in the last hour.
 * Returns { ok: true } or { ok: false, retry_after } in seconds.
 */
export function sendAllowed({ recent = [], fromIp = 0, now = Date.now() }) {
  if (fromIp >= MAX_PER_IP_PER_HOUR) return { ok: false, retry_after: 3600 };
  const times = recent.map((r) => new Date(r).getTime()).filter(Number.isFinite).sort((a, b) => b - a);
  if (times.length >= MAX_PER_TARGET_PER_HOUR) {
    const oldest = times[MAX_PER_TARGET_PER_HOUR - 1];
    return { ok: false, retry_after: Math.max(1, Math.ceil((oldest + 3600_000 - now) / 1000)) };
  }
  if (times.length && now - times[0] < RESEND_AFTER_SECONDS * 1000) {
    return { ok: false, retry_after: Math.ceil((times[0] + RESEND_AFTER_SECONDS * 1000 - now) / 1000) };
  }
  return { ok: true };
}

/**
 * Where a forgotten password can be reset: only through an address the customer has confirmed.
 * Returns the list of { channel, masked } the app offers to choose from.
 */
export function resetChannels(contact) {
  if (!contact) return [];
  const out = [];
  if (contact.email && contact.email_verified && isValidEmail(contact.email)) out.push({ channel: 'email', masked: maskEmail(contact.email) });
  if (contact.telephone && contact.phone_verified && normalizePhone(contact.telephone)) out.push({ channel: 'phone', masked: maskPhone(contact.telephone) });
  return out;
}

/** Checks a code typed by the customer against its stored request. */
export function checkCode(request, code, secret, now = Date.now()) {
  if (!request) return { ok: false, reason: 'NOT_FOUND' };
  if (request.consumed_at) return { ok: false, reason: 'USED' };
  if (new Date(request.expires_at).getTime() <= now) return { ok: false, reason: 'EXPIRED' };
  if (Number(request.attempts) >= MAX_ATTEMPTS) return { ok: false, reason: 'TOO_MANY' };
  const typed = String(code || '').replace(/\D/g, '');
  if (typed.length !== CODE_LENGTH) return { ok: false, reason: 'WRONG', attempts_left: MAX_ATTEMPTS - Number(request.attempts) };
  if (!sameHash(hashCode(typed, request.request_id, secret), request.code_hash)) {
    return { ok: false, reason: 'WRONG', attempts_left: Math.max(0, MAX_ATTEMPTS - Number(request.attempts) - 1) };
  }
  return { ok: true };
}

const TEXT = {
  fr: {
    register: 'confirmer votre compte',
    verify: 'confirmer cette adresse',
    reset: 'choisir un nouveau mot de passe',
    subject: (code) => `${code} est votre code Boukir Diamond`,
    sms: (code, why) => `Boukir Diamond : ${code} est votre code pour ${why}. Il expire dans ${CODE_TTL_MINUTES} minutes. Ne le partagez avec personne.`,
    hello: 'Bonjour',
    intro: (why) => `Voici votre code pour ${why} :`,
    expires: `Ce code expire dans ${CODE_TTL_MINUTES} minutes. Ne le communiquez à personne, même à un employé du magasin.`,
    ignore: "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : rien ne change sur votre compte.",
  },
  ar: {
    register: 'تأكيد حسابك',
    verify: 'تأكيد هذا العنوان',
    reset: 'اختيار كلمة مرور جديدة',
    subject: (code) => `${code} هو رمزك في Boukir Diamond`,
    sms: (code, why) => `Boukir Diamond: ${code} هو رمزك من أجل ${why}. صالح لمدة ${CODE_TTL_MINUTES} دقائق. لا تشاركه مع أي أحد.`,
    hello: 'مرحبا',
    intro: (why) => `هذا هو رمزك من أجل ${why}:`,
    expires: `ينتهي هذا الرمز بعد ${CODE_TTL_MINUTES} دقائق. لا تعطه لأي أحد، حتى لموظف في المتجر.`,
    ignore: 'إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة: لن يتغير شيء في حسابك.',
  },
  en: {
    register: 'confirm your account',
    verify: 'confirm this address',
    reset: 'choose a new password',
    subject: (code) => `${code} is your Boukir Diamond code`,
    sms: (code, why) => `Boukir Diamond: ${code} is your code to ${why}. It expires in ${CODE_TTL_MINUTES} minutes. Do not share it.`,
    hello: 'Hello',
    intro: (why) => `Here is your code to ${why}:`,
    expires: `This code expires in ${CODE_TTL_MINUTES} minutes. Never give it to anyone, not even a shop employee.`,
    ignore: 'If you did not ask for it, ignore this message: nothing changes on your account.',
  },
};

export function textsFor(locale) {
  const lang = String(locale || 'fr').slice(0, 2).toLowerCase();
  return TEXT[lang] || (lang === 'es' || lang === 'zh' ? TEXT.en : TEXT.fr);
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The e-mail and SMS for one code, in the customer's language. */
export function codeMessage({ code, purpose, locale, name }) {
  const t = textsFor(locale);
  const why = t[purpose] || t.verify;
  const rtl = String(locale || '').startsWith('ar');
  const spaced = String(code).split('').join(' ');
  const html = `<!doctype html><html lang="${rtl ? 'ar' : 'fr'}" dir="${rtl ? 'rtl' : 'ltr'}"><body style="margin:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e7e1d4">
<tr><td style="background:#111827;padding:18px 24px;color:#d4a017;font-size:20px;font-weight:bold;letter-spacing:1px">BOUKIR DIAMOND<div style="color:#e5e7eb;font-size:11px;font-weight:normal;letter-spacing:3px">CONSTRUCTION STORE</div></td></tr>
<tr><td style="padding:26px 24px 8px;font-size:15px;line-height:1.5">${escapeHtml(t.hello)}${name ? ` ${escapeHtml(name)}` : ''},<br>${escapeHtml(t.intro(why))}</td></tr>
<tr><td align="center" style="padding:14px 24px"><div style="display:inline-block;background:#fff7e0;border:2px solid #d4a017;border-radius:12px;padding:14px 22px;font-size:32px;font-weight:bold;letter-spacing:6px;color:#111827;direction:ltr">${escapeHtml(spaced)}</div></td></tr>
<tr><td style="padding:8px 24px 6px;font-size:13px;line-height:1.5;color:#4b5563">${escapeHtml(t.expires)}</td></tr>
<tr><td style="padding:6px 24px 24px;font-size:12px;line-height:1.5;color:#6b7280">${escapeHtml(t.ignore)}</td></tr>
<tr><td style="background:#f9fafb;padding:12px 24px;font-size:11px;color:#9ca3af;border-top:1px solid #eee">Boukir Diamond · Construction Store</td></tr>
</table></td></tr></table></body></html>`;
  return {
    code: String(code),
    subject: t.subject(code),
    html,
    text: `${t.hello}${name ? ` ${name}` : ''},\n${t.intro(why)} ${code}\n\n${t.expires}\n${t.ignore}`,
    sms: t.sms(code, why),
  };
}
