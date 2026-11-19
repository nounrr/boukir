/**
 * Sends a one-time code by e-mail or SMS, through HTTP services (no extra package needed):
 *   E-mail: Brevo or Resend      EMAIL_PROVIDER=brevo|resend, EMAIL_API_KEY, EMAIL_FROM, EMAIL_FROM_NAME (optional)
 *   SMS:    Twilio               TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_SMS_FROM or TWILIO_SMS_SERVICE_SID
 * On a developer's computer without these, OTP_DEV_LOG=1 prints the code in the server's console instead
 * (never in production).
 */
import axios from 'axios';
import { internationalPhone } from './otp.js';

export class DeliveryUnavailable extends Error {
  constructor(channel) {
    super(channel === 'email'
      ? "L'envoi des codes par e-mail n'est pas encore configuré sur le serveur."
      : "L'envoi des codes par SMS n'est pas encore configuré sur le serveur.");
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

export function smsConfigured() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM, TWILIO_SMS_SERVICE_SID } = process.env;
  return !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && (TWILIO_SMS_FROM || TWILIO_SMS_SERVICE_SID));
}

/** Which channels can carry a code right now (the app hides the others). */
export function availableChannels() {
  return { email: emailConfigured() || devLog(), phone: smsConfigured() || devLog() };
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

/** Sends the code; throws DeliveryUnavailable when nothing is set up, or a 502 when the service refuses. */
export async function deliverCode({ channel, target, message }) {
  const ready = channel === 'email' ? emailConfigured() : smsConfigured();
  if (!ready) {
    if (devLog()) {
      console.log(`[otp:dev] ${channel} ${target} → ${message.sms}`);
      return { dev: true };
    }
    throw new DeliveryUnavailable(channel);
  }
  try {
    if (channel === 'email') await sendEmail(target, message);
    else await sendSms(target, message.sms);
    return { dev: false };
  } catch (err) {
    console.error(`[otp] ${channel} delivery failed:`, err?.response?.status, err?.response?.data || err?.message);
    const failure = new Error(channel === 'email'
      ? "Le code n'a pas pu être envoyé par e-mail. Réessayez dans un instant."
      : "Le code n'a pas pu être envoyé par SMS. Vérifiez le numéro et réessayez.");
    failure.status = 502;
    failure.code = 'DELIVERY_FAILED';
    throw failure;
  }
}
