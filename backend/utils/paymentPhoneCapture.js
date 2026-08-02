import crypto from 'node:crypto';

export const PAYMENT_CAPTURE_TTL_MS = 10 * 60 * 1000;

export function generateCaptureToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashCaptureToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

export function isValidCaptureToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function captureAvailability(session, now = new Date()) {
  if (!session) return { available: false, reason: 'not_found' };
  if (session.status === 'uploaded') return { available: false, reason: 'used' };
  if (session.status === 'cancelled') return { available: false, reason: 'cancelled' };
  if (new Date(session.expires_at).getTime() <= now.getTime()) {
    return { available: false, reason: 'expired' };
  }
  return { available: true, reason: 'pending' };
}
