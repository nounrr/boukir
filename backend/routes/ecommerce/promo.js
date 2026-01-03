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
    const { code, subtotal } = req.body || {};
    if (!code) {
      return res.status(400).json({ valid: false, message: 'Code promo requis' });
    }

    const [rows] = await pool.query(
      `SELECT id, code, type, value, max_discount_amount, min_order_amount, max_redemptions, redeemed_count, active, start_date, end_date
       FROM ecommerce_promo_codes
       WHERE code = ? AND active = 1
       LIMIT 1`,
      [code]
    );

    if (rows.length === 0) {
      return res.status(404).json({ valid: false, message: 'Code promo invalide ou inactif' });
    }

    const promo = rows[0];
    const now = new Date();
    if (promo.start_date && now < new Date(promo.start_date)) {
      return res.status(400).json({ valid: false, message: 'Code promo pas encore actif' });
    }
    if (promo.end_date && now > new Date(promo.end_date)) {
      return res.status(400).json({ valid: false, message: 'Code promo expiré' });
    }
    if (promo.max_redemptions !== null && promo.max_redemptions > 0 && promo.redeemed_count >= promo.max_redemptions) {
      return res.status(400).json({ valid: false, message: 'Limite d\'utilisation atteinte' });
    }
    if (promo.min_order_amount && Number(subtotal || 0) < Number(promo.min_order_amount)) {
      return res.status(400).json({ valid: false, message: 'Montant minimum non atteint' });
    }

    // Compute potential discount
    let discountAmount = 0;
    const base = Number(subtotal || 0);
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

    return res.json({
      valid: true,
      message: 'Code promo valide',
      code_masked: masked,
      discount_type: promo.type,
      discount_value: Number(promo.value),
      discount_amount: discountAmount
    });
  } catch (err) {
    next(err);
  }
});

// Note: Admin CRUD is intentionally moved to /api/promo-codes (backoffice).
// This router only exposes the public validation endpoint for the e-commerce site.

export default router;
