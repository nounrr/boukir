import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

const ALLOWED_LOCALES = new Set(['fr', 'ar']);
const ALLOWED_TYPES = new Set(['category', 'brand', 'campaign', 'product']);
const ALLOWED_STATUSES = new Set(['draft', 'published', 'archived']);

function toIsoOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normalizePublicUrl(u) {
  if (!u) return u;
  const s = String(u).trim();
  if (!s) return s;
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  if (s.startsWith('/')) return s;
  return `/${s}`;
}

function normalizeCtas(ctasRaw) {
  if (ctasRaw == null) return [];
  const ctas = Array.isArray(ctasRaw) ? ctasRaw : (typeof ctasRaw === 'string' ? JSON.parse(ctasRaw) : null);
  if (!Array.isArray(ctas)) throw new Error('CTAS_INVALID');
  if (ctas.length > 2) throw new Error('CTAS_TOO_MANY');

  // Public API no longer exposes href/action. We still accept legacy stored values.
  const normalized = ctas.map((c) => {
    const label = String(c?.label ?? '').trim();
    const style = String(c?.style ?? '').trim();

    if (!label) throw new Error('CTA_LABEL_REQUIRED');
    if (!['primary', 'secondary'].includes(style)) throw new Error('CTA_STYLE_INVALID');

    return { label, style };
  });

  const hasPrimary = normalized.some((c) => c.style === 'primary');
  if (!hasPrimary) throw new Error('CTA_PRIMARY_REQUIRED');

  return normalized;
}

function toCtaBundle(ctas) {
  const out = {};
  for (const c of Array.isArray(ctas) ? ctas : []) {
    if (!c || typeof c !== 'object') continue;
    if (c.style === 'primary' && !out.primary) out.primary = { label: c.label };
    if (c.style === 'secondary' && !out.secondary) out.secondary = { label: c.label };
  }
  return out;
}

function buildTarget(row) {
  const t = String(row.type);
  if (t === 'category') return row.category_id != null ? { category_id: Number(row.category_id) } : null;
  if (t === 'brand') return row.brand_id != null ? { brand_id: Number(row.brand_id) } : null;
  if (t === 'campaign') return row.campaign_id != null ? { campaign_id: Number(row.campaign_id) } : null;
  if (t === 'product') {
    if (row.product_id == null) return null;
    const out = { product_id: Number(row.product_id) };
    if (row.variant_id != null) out.variant_id = Number(row.variant_id);
    return out;
  }
  return null;
}

async function isProductSlideEligible(row) {
  if (row.type !== 'product') return true;
  if (row.product_id == null) return false;

  // Product must exist, be published, not deleted
  const [prodRows] = await pool.query(
    `SELECT id, ecom_published, COALESCE(is_deleted,0) AS is_deleted, stock_partage_ecom_qty, has_variants
     FROM products
     WHERE id = ?
     LIMIT 1`,
    [row.product_id]
  );
  const p = prodRows[0];
  if (!p) return false;
  if (Number(p.ecom_published || 0) !== 1) return false;
  if (Number(p.is_deleted || 0) !== 0) return false;

  // If variant is specified, variant stock must be > 0
  if (row.variant_id != null) {
    const [vRows] = await pool.query(
      `SELECT id, stock_quantity
       FROM product_variants
       WHERE id = ? AND product_id = ?
       LIMIT 1`,
      [row.variant_id, row.product_id]
    );
    const v = vRows[0];
    if (!v) return false;
    return Number(v.stock_quantity || 0) > 0;
  }

  // Otherwise, product stock must be > 0
  return Number(p.stock_partage_ecom_qty || 0) > 0;
}

// Public: GET /api/hero-slides
router.get('/', async (req, res, next) => {
  try {
    const locale = String(req.query.locale || '').trim().toLowerCase();
    if (!ALLOWED_LOCALES.has(locale)) {
      return res.status(400).json({
        error: { code: 'INVALID_LOCALE', message: 'locale must be one of: fr, ar' },
      });
    }

    const limitRaw = req.query.limit != null ? String(req.query.limit).trim() : '';
    const limitParsed = limitRaw ? Number.parseInt(limitRaw, 10) : 4;
    const limit = Number.isFinite(limitParsed) && limitParsed > 0 ? Math.min(limitParsed, 8) : 4;

    const nowRaw = req.query.now != null ? String(req.query.now).trim() : null;
    const now = nowRaw ? new Date(nowRaw) : new Date();
    if (Number.isNaN(now.getTime())) {
      return res.status(400).json({
        error: { code: 'INVALID_NOW', message: 'now must be an ISO datetime' },
      });
    }

    // Fetch more than limit because we may skip invalid/out-of-stock product slides
    const fetchLimit = Math.max(limit * 3, 12);

    const [rows] = await pool.query(
      `SELECT
         id, type, status, priority, locale,
         starts_at, ends_at,
         image_url, image_alt,
         title, subtitle,
         category_id, brand_id, product_id, variant_id, campaign_id,
         ctas,
         updated_at
       FROM ecommerce_hero_slides
       WHERE locale = ?
         AND status = 'published'
         AND (starts_at IS NULL OR starts_at <= ?)
         AND (ends_at IS NULL OR ends_at >= ?)
       ORDER BY priority DESC, updated_at DESC, id DESC
       LIMIT ?`,
      [locale, now, now, fetchLimit]
    );

    const slides = [];

    for (const row of rows) {
      if (!ALLOWED_TYPES.has(String(row.type))) continue;
      if (!ALLOWED_STATUSES.has(String(row.status))) continue;

      const target = buildTarget(row);
      if (!target) continue;

      // Validate CTAs (max 2) and href rules
      let ctas;
      try {
        ctas = normalizeCtas(row.ctas);
      } catch {
        continue;
      }

      // Runtime eligibility rules
      const eligible = await isProductSlideEligible(row);
      if (!eligible) continue;

      slides.push({
        id: `hs_${row.id}`,
        type: row.type,
        status: row.status,
        priority: Number(row.priority || 0),
        schedule: {
          starts_at: toIsoOrNull(row.starts_at),
          ends_at: toIsoOrNull(row.ends_at),
        },
        media: {
          image_url: normalizePublicUrl(row.image_url),
          image_alt: row.image_alt || null,
        },
        content: {
          title: row.title,
          subtitle: row.subtitle || null,
        },
        target,
        cta: toCtaBundle(ctas),
      });

      if (slides.length >= limit) break;
    }

    res.json({
      locale,
      generated_at: new Date().toISOString(),
      slides,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
