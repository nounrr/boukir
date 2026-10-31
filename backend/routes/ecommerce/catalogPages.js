import { ensureProductCategoriesSchema } from '../../utils/productCategories.js';
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
      await ensureProductCategoriesSchema(db);
      const [counts] = await db.query(`WITH RECURSIVE category_tree AS (
        SELECT id AS root_id, id FROM categories
        UNION DISTINCT
        SELECT ct.root_id, c.id FROM category_tree ct JOIN categories c ON c.parent_id = ct.id
      ), memberships AS (
        SELECT id AS product_id, categorie_id AS category_id FROM products WHERE categorie_id IS NOT NULL
        UNION SELECT product_id, category_id FROM product_categories
      )
      SELECT ct.root_id AS id, COUNT(DISTINCT p.id) AS total FROM category_tree ct
      LEFT JOIN memberships m ON m.category_id = ct.id
      LEFT JOIN products p ON p.id = m.product_id AND p.ecom_published = 1
        AND COALESCE(p.is_deleted, 0) = 0 AND COALESCE(p.est_service, 0) = 0 AND COALESCE(p.non_stockable, 0) = 0
      GROUP BY ct.root_id`);
      const [brands] = await db.query('SELECT b.id, COUNT(p.id) AS total FROM brands b LEFT JOIN products p ON p.brand_id = b.id AND p.ecom_published = 1 AND COALESCE(p.is_deleted, 0) = 0 AND COALESCE(p.est_service, 0) = 0 AND COALESCE(p.non_stockable, 0) = 0 GROUP BY b.id');
      res.set('Cache-Control', 'no-store');
      res.json({ categories: counts.map(c => ({ id: Number(c.id), total: Number(c.total) })), brands: brands.map(b => ({ id: Number(b.id), total: Number(b.total) })) });
    } catch (error) { next(error); }
  });
  return router;
}
