import { Router } from 'express';

// One consistent, compact query: no descriptions, stock or variants.
export function createProductSitemapRouter(db) {
  const router = Router();
  router.get('/', async (_req, res, next) => {
    try {
      const [rows] = await db.query(`
        SELECT p.id, p.updated_at FROM products p
        WHERE p.ecom_published = 1 AND COALESCE(p.is_deleted, 0) = 0
        ORDER BY p.id ASC
      `);
      const products = rows.map(row => ({ id: Number(row.id), updated_at: row.updated_at ?? null }));
      res.set('Cache-Control', 'no-store');
      return res.json({ products, total_items: products.length });
    } catch (error) { return next(error); }
  });
  return router;
}
