import { Router } from 'express';
import pool from '../../db/pool.js';
const router = Router();

// Simple in-memory rate limiter (per IP)
const limits = new Map();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQ = 30; // max requests/window

function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = limits.get(ip) || { count: 0, resetAt: now + WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + WINDOW_MS;
  }
  entry.count += 1;
  limits.set(ip, entry);
  if (entry.count > MAX_REQ) {
    return res.status(429).json({ message: 'Trop de requêtes, réessayez plus tard.' });
  }
  next();
}

function normalizePromoCode(code) {
  if (code === undefined || code === null) return '';
  return String(code).trim().toUpperCase();
}

function parseNumberLike(value) {
  if (value === undefined || value === null || value === '') return NaN;
  if (typeof value === 'number') return value;
  const s = String(value).trim().replace(/\s+/g, '').replace(',', '.');
  return Number(s);
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

// Require admin/manager roles for CRUD endpoints
function requireAdmin(req, res, next) {
  // optionalAuth in index.js decodes JWT if present; enforce presence here
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: 'Authentification requise' });
  }
  const role = user.role;
  const allowed = ['PDG', 'Manager', 'ManagerPlus'];
  if (!allowed.includes(role)) {
    return res.status(403).json({ message: 'Accès refusé' });
  }
  next();
}

// Public endpoint: validate a promo code against subtotal
// POST /api/ecommerce/promo/validate
router.post('/validate', rateLimit, async (req, res, next) => {
  try {
    const body = req.body || {};
    const code = normalizePromoCode(body.code);
    const wantDebug = body.debug === true;

    if (!code) {
      return res.status(400).json({ valid: false, code: 'CODE_REQUIRED', message: 'Code promo requis' });
    }

    const base = parseNumberLike(body.subtotal);
    if (!Number.isFinite(base) || base < 0) {
      return res.status(400).json({
        valid: false,
        code: 'INVALID_SUBTOTAL',
        message: 'Subtotal invalide'
      });
    }

    const [rows] = await pool.query(
      `SELECT id, code, type, value, max_discount_amount, min_order_amount, max_redemptions, redeemed_count, active, start_date, end_date, deleted_at
       FROM ecommerce_promo_codes
       WHERE UPPER(TRIM(code)) = ? AND active = 1 AND deleted_at IS NULL
       LIMIT 1`,
      [code]
    );

    if (rows.length === 0) {
      return res.status(404).json({ valid: false, code: 'NOT_FOUND', message: 'Code promo invalide ou inactif' });
    }

    const promo = rows[0];
    const now = new Date();
    const startAt = toDate(promo.start_date);
    const endAt = toDate(promo.end_date);

    if (startAt && now < startAt) {
      const payload = { valid: false, code: 'NOT_ACTIVE_YET', message: 'Code promo pas encore actif' };
      if (wantDebug) {
        payload.debug = {
          now: now.toISOString(),
          start_date: startAt.toISOString(),
          starts_in_seconds: Math.ceil((startAt.getTime() - now.getTime()) / 1000)
        };
      }
      return res.status(400).json(payload);
    }

    // Expiry is exclusive after end_date (at the exact end moment it's still valid)
    if (endAt && now > endAt) {
      const payload = { valid: false, code: 'EXPIRED', message: 'Code promo expiré' };
      if (wantDebug) {
        payload.debug = {
          now: now.toISOString(),
          end_date: endAt.toISOString(),
          expired_since_seconds: Math.floor((now.getTime() - endAt.getTime()) / 1000)
        };
      }
      return res.status(400).json(payload);
    }

    const maxRedemptions = promo.max_redemptions !== null ? Number(promo.max_redemptions) : null;
    const redeemedCount = Number(promo.redeemed_count || 0);
    if (maxRedemptions !== null && maxRedemptions > 0 && redeemedCount >= maxRedemptions) {
      return res.status(400).json({ valid: false, code: 'MAX_REDEMPTIONS_REACHED', message: 'Limite d\'utilisation atteinte' });
    }

    const minOrderAmount = promo.min_order_amount !== null ? Number(promo.min_order_amount) : null;
    if (minOrderAmount !== null && Number.isFinite(minOrderAmount) && base < minOrderAmount) {
      return res.status(400).json({ valid: false, code: 'MIN_ORDER_NOT_MET', message: 'Montant minimum non atteint' });
    }

    // Compute potential discount
    let discountAmount = 0;
    if (promo.type === 'percentage') {
      discountAmount = (Number(promo.value) / 100) * base;
    } else {
      discountAmount = Number(promo.value);
    }
    if (promo.max_discount_amount) {
      discountAmount = Math.min(discountAmount, Number(promo.max_discount_amount));
    }
    discountAmount = Math.max(0, Math.min(discountAmount, base));

    // Mask code in response to avoid scraping patterns
    const masked = String(promo.code).slice(0, 3) + '***';

    const response = {
      valid: true,
      message: 'Code promo valide',
      code_masked: masked,
      discount_type: promo.type,
      discount_value: Number(promo.value),
      discount_amount: discountAmount
    };

    if (wantDebug) {
      response.debug = {
        normalized_code: code,
        now: now.toISOString(),
        start_date: startAt ? startAt.toISOString() : null,
        end_date: endAt ? endAt.toISOString() : null,
        max_redemptions: maxRedemptions,
        redeemed_count: redeemedCount,
        min_order_amount: minOrderAmount,
        subtotal: base
      };
    }

    return res.json(response);
  } catch (err) {
    next(err);
  }
});

// Note: Admin CRUD is intentionally moved to /api/promo-codes (backoffice).
// This router only exposes the public validation endpoint for the e-commerce site.

export default router;
