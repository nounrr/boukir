import { ensureProductCategoriesSchema } from '../utils/productCategories.js';
import { Router } from 'express';
import { ensureCategoryProductOrderSchema, parseProductOrder, sameProductOrder, categoryBrandPriceOrderSql } from '../utils/categoryProductOrder.js';
import { ecommerceOfferPriceSql, hasProductSnapshotTable } from '../utils/ecommerceOfferPrice.js';

const productsSql = (price, manual = true) => `SELECT p.id, p.reference_2 AS reference, p.designation, p.image_url,
    b.nom AS brand_name, p.ecom_published, ${price} AS offer_price
  FROM products p LEFT JOIN category_product_order pco ON pco.product_id = p.id AND pco.category_id = ?
  LEFT JOIN brands b ON b.id = p.brand_id
  WHERE (p.categorie_id = ? OR EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id = ?)) AND COALESCE(p.is_deleted, 0) = 0
    AND COALESCE(p.non_stockable, 0) = 0 AND COALESCE(p.est_service, 0) = 0
  ORDER BY ${categoryBrandPriceOrderSql(price, { manual, groupCategory: false })}`;

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
      await ensureProductCategoriesSchema(db);
      await ensureCategoryProductOrderSchema(db);
      const price = ecommerceOfferPriceSql(await hasProductSnapshotTable(db));
      const params = [categoryId, categoryId, categoryId];
      const [rows] = await db.query(productsSql(price), params);
      const [automaticRows] = await db.query(productsSql(price, false), params);
      res.json({ products: rows, order: rows.map(row => Number(row.id)), automatic_order: automaticRows.map(row => Number(row.id)) });
    } catch (error) { next(error); }
  });
  router.put('/:categoryId', async (req, res, next) => {
    let connection;
    try {
      const categoryId = Number(req.params.categoryId);
      const ids = parseProductOrder(req.body?.product_ids);
      const expected = parseProductOrder(req.body?.expected_order);
      if (!Number.isSafeInteger(categoryId) || categoryId <= 0 || !ids || !expected) return res.status(400).json({ message: 'Classement invalide ou produits en double.' });
      await ensureProductCategoriesSchema(db);
      await ensureCategoryProductOrderSchema(db);
      connection = await db.getConnection();
      await connection.beginTransaction();
      const [[category]] = await connection.query('SELECT id FROM categories WHERE id = ? FOR UPDATE', [categoryId]);
      if (!category) {
        await connection.rollback();
        return res.status(404).json({ message: 'Catégorie introuvable.' });
      }
      const price = ecommerceOfferPriceSql(await hasProductSnapshotTable(db));
      const [rows] = await connection.query(`${productsSql(price)} FOR UPDATE`, [categoryId, categoryId, categoryId]);
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
