import { Router } from 'express';
import { ensureCategoryProductOrderSchema, CATEGORY_PRODUCT_ORDER_JOIN, parseProductOrder, sameProductOrder } from '../utils/categoryProductOrder.js';

const productsSql = `SELECT p.id, p.reference_2 AS reference, p.designation, p.image_url
  FROM products p ${CATEGORY_PRODUCT_ORDER_JOIN}
  WHERE p.categorie_id = ? AND COALESCE(p.is_deleted, 0) = 0
    AND COALESCE(p.non_stockable, 0) = 0 AND COALESCE(p.est_service, 0) = 0
  ORDER BY pco.position IS NULL ASC, pco.position ASC, p.designation ASC, p.id ASC`;

export function createCategoryProductOrderRouter(db, onSaved = async () => {}) {
  const router = Router();
  router.use((req, res, next) => {
    if (!req.user?.role || req.user?.type_compte != null || ['ChefChauffeur', 'Chauffeur'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Accès au classement des produits non autorisé.' });
    }
    next();
  });
  router.get('/:categoryId', async (req, res, next) => {
    try {
      const categoryId = Number(req.params.categoryId);
      if (!Number.isSafeInteger(categoryId) || categoryId <= 0) return res.status(400).json({ message: 'Catégorie invalide.' });
      await ensureCategoryProductOrderSchema(db);
      const [rows] = await db.query(productsSql, [categoryId]);
      res.json({ products: rows, order: rows.map(row => Number(row.id)) });
    } catch (error) { next(error); }
  });
  router.put('/:categoryId', async (req, res, next) => {
    let connection;
    try {
      const categoryId = Number(req.params.categoryId);
      const ids = parseProductOrder(req.body?.product_ids);
      const expected = parseProductOrder(req.body?.expected_order);
      if (!Number.isSafeInteger(categoryId) || categoryId <= 0 || !ids || !expected) return res.status(400).json({ message: 'Classement invalide ou produits en double.' });
      await ensureCategoryProductOrderSchema(db);
      connection = await db.getConnection();
      await connection.beginTransaction();
      const [[category]] = await connection.query('SELECT id FROM categories WHERE id = ? FOR UPDATE', [categoryId]);
      if (!category) {
        await connection.rollback();
        return res.status(404).json({ message: 'Catégorie introuvable.' });
      }
      const [rows] = await connection.query(`${productsSql} FOR UPDATE`, [categoryId]);
      const current = rows.map(row => Number(row.id));
      const members = new Set(current);
      if (!sameProductOrder(current, expected) || ids.length !== current.length || ids.some(id => !members.has(id))) {
        await connection.rollback();
        return res.status(409).json({ message: 'Les produits ou leur classement ont changé. Rechargez la liste avant de réessayer.' });
      }
      await connection.query('DELETE FROM category_product_order WHERE category_id = ?', [categoryId]);
      // Chunk large categories to keep SQL packets bounded.
      for (let offset = 0; offset < ids.length; offset += 500) {
        const values = ids.slice(offset, offset + 500).map((id, index) => [categoryId, id, offset + index]);
        await connection.query('INSERT INTO category_product_order (category_id, product_id, position) VALUES ?', [values]);
      }
      await connection.commit();
      connection.release();
      connection = null;
      // Cache invalidation must not turn an already committed order into a failure.
      try { await onSaved(ids[0], categoryId); } catch (error) { console.warn('[Product order] Cache:', error?.message); }
      res.json({ success: true, order: ids });
    } catch (error) {
      if (connection) await connection.rollback();
      next(error);
    } finally { connection?.release(); }
  });
  return router;
}
