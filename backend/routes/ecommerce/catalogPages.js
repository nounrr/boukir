import { Router } from 'express';

export function categoryTotals(categories, counts) {
  const byId = new Map(categories.map(c => [Number(c.id), c]));
  const totals = new Map(categories.map(c => [Number(c.id), 0]));
  for (const row of counts) {
    let id = Number(row.id);
    const seen = new Set();
    while (byId.has(id) && !seen.has(id)) {
      seen.add(id);
      totals.set(id, totals.get(id) + Number(row.total));
      id = Number(byId.get(id).parent_id);
    }
  }
  return categories.map(c => ({ id: Number(c.id), total: totals.get(Number(c.id)) }));
}

export function createCatalogPagesRouter(db) {
  const router = Router();
  router.get('/', async (_req, res, next) => {
    try {
      const [categories] = await db.query('SELECT id, parent_id FROM categories');
      const [counts] = await db.query('SELECT categorie_id AS id, COUNT(*) AS total FROM products WHERE ecom_published = 1 AND COALESCE(is_deleted, 0) = 0 GROUP BY categorie_id');
      const [brands] = await db.query('SELECT b.id, COUNT(p.id) AS total FROM brands b LEFT JOIN products p ON p.brand_id = b.id AND p.ecom_published = 1 AND COALESCE(p.is_deleted, 0) = 0 GROUP BY b.id');
      res.set('Cache-Control', 'no-store');
      res.json({ categories: categoryTotals(categories, counts), brands: brands.map(b => ({ id: Number(b.id), total: Number(b.total) })) });
    } catch (error) { next(error); }
  });
  return router;
}
