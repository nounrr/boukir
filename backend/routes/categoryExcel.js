import { createHash } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import pool from '../db/pool.js';
import { requireRoles } from '../middleware/auth.js';
import { planCategoryExcel, readCategoryExcel } from '../utils/categoryExcel.js';
import { revalidateEcommerceProduct } from '../utils/ecommerceProductRevalidation.js';
import { ensureProductCategoriesSchema } from '../utils/productCategories.js';

const receiveFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 1, fieldSize: 128 },
}).single('file');

function uploadExcel(req, res, next) {
  receiveFile(req, res, error => {
    if (error?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'Le fichier Excel dépasse 10 Mo.' });
    }
    if (error) return res.status(400).json({ message: 'Le fichier Excel n’a pas pu être reçu.' });
    if (!req.file) return res.status(400).json({ message: 'Sélectionnez un fichier Excel.' });
    next();
  });
}

async function loadCatalog(db, locked) {
  const [fields] = await db.query("SHOW COLUMNS FROM products WHERE Field IN ('reference_2', 'old_designation')");
  const names = new Set(fields.map(field => field.Field));
  const reference = names.has('reference_2') ? 'reference_2' : 'NULL AS reference_2';
  const oldName = names.has('old_designation') ? 'old_designation' : 'NULL AS old_designation';

  const [categories] = await db.query(
    'SELECT id, nom, parent_id FROM categories' + (locked ? ' LOCK IN SHARE MODE' : ''),
  );
  const [products] = await db.query(
    'SELECT id, designation, categorie_id, ' + reference + ', ' + oldName
    + ' FROM products WHERE COALESCE(is_deleted, 0) = 0' + (locked ? ' FOR UPDATE' : ''),
  );
  const [variants] = await db.query(
    'SELECT product_id, variant_name, reference FROM product_variants WHERE COALESCE(is_deleted, 0) = 0'
    + (locked ? ' LOCK IN SHARE MODE' : ''),
  );
  return { categories, products, variants };
}

function previewToken(buffer, changes) {
  return createHash('sha256').update(buffer).update(JSON.stringify(changes)).digest('hex');
}

async function updateCategories(connection, changes, userId) {
  for (let offset = 0; offset < changes.length; offset += 500) {
    const batch = changes.slice(offset, offset + 500);
    const pairs = batch.flatMap(({ id, categoryId }) => [id, categoryId]);
    const cases = batch.map(() => 'WHEN ? THEN ?').join(' ');
    const links = batch.map(() => '(?, ?)').join(', ');
    await connection.query(
      'UPDATE products SET categorie_id = CASE id ' + cases + ' END,'
      + ' updated_by = COALESCE(?, updated_by), updated_at = NOW() WHERE id IN (?)',
      [...pairs, userId, batch.map(change => change.id)],
    );
    // A promoted secondary category is now represented by the primary column.
    // All other secondary categories stay attached to their products.
    await connection.query(
      'DELETE FROM product_categories WHERE (product_id, category_id) IN (' + links + ')',
      pairs,
    );
  }
}

export function createCategoryExcelRouter(db = pool, revalidate = revalidateEcommerceProduct) {
  const router = Router();
  router.use(requireRoles('PDG', 'Manager', 'ManagerPlus'));

  router.post('/preview', uploadExcel, async (req, res, next) => {
    try {
      const rows = readCategoryExcel(req.file.buffer);
      const { changes, ...results } = planCategoryExcel(rows, await loadCatalog(db, false));
      res.json({ ...results, updates: changes.length, token: previewToken(req.file.buffer, changes) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/apply', uploadExcel, async (req, res, next) => {
    let connection;
    let changes;
    try {
      const token = req.body?.token;
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
        return res.status(400).json({ message: 'Analysez le fichier avant de corriger les catégories.' });
      }

      const rows = readCategoryExcel(req.file.buffer);
      await ensureProductCategoriesSchema(db);
      connection = await db.getConnection();
      await connection.beginTransaction();
      ({ changes } = planCategoryExcel(rows, await loadCatalog(connection, true)));
      if (previewToken(req.file.buffer, changes) !== token) {
        await connection.rollback();
        return res.status(409).json({ message: 'Le fichier ou le catalogue a changé. Relancez l’analyse.' });
      }

      await updateCategories(connection, changes, req.user.id || null);
      await connection.commit();
    } catch (error) {
      if (connection) await connection.rollback().catch(() => {});
      return next(error);
    } finally {
      connection?.release();
    }

    res.json({ updated: changes.length });
    // Keep post-commit cache work bounded, even for a large correction file.
    void (async () => {
      for (let offset = 0; offset < changes.length; offset += 20) {
        await Promise.all(changes.slice(offset, offset + 20).map(({ id, categoryId }) =>
          revalidate(id, { categoryId }),
        ));
      }
    })().catch(error => console.warn('Catégorie Excel, cache e-commerce:', error.message));
  });

  return router;
}

export default createCategoryExcelRouter();
