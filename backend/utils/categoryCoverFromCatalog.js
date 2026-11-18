import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import pool from '../db/pool.js';
import { composeCategoryCover } from './categoryCover.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');
const COVERS_DIR = path.join(UPLOADS_DIR, 'categories');

/** Absolute path of a /uploads/... URL, only if the file is on this server. */
async function localFile(url) {
  const value = String(url || '');
  if (!value.startsWith('/uploads/')) return null;
  const file = path.resolve(UPLOADS_DIR, value.replace(/^\/uploads\//, ''));
  if (!file.startsWith(UPLOADS_DIR)) return null;
  try {
    await fs.access(file);
    return file;
  } catch {
    return null;
  }
}

/** The category and all its sub-categories (any depth). */
async function withDescendants(categoryId) {
  const [rows] = await pool.query('SELECT id, parent_id FROM categories');
  const children = new Map();
  for (const row of rows) {
    if (!row.parent_id) continue;
    if (!children.has(row.parent_id)) children.set(row.parent_id, []);
    children.get(row.parent_id).push(row.id);
  }
  const ids = [categoryId];
  for (let i = 0; i < ids.length; i += 1) ids.push(...(children.get(ids[i]) || []));
  return [...new Set(ids)];
}

/**
 * Cover of a category from our catalogue: up to 4 published product photos of the category and its
 * sub-categories (one per sub-category first, in stock first) and the logos of its most present brands.
 * @returns {Promise<{ buffer: Buffer, products: number, brands: number } | null>} null when the category has no product photo
 */
export async function buildCategoryCover(categoryId) {
  const ids = await withDescendants(categoryId);
  const marks = ids.map(() => '?').join(',');
  const [rows] = await pool.query(`
    SELECT p.id, p.image_url, p.categorie_id, p.brand_id, b.image_url AS brand_logo
    FROM products p
    LEFT JOIN brands b ON b.id = p.brand_id
    WHERE p.ecom_published = 1
      AND COALESCE(p.is_deleted, 0) = 0
      AND COALESCE(p.est_service, 0) = 0
      AND (p.categorie_id IN (${marks})
        OR EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id IN (${marks})))
    ORDER BY (COALESCE(p.stock_partage_ecom_qty, 0) > 0) DESC, p.id DESC
    LIMIT 300
  `, [...ids, ...ids]);

  // Products: one per sub-category first, unique photos present on the server.
  const groups = new Map();
  for (const row of rows) {
    if (!row.image_url) continue;
    const key = row.categorie_id ?? 0;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const queues = [...groups.values()];
  const photos = [];
  const seen = new Set();
  while (photos.length < 4 && queues.some((queue) => queue.length)) {
    for (const queue of queues) {
      const row = queue.shift();
      if (!row || seen.has(row.image_url)) continue;
      seen.add(row.image_url);
      const file = await localFile(row.image_url);
      if (file) photos.push(file);
      if (photos.length >= 4) break;
    }
  }
  if (photos.length === 0) return null;

  // Brands: the most present ones that have a logo on the server.
  const brandCount = new Map();
  for (const row of rows) if (row.brand_id && row.brand_logo) brandCount.set(row.brand_logo, (brandCount.get(row.brand_logo) || 0) + 1);
  const logos = [];
  for (const [logo] of [...brandCount.entries()].sort((a, b) => b[1] - a[1])) {
    const file = await localFile(logo);
    if (file) logos.push(file);
    if (logos.length >= 5) break;
  }

  const buffer = await composeCategoryCover({
    products: await Promise.all(photos.map((file) => fs.readFile(file))),
    logos: await Promise.all(logos.map((file) => fs.readFile(file))),
  });
  return { buffer, products: photos.length, brands: logos.length };
}

/**
 * Builds the cover and sets it as the category image (database), keeping the previous URL.
 * @returns {Promise<{ image_url: string, previous_image_url: string | null, products: number, brands: number } | null>}
 */
export async function applyCategoryCover(categoryId, userId = null) {
  const [[category]] = await pool.query('SELECT id, image_url FROM categories WHERE id = ?', [categoryId]);
  if (!category) return null;
  const cover = await buildCategoryCover(categoryId);
  if (!cover) return { image_url: category.image_url, previous_image_url: category.image_url, products: 0, brands: 0, skipped: true };
  await fs.mkdir(COVERS_DIR, { recursive: true });
  const filename = `cover-${categoryId}-${randomUUID()}.jpg`;
  await fs.writeFile(path.join(COVERS_DIR, filename), cover.buffer);
  const imageUrl = `/uploads/categories/${filename}`;
  await pool.query(
    `UPDATE categories SET image_url = ?, ai_image_model = ?, ai_image_quality = NULL, ai_image_cost_usd = 0, ai_image_cost_estimated = 0,
       updated_by = COALESCE(?, updated_by), updated_at = ? WHERE id = ?`,
    [imageUrl, 'catalogue-products', userId, new Date(), categoryId]
  );
  return { image_url: imageUrl, previous_image_url: category.image_url, products: cover.products, brands: cover.brands };
}
