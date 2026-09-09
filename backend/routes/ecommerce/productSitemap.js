import { Router } from 'express';

// One consistent, compact query: no descriptions, stock or variants.
export function createProductSitemapRouter(db) {
  const router = Router();
  router.get('/', async (_req, res, next) => {
    try {
      const [rows] = await db.query(`
        SELECT p.id, p.updated_at, p.designation, p.designation_ar, p.designation_en, p.designation_zh FROM products p
        WHERE p.ecom_published = 1 AND COALESCE(p.is_deleted, 0) = 0
        ORDER BY p.id ASC
      `);
      const products = rows.map(row => ({ id: Number(row.id), updated_at: row.updated_at ?? null,
        designation: row.designation, designation_ar: row.designation_ar ?? null,
        designation_en: row.designation_en ?? null, designation_zh: row.designation_zh ?? null }));
      res.set('Cache-Control', 'no-store');
      return res.json({ products, total_items: products.length });
    } catch (error) { return next(error); }
  });
  return router;
}
