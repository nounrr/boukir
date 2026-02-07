import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

// Require admin/manager roles for CRUD endpoints
function requireAdmin(req, res, next) {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: 'Authentification requise' });
  }
  const allowed = ['PDG', 'Manager', 'ManagerPlus'];
  if (!allowed.includes(user.role)) {
    return res.status(403).json({ message: 'Accès refusé' });
  }
  next();
}

// List promo codes (backoffice)
router.get('/', requireAdmin, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, code, description, type, value, max_discount_amount, min_order_amount,
             max_redemptions, redeemed_count, active, start_date, end_date,
             created_at, updated_at, deleted_at
      FROM ecommerce_promo_codes
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    `);
    res.json({ codes: rows });
  } catch (err) {
    next(err);
  }
});

// Create promo code
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const user = req.user;
    const {
      code,
      description,
      type = 'percentage',
      value,
      max_discount_amount = null,
      min_order_amount = null,
      max_redemptions = null,
      active = 1,
      start_date = null,
      end_date = null
    } = req.body || {};

    if (!code || !value) {
      return res.status(400).json({ message: 'Code et valeur requis' });
    }
    if (!['percentage', 'fixed'].includes(type)) {
      return res.status(400).json({ message: 'Type invalide' });
    }

    const [result] = await pool.query(`
      INSERT INTO ecommerce_promo_codes (
        code, description, type, value, max_discount_amount, min_order_amount,
        max_redemptions, redeemed_count, active, start_date, end_date, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, NOW())
    `, [
      code,
      description || null,
      type,
      Number(value),
      max_discount_amount !== null ? Number(max_discount_amount) : null,
      min_order_amount !== null ? Number(min_order_amount) : null,
      max_redemptions !== null ? Number(max_redemptions) : null,
      Number(active) ? 1 : 0,
      start_date || null,
      end_date || null,
      user.id || null
    ]);

    res.status(201).json({ id: result.insertId, message: 'Code promo créé' });
  } catch (err) {
    next(err);
  }
});

// Update promo code
router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const fields = ['description','type','value','max_discount_amount','min_order_amount','max_redemptions','active','start_date','end_date'];
    const numericFields = new Set(['value', 'max_discount_amount', 'min_order_amount', 'max_redemptions']);
    const updates = [];
    const params = [];
    for (const f of fields) {
      if (Object.prototype.hasOwnProperty.call(req.body, f)) {
        updates.push(`${f} = ?`);
        if (f === 'active') {
          params.push(req.body[f] ? 1 : 0);
        } else if (numericFields.has(f)) {
          params.push(req.body[f] === null || req.body[f] === '' ? null : Number(req.body[f]));
        } else {
          params.push(req.body[f]);
        }
      }
    }
    if (updates.length === 0) {
      return res.status(400).json({ message: 'Aucune mise à jour fournie' });
    }
    params.push(id);
    await pool.query(`
      UPDATE ecommerce_promo_codes
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = ?
    `, params);
    res.json({ message: 'Code promo mis à jour' });
  } catch (err) {
    next(err);
  }
});

// Activate/Deactivate promo code
router.post('/:id/toggle', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { active } = req.body || {};
    await pool.query(`
      UPDATE ecommerce_promo_codes
      SET active = ?, updated_at = NOW()
      WHERE id = ?
    `, [active ? 1 : 0, id]);
    res.json({ message: active ? 'Activé' : 'Désactivé' });
  } catch (err) {
    next(err);
  }
});

// Soft delete
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await pool.query(`
      UPDATE ecommerce_promo_codes
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = ?
    `, [id]);
    res.json({ message: 'Code promo supprimé' });
  } catch (err) {
    next(err);
  }
});

export default router;
