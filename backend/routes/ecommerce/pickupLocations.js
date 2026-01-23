import { Router } from 'express';
import pool from '../../db/pool.js';

const router = Router();

// ==================== PICKUP LOCATIONS (PUBLIC) ====================
// GET /api/ecommerce/pickup-locations - List active pickup locations
router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        id,
        name,
        address_line1,
        address_line2,
        city,
        state,
        postal_code,
        country,
        is_active
      FROM ecommerce_pickup_locations
      WHERE is_active = 1
      ORDER BY id ASC
      `
    );

    res.json({
      pickup_locations: rows.map((r) => ({
        id: r.id,
        name: r.name,
        address_line1: r.address_line1,
        address_line2: r.address_line2,
        city: r.city,
        state: r.state,
        postal_code: r.postal_code,
        country: r.country,
      })),
    });
  } catch (err) {
    // If the migration hasn't been applied yet, MySQL will throw ER_NO_SUCH_TABLE.
    // We keep this as a 500 so it is visible during setup.
    next(err);
  }
});

export default router;
