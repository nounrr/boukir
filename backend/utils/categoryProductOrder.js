const schemaPromises = new WeakMap();

export const CATEGORY_PRODUCT_ORDER_SCHEMA = `CREATE TABLE IF NOT EXISTS category_product_order (
  category_id INT NOT NULL,
  product_id INT NOT NULL,
  position INT UNSIGNED NOT NULL,
  PRIMARY KEY (category_id, product_id),
  INDEX idx_category_position (category_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

export function ensureCategoryProductOrderSchema(db) {
  if (!schemaPromises.has(db)) {
    const pending = db.query(CATEGORY_PRODUCT_ORDER_SCHEMA).catch(error => {
      schemaPromises.delete(db);
      throw error;
    });
    schemaPromises.set(db, pending);
  }
  return schemaPromises.get(db);
}

export const CATEGORY_PRODUCT_ORDER_SQL = 'c.nom IS NULL ASC, c.nom ASC, c.id ASC, pco.position IS NULL ASC, pco.position ASC, p.designation ASC, p.id ASC';
export const CATEGORY_PRODUCT_ORDER_JOIN = 'LEFT JOIN category_product_order pco ON pco.product_id = p.id AND pco.category_id = p.categorie_id';

export function parseProductOrder(ids) {
  if (!Array.isArray(ids) || !ids.length) return null;
  if (ids.some(id => typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0)) return null;
  return new Set(ids).size === ids.length ? ids : null;
}

export function sameProductOrder(left, right) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
