const schemas = new WeakMap();

export const PRODUCT_CATEGORIES_SCHEMA = `CREATE TABLE IF NOT EXISTS product_categories (
  product_id INT NOT NULL,
  category_id INT NOT NULL,
  position INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, category_id),
  INDEX idx_product_categories_category (category_id, product_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

export function ensureProductCategoriesSchema(db) {
  if (!schemas.has(db)) {
    schemas.set(db, db.query(PRODUCT_CATEGORIES_SCHEMA).catch(error => {
      schemas.delete(db);
      throw error;
    }));
  }
  return schemas.get(db);
}

export function parseCategoryIds(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { value = null; }
  }
  if (!Array.isArray(value) || value.some(id =>
    !['number', 'string'].includes(typeof id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0
  )) {
    const error = new Error('La liste des catégories est invalide.');
    error.status = 400;
    throw error;
  }
  return [...new Set(value.map(Number))];
}

export async function validateProductCategories(db, ids) {
  if (!ids.length) return;
  const [rows] = await db.query(`SELECT c.id FROM categories c WHERE c.id IN (?)
    AND NOT EXISTS (SELECT 1 FROM categories child WHERE child.parent_id = c.id)`, [ids]);
  if (rows.length !== ids.length) {
    const error = new Error('Veuillez sélectionner des catégories existantes sans sous-catégories.');
    error.status = 400;
    throw error;
  }
}

// The legacy column remains the primary category; links hold additional categories.
export async function loadProductCategories(db, productIds) {
  const result = new Map();
  if (!productIds.length) return result;
  await ensureProductCategoriesSchema(db);
  const [rows] = await db.query(`SELECT p.id AS product_id, c.*, 0 AS category_position
    FROM products p JOIN categories c ON c.id = p.categorie_id WHERE p.id IN (?)
    UNION ALL
    SELECT p.id AS product_id, c.*, pc.position + 1 AS category_position
    FROM products p JOIN product_categories pc ON pc.product_id = p.id
    JOIN categories c ON c.id = pc.category_id
    WHERE p.id IN (?) AND (p.categorie_id IS NULL OR pc.category_id <> p.categorie_id)
    ORDER BY category_position, id`, [productIds, productIds]);
  for (const { product_id, category_position, ...category } of rows) {
    if (!result.has(product_id)) result.set(product_id, []);
    result.get(product_id).push(category);
  }
  return result;
}

export async function saveProductCategories(db, productId, ids, { append = false, connection: suppliedConnection } = {}) {
  await ensureProductCategoriesSchema(db);
  const connection = suppliedConnection || await db.getConnection();
  try {
    if (!suppliedConnection) await connection.beginTransaction();
    const [[product]] = await connection.query('SELECT categorie_id FROM products WHERE id = ? FOR UPDATE', [productId]);
    if (!product) throw new Error('Produit introuvable.');
    if (append) {
      const [links] = await connection.query('SELECT category_id FROM product_categories WHERE product_id = ? ORDER BY position', [productId]);
      ids = [...new Set([product.categorie_id, ...links.map(row => row.category_id), ...ids].filter(Boolean).map(Number))];
    }
    await connection.query('UPDATE products SET categorie_id = ? WHERE id = ?', [ids[0] || null, productId]);
    await connection.query('DELETE FROM product_categories WHERE product_id = ?', [productId]);
    if (ids.length > 1) {
      await connection.query('INSERT INTO product_categories (product_id, category_id, position) VALUES ?',
        [ids.slice(1).map((id, position) => [productId, id, position])]);
    }
    if (!suppliedConnection) await connection.commit();
  } catch (error) {
    if (!suppliedConnection) await connection.rollback();
    throw error;
  } finally { if (!suppliedConnection) connection.release(); }
}
