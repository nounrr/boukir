/**
 * Sends a one-time code by e-mail, WhatsApp or SMS, through HTTP services (no extra package needed):
 *   E-mail:   Brevo or Resend      EMAIL_PROVIDER=brevo|resend, EMAIL_API_KEY, EMAIL_FROM, EMAIL_FROM_NAME (optional)
 *   WhatsApp: Meta Cloud API       WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE (an approved
 *                                  "authentication" template), WHATSAPP_TEMPLATE_LANG (default fr),
 *                                  WHATSAPP_TEMPLATE_PARAMS: the template's {{1}}, {{2}}… separated by "|", where
 *                                  {code} is the code and {purpose} what it is for (default: just {code}).
 *                                  Without a template, the code goes as plain text: WhatsApp only delivers that to
 *                                  someone who wrote to the business number in the last 24 h (enough for testing).
 *   SMS:      Twilio               TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_SMS_FROM or TWILIO_SMS_SERVICE_SID
 * A phone number gets its code by WhatsApp when it is set up, and by SMS when WhatsApp is not set up or fails.
 * On a developer's computer without these, OTP_DEV_LOG=1 prints the code in the server's console instead
 * (never in production).
 */
import axios from 'axios';
import { internationalPhone } from './otp.js';

export class DeliveryUnavailable extends Error {
  constructor(channel) {
    super(channel === 'email'
      ? "L'envoi des codes par e-mail n'est pas encore configuré sur le serveur."
      : "L'envoi des codes par WhatsApp ou SMS n'est pas encore configuré sur le serveur.");
    this.status = 503;
    this.code = 'DELIVERY_UNAVAILABLE';
    this.channel = channel;
  }
}

const devLog = () => process.env.OTP_DEV_LOG === '1' && process.env.NODE_ENV !== 'production';

export function emailConfigured() {
  const p = String(process.env.EMAIL_PROVIDER || '').toLowerCase();
  return (p === 'brevo' || p === 'resend') && !!process.env.EMAIL_API_KEY && !!process.env.EMAIL_FROM;
}

export function whatsappConfigured() {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = process.env;
  return !!(WHATSAPP_TOKEN && WHATSAPP_PHONE_NUMBER_ID);
}

export function smsConfigured() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM, TWILIO_SMS_SERVICE_SID } = process.env;
  return !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && (TWILIO_SMS_FROM || TWILIO_SMS_SERVICE_SID));
}

/** Which channels can carry a code right now (the app hides the others). */
export function availableChannels() {
  return { email: emailConfigured() || devLog(), phone: whatsappConfigured() || smsConfigured() || devLog() };
}

async function sendEmail(to, message) {
  const provider = String(process.env.EMAIL_PROVIDER).toLowerCase();
  const fromName = process.env.EMAIL_FROM_NAME || 'Boukir Diamond';
  if (provider === 'brevo') {
    await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: { email: process.env.EMAIL_FROM, name: fromName },
        to: [{ email: to }],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
      },
      { headers: { 'api-key': process.env.EMAIL_API_KEY, 'content-type': 'application/json' }, timeout: 15000 },
    );
    return;
  }
  await axios.post(
    'https://api.resend.com/emails',
    { from: `${fromName} <${process.env.EMAIL_FROM}>`, to: [to], subject: message.subject, html: message.html, text: message.text },
    { headers: { Authorization: `Bearer ${process.env.EMAIL_API_KEY}` }, timeout: 15000 },
  );
}

/** Plain text: only delivered inside the 24 h after the person last wrote to the business number. */
export function whatsappTextBody(to, text) {
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to: internationalPhone(to).replace('+', ''), type: 'text', text: { body: text } };
}

// Meta allows at most 15 characters per variable.
const PURPOSES = { register: 'sign-up', reset: 'password reset', verify: 'phone check' };

/** The request body for Meta: an "authentication" template carries the code in its text and in its copy-code button. */
export function whatsappTemplateBody(to, code, env = process.env, purpose = 'verify') {
  const params = String(env.WHATSAPP_TEMPLATE_PARAMS || '{code}').split('|').map((p) =>
    p.trim().replaceAll('{code}', String(code)).replaceAll('{purpose}', PURPOSES[purpose] || PURPOSES.verify));
  const components = [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }];
  if (env.WHATSAPP_TEMPLATE_BUTTON !== '0') {
    components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: String(code) }] });
  }
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: internationalPhone(to).replace('+', ''),
    type: 'template',
    template: { name: env.WHATSAPP_TEMPLATE, language: { code: env.WHATSAPP_TEMPLATE_LANG || 'fr' }, components },
  };
}

async function sendWhatsapp(to, message) {
  const version = process.env.WHATSAPP_API_VERSION || 'v21.0';
  await axios.post(
    `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    process.env.WHATSAPP_TEMPLATE ? whatsappTemplateBody(to, message.code, process.env, message.purpose) : whatsappTextBody(to, message.sms),
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'content-type': 'application/json' }, timeout: 15000 },
  );
}

async function sendSms(to, text) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM, TWILIO_SMS_SERVICE_SID } = process.env;
  const form = new URLSearchParams({ To: internationalPhone(to), Body: text });
  if (TWILIO_SMS_SERVICE_SID) form.set('MessagingServiceSid', TWILIO_SMS_SERVICE_SID);
  else form.set('From', TWILIO_SMS_FROM);
  await axios.post(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, form.toString(), {
    auth: { username: TWILIO_ACCOUNT_SID, password: TWILIO_AUTH_TOKEN },
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });
}

const logFailure = (via, err) =>
  console.error(`[otp] ${via} delivery failed:`, err?.response?.status, JSON.stringify(err?.response?.data || err?.message));

/**
 * Sends the code and says how it went ({ via: 'email' | 'whatsapp' | 'sms' | 'dev' });
 * throws DeliveryUnavailable when nothing is set up, or a 502 when the service refuses.
 */
export async function deliverCode({ channel, target, message }) {
  if (channel === 'email') {
    if (!emailConfigured()) return devOrUnavailable(channel, target, message);
    try {
      await sendEmail(target, message);
      return { dev: false, via: 'email' };
    } catch (err) {
      logFailure('email', err);
      throw deliveryFailed("Le code n'a pas pu être envoyé par e-mail. Réessayez dans un instant.");
    }
  }

  if (whatsappConfigured()) {
    try {
      await sendWhatsapp(target, message);
      return { dev: false, via: 'whatsapp' };
    } catch (err) {
      logFailure('whatsapp', err);
      if (!smsConfigured()) {
        throw deliveryFailed("Le code n'a pas pu être envoyé par WhatsApp. Vérifiez que ce numéro utilise WhatsApp et réessayez.");
      }
    }
  }
  if (!smsConfigured()) return devOrUnavailable(channel, target, message);
  try {
    await sendSms(target, message.sms);
    return { dev: false, via: 'sms' };
  } catch (err) {
    logFailure('sms', err);
    throw deliveryFailed("Le code n'a pas pu être envoyé par SMS. Vérifiez le numéro et réessayez.");
  }
}

function devOrUnavailable(channel, target, message) {
  if (devLog()) {
    console.log(`[otp:dev] ${channel} ${target} → ${message.sms}`);
    return { dev: true, via: 'dev' };
  }
  throw new DeliveryUnavailable(channel);
}

function deliveryFailed(text) {
  const failure = new Error(text);
  failure.status = 502;
  failure.code = 'DELIVERY_FAILED';
  return failure;
}
