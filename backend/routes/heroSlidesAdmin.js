import { Router } from 'express';
import pool from '../db/pool.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const router = Router();

const ALLOWED_LOCALES = new Set(['fr', 'ar']);
const ALLOWED_TYPES = new Set(['category', 'brand', 'campaign', 'product']);
const ALLOWED_STATUSES = new Set(['draft', 'published', 'archived']);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.join(__dirname, '..', 'uploads');
const heroSlidesDir = path.join(uploadsRoot, 'hero_slides');

if (!fs.existsSync(heroSlidesDir)) {
  fs.mkdirSync(heroSlidesDir, { recursive: true });
}

const heroSlidesStorage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, heroSlidesDir);
  },
  filename: function (_req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    const unique = `hero-${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}`;
    cb(null, `${unique}${ext}`);
  },
});

const uploadHeroImage = multer({
  storage: heroSlidesStorage,
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) return cb(new Error('Type de fichier non supporté'));
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

function maybeUploadSingle(fieldName) {
  const mw = uploadHeroImage.single(fieldName);
  return (req, res, next) => {
    const contentType = String(req.headers['content-type'] || '');
    if (!contentType.toLowerCase().includes('multipart/form-data')) return next();
    mw(req, res, next);
  };
}

function requireAdmin(req, res, next) {
  const user = req.user;
  if (!user) return res.status(401).json({ message: 'Authentification requise' });
  const allowed = ['PDG', 'Manager', 'ManagerPlus'];
  if (!allowed.includes(user.role)) return res.status(403).json({ message: 'Accès refusé' });
  next();
}

function requirePdg(req, res, next) {
  const user = req.user;
  if (!user) return res.status(401).json({ message: 'Authentification requise' });
  if (user.role !== 'PDG') return res.status(403).json({ message: 'Réservé au PDG' });
  next();
}

function normalizeNullableText(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).trim();
  return s.length === 0 ? null : s;
}

function parseDateOrNull(value, field) {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const err = new Error('INVALID_DATE');
    err.field = field;
    throw err;
  }
  return d;
}

function normalizeCtas(ctasRaw) {
  if (ctasRaw === undefined) return undefined;
  if (ctasRaw == null) return [];

  const ctas = Array.isArray(ctasRaw) ? ctasRaw : (typeof ctasRaw === 'string' ? JSON.parse(ctasRaw) : null);
  if (!Array.isArray(ctas)) throw new Error('CTAS_INVALID');
  if (ctas.length > 2) throw new Error('CTAS_TOO_MANY');

  const normalized = ctas.map((c) => {
    const label = String(c?.label ?? '').trim();
    const style = String(c?.style ?? '').trim();

    if (!label) throw new Error('CTA_LABEL_REQUIRED');
    if (!['primary', 'secondary'].includes(style)) throw new Error('CTA_STYLE_INVALID');

    // Admin no longer stores href/action; ecommerce frontend derives navigation.
    return { label, style };
  });

  const hasPrimary = normalized.some((c) => c.style === 'primary');
  if (!hasPrimary) throw new Error('CTA_PRIMARY_REQUIRED');

  return normalized;
}

function ctasErrorToResponse(err) {
  const code = String(err?.message || 'CTAS_INVALID');
  const map = {
    CTAS_INVALID: 'CTAs invalides (format JSON attendu)',
    CTAS_TOO_MANY: 'Max 2 CTAs',
    CTA_LABEL_REQUIRED: 'CTA: label requis',
    CTA_STYLE_INVALID: 'CTA: style invalide',
    CTA_PRIMARY_REQUIRED: 'CTA primary obligatoire',
  };
  return { message: map[code] || 'CTAs invalides', field: 'ctas', code };
}

function validateTarget(type, body) {
  const toIntOrNull = (v) => {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const category_id = toIntOrNull(body.category_id);
  const brand_id = toIntOrNull(body.brand_id);
  const product_id = toIntOrNull(body.product_id);
  const variant_id = toIntOrNull(body.variant_id);
  const campaign_id = toIntOrNull(body.campaign_id);

  const targets = { category_id, brand_id, product_id, variant_id, campaign_id };

  if (type === 'category' && !category_id) return { ok: false, message: 'category_id requis' };
  if (type === 'brand' && !brand_id) return { ok: false, message: 'brand_id requis' };
  if (type === 'product' && !product_id) return { ok: false, message: 'product_id requis' };
  if (type === 'campaign' && !campaign_id) return { ok: false, message: 'campaign_id requis' };

  return { ok: true, targets };
}

// List slides (admin)
router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const locale = req.query.locale != null ? String(req.query.locale).trim().toLowerCase() : null;
    const status = req.query.status != null ? String(req.query.status).trim().toLowerCase() : null;

    const where = [];
    const params = [];

    if (locale) {
      if (!ALLOWED_LOCALES.has(locale)) {
        return res.status(400).json({ message: 'Locale invalide', field: 'locale', allowed: Array.from(ALLOWED_LOCALES) });
      }
      where.push('locale = ?');
      params.push(locale);
    }

    if (status) {
      if (!ALLOWED_STATUSES.has(status)) {
        return res.status(400).json({ message: 'Status invalide', field: 'status', allowed: Array.from(ALLOWED_STATUSES) });
      }
      where.push('status = ?');
      params.push(status);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT
         id, type, status, priority, locale,
         starts_at, ends_at,
         image_url, image_alt,
         title, subtitle,
         category_id, brand_id, product_id, variant_id, campaign_id,
         ctas,
         created_by_employee_id, updated_by_employee_id,
         created_at, updated_at
       FROM ecommerce_hero_slides
       ${whereSql}
       ORDER BY updated_at DESC, id DESC`,
      params
    );

    res.json({ slides: rows.map((r) => ({
      ...r,
      ctas: typeof r.ctas === 'string' ? JSON.parse(r.ctas) : (r.ctas || []),
    })) });
  } catch (err) {
    next(err);
  }
});

// Create slide
router.post('/', requirePdg, maybeUploadSingle('image'), async (req, res, next) => {
  try {
    const body = req.body || {};

    const locale = String(body.locale || '').trim().toLowerCase();
    const type = String(body.type || '').trim().toLowerCase();
    const status = String(body.status || 'draft').trim().toLowerCase();

    if (!ALLOWED_LOCALES.has(locale)) {
      return res.status(400).json({ message: 'Locale invalide', field: 'locale', allowed: Array.from(ALLOWED_LOCALES) });
    }
    if (!ALLOWED_TYPES.has(type)) {
      return res.status(400).json({ message: 'Type invalide', field: 'type', allowed: Array.from(ALLOWED_TYPES) });
    }
    if (!ALLOWED_STATUSES.has(status)) {
      return res.status(400).json({ message: 'Status invalide', field: 'status', allowed: Array.from(ALLOWED_STATUSES) });
    }

    const title = normalizeNullableText(body.title);
    const image_url_from_body = normalizeNullableText(body.image_url);
    const image_url_from_upload = req.file ? `/uploads/hero_slides/${req.file.filename}` : null;
    const image_url = image_url_from_upload || image_url_from_body;

    if (!title) return res.status(400).json({ message: 'title requis', field: 'title' });
    if (!image_url) return res.status(400).json({ message: 'image requis (upload) ou image_url', field: 'image' });

    const subtitle = normalizeNullableText(body.subtitle);
    const image_alt = normalizeNullableText(body.image_alt);

    const priority = Number.isFinite(Number(body.priority)) ? Number(body.priority) : 0;

    const starts_at = parseDateOrNull(body.starts_at, 'starts_at');
    const ends_at = parseDateOrNull(body.ends_at, 'ends_at');
    if (starts_at && ends_at && ends_at < starts_at) {
      return res.status(400).json({ message: 'ends_at doit être après starts_at', field: 'ends_at' });
    }

    let ctas;
    try {
      ctas = normalizeCtas(body.ctas);
    } catch (err) {
      return res.status(400).json(ctasErrorToResponse(err));
    }

    const tRes = validateTarget(type, body);
    if (!tRes.ok) {
      return res.status(400).json({ message: tRes.message, field: 'target' });
    }

    const targets = tRes.targets;

    const [result] = await pool.query(
      `INSERT INTO ecommerce_hero_slides
        (type, status, priority, locale, starts_at, ends_at, image_url, image_alt, title, subtitle,
         category_id, brand_id, product_id, variant_id, campaign_id, ctas, created_by_employee_id)
       VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        type,
        status,
        priority,
        locale,
        starts_at,
        ends_at,
        image_url,
        image_alt,
        title,
        subtitle,
        targets.category_id,
        targets.brand_id,
        targets.product_id,
        targets.variant_id,
        targets.campaign_id,
        JSON.stringify(ctas || []),
        req.user?.id || null,
      ]
    );

    res.status(201).json({ id: result.insertId, message: 'Slide créé' });
  } catch (err) {
    if (err?.message === 'INVALID_DATE') {
      return res.status(400).json({ message: 'Format de date invalide', field: err.field });
    }
    next(err);
  }
});

// Update slide
router.put('/:id', requirePdg, maybeUploadSingle('image'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: 'ID invalide' });

    const [existsRows] = await pool.query('SELECT id FROM ecommerce_hero_slides WHERE id = ? LIMIT 1', [id]);
    if (existsRows.length === 0) return res.status(404).json({ message: 'Slide introuvable' });

    const body = req.body || {};

    const updates = [];
    const params = [];

    if (body.locale !== undefined) {
      const locale = String(body.locale || '').trim().toLowerCase();
      if (!ALLOWED_LOCALES.has(locale)) {
        return res.status(400).json({ message: 'Locale invalide', field: 'locale', allowed: Array.from(ALLOWED_LOCALES) });
      }
      updates.push('locale = ?');
      params.push(locale);
    }

    let type = null;
    if (body.type !== undefined) {
      type = String(body.type || '').trim().toLowerCase();
      if (!ALLOWED_TYPES.has(type)) {
        return res.status(400).json({ message: 'Type invalide', field: 'type', allowed: Array.from(ALLOWED_TYPES) });
      }
      updates.push('type = ?');
      params.push(type);
    }

    if (body.status !== undefined) {
      const status = String(body.status || '').trim().toLowerCase();
      if (!ALLOWED_STATUSES.has(status)) {
        return res.status(400).json({ message: 'Status invalide', field: 'status', allowed: Array.from(ALLOWED_STATUSES) });
      }
      updates.push('status = ?');
      params.push(status);
    }

    if (body.priority !== undefined) {
      const priority = Number(body.priority);
      if (!Number.isFinite(priority)) return res.status(400).json({ message: 'priority invalide', field: 'priority' });
      updates.push('priority = ?');
      params.push(priority);
    }

    if (body.title !== undefined) {
      const title = normalizeNullableText(body.title);
      if (!title) return res.status(400).json({ message: 'title requis', field: 'title' });
      updates.push('title = ?');
      params.push(title);
    }

    if (body.subtitle !== undefined) {
      updates.push('subtitle = ?');
      params.push(normalizeNullableText(body.subtitle));
    }

    if (body.image_url !== undefined) {
      const image_url = normalizeNullableText(body.image_url);
      if (!image_url) return res.status(400).json({ message: 'image_url requis', field: 'image_url' });
      updates.push('image_url = ?');
      params.push(image_url);
    }

    if (req.file) {
      updates.push('image_url = ?');
      params.push(`/uploads/hero_slides/${req.file.filename}`);
    }

    if (body.image_alt !== undefined) {
      updates.push('image_alt = ?');
      params.push(normalizeNullableText(body.image_alt));
    }

    if (body.starts_at !== undefined) {
      updates.push('starts_at = ?');
      params.push(parseDateOrNull(body.starts_at, 'starts_at'));
    }

    if (body.ends_at !== undefined) {
      updates.push('ends_at = ?');
      params.push(parseDateOrNull(body.ends_at, 'ends_at'));
    }

    if (body.ctas !== undefined) {
      let ctas;
      try {
        ctas = normalizeCtas(body.ctas);
      } catch (err) {
        return res.status(400).json(ctasErrorToResponse(err));
      }
      updates.push('ctas = ?');
      params.push(JSON.stringify(ctas || []));
    }

    // Target updates: if any target field is provided, require type to resolve
    const hasAnyTargetUpdate =
      body.category_id !== undefined ||
      body.brand_id !== undefined ||
      body.product_id !== undefined ||
      body.variant_id !== undefined ||
      body.campaign_id !== undefined;

    if (hasAnyTargetUpdate) {
      const [currentRows] = await pool.query('SELECT type FROM ecommerce_hero_slides WHERE id = ? LIMIT 1', [id]);
      const effectiveType = type || String(currentRows?.[0]?.type || '').trim().toLowerCase();
      const tRes = validateTarget(effectiveType, body);
      if (!tRes.ok) return res.status(400).json({ message: tRes.message, field: 'target' });

      updates.push('category_id = ?');
      params.push(tRes.targets.category_id);
      updates.push('brand_id = ?');
      params.push(tRes.targets.brand_id);
      updates.push('product_id = ?');
      params.push(tRes.targets.product_id);
      updates.push('variant_id = ?');
      params.push(tRes.targets.variant_id);
      updates.push('campaign_id = ?');
      params.push(tRes.targets.campaign_id);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'Aucune mise à jour fournie' });
    }

    updates.push('updated_by_employee_id = ?');
    params.push(req.user?.id || null);

    params.push(id);
    await pool.query(`UPDATE ecommerce_hero_slides SET ${updates.join(', ')} WHERE id = ?`, params);

    res.json({ message: 'Slide mis à jour' });
  } catch (err) {
    if (err?.message === 'INVALID_DATE') {
      return res.status(400).json({ message: 'Format de date invalide', field: err.field });
    }
    next(err);
  }
});

// Delete slide
router.delete('/:id', requirePdg, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: 'ID invalide' });

    const [result] = await pool.query('DELETE FROM ecommerce_hero_slides WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Slide introuvable' });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
