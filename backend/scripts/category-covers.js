// New category images composed from our real products and brands (no AI, free, nothing invented):
// up to 4 published product photos of the category and its sub-categories (one per sub-category
// first, in stock first), and the logos of the brands most present in it.
//
//   npm run categories:covers                       -> preview: writes the covers to
//                                                      uploads/_category-covers-preview/ (site unchanged)
//   npm run categories:covers -- --apply            -> sets them as the category images
//   options: --only-missing (categories without an image only), --ids=73,156
//   npm run categories:covers -- --revert=<file>    -> puts back the images listed in a backup file
//
// With --apply, the previous image of every category is saved in uploads/_category-covers-backups/.
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import pool from '../db/pool.js';
import { composeCategoryCover } from '../utils/categoryCover.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS = path.resolve(__dirname, '..', 'uploads');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const onlyMissing = args.includes('--only-missing');
const idsArg = args.find((a) => a.startsWith('--ids='));
const revertArg = args.find((a) => a.startsWith('--revert='));
const onlyIds = idsArg ? new Set(idsArg.slice(6).split(',').map(Number).filter(Boolean)) : null;

/** Absolute path of a /uploads/... URL, only if the file is on this server. */
async function localFile(url) {
  const value = String(url || '');
  if (!value.startsWith('/uploads/')) return null;
  const file = path.resolve(UPLOADS, value.replace(/^\/uploads\//, ''));
  if (!file.startsWith(UPLOADS)) return null;
  try {
    await fs.access(file);
    return file;
  } catch {
    return null;
  }
}

async function revert(file) {
  const backup = JSON.parse(await fs.readFile(file, 'utf8'));
  for (const row of backup) {
    await pool.query('UPDATE categories SET image_url = ?, updated_at = ? WHERE id = ?', [row.previous_image_url, new Date(), row.id]);
  }
  console.log(`${backup.length} category images put back from ${file}.`);
}

async function main() {
  if (revertArg) return revert(revertArg.slice(9));

  const [categories] = await pool.query('SELECT id, nom, parent_id, image_url FROM categories ORDER BY id');
  const children = new Map();
  for (const c of categories) {
    if (!c.parent_id) continue;
    if (!children.has(c.parent_id)) children.set(c.parent_id, []);
    children.get(c.parent_id).push(c.id);
  }
  const descendants = (id) => {
    const ids = [id];
    for (let i = 0; i < ids.length; i += 1) ids.push(...(children.get(ids[i]) || []));
    return [...new Set(ids)];
  };

  const targets = categories.filter((c) => (!onlyIds || onlyIds.has(c.id)) && (!onlyMissing || !c.image_url));
  const previewDir = path.join(UPLOADS, '_category-covers-preview');
  const coversDir = path.join(UPLOADS, 'categories');
  await fs.mkdir(apply ? coversDir : previewDir, { recursive: true });
  const backup = [];
  let done = 0;
  let skipped = 0;

  for (const category of targets) {
    const ids = descendants(category.id);
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
    while (photos.length < 4 && queues.some((q) => q.length)) {
      for (const queue of queues) {
        const row = queue.shift();
        if (!row || seen.has(row.image_url)) continue;
        seen.add(row.image_url);
        const file = await localFile(row.image_url);
        if (file) photos.push(file);
        if (photos.length >= 4) break;
      }
    }
    if (photos.length === 0) {
      skipped += 1;
      console.log(`- ${category.id} ${category.nom}: no product photo, kept as it is`);
      continue;
    }

    // Brands: the most present ones that have a logo on the server.
    const brandCount = new Map();
    for (const row of rows) if (row.brand_id && row.brand_logo) brandCount.set(row.brand_logo, (brandCount.get(row.brand_logo) || 0) + 1);
    const logos = [];
    for (const [logo] of [...brandCount.entries()].sort((a, b) => b[1] - a[1])) {
      const file = await localFile(logo);
      if (file) logos.push(file);
      if (logos.length >= 5) break;
    }

    let cover;
    try {
      cover = await composeCategoryCover({
        products: await Promise.all(photos.map((file) => fs.readFile(file))),
        logos: await Promise.all(logos.map((file) => fs.readFile(file))),
      });
    } catch (error) {
      skipped += 1;
      console.log(`- ${category.id} ${category.nom}: failed (${error?.message || error})`);
      continue;
    }

    if (apply) {
      const filename = `cover-${category.id}-${randomUUID()}.jpg`;
      await fs.writeFile(path.join(coversDir, filename), cover);
      await pool.query('UPDATE categories SET image_url = ?, updated_at = ? WHERE id = ?', [`/uploads/categories/${filename}`, new Date(), category.id]);
      backup.push({ id: category.id, nom: category.nom, previous_image_url: category.image_url });
    } else {
      await fs.writeFile(path.join(previewDir, `cat-${category.id}.jpg`), cover);
    }
    done += 1;
    console.log(`+ ${category.id} ${category.nom}: ${photos.length} products, ${logos.length} brands`);
  }

  if (apply && backup.length) {
    const dir = path.join(UPLOADS, '_category-covers-backups');
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    await fs.writeFile(file, JSON.stringify(backup, null, 2));
    console.log(`\nPrevious images saved in ${file} (undo: npm run categories:covers -- --revert=${file}).`);
  }
  console.log(`\n${done} covers ${apply ? 'set' : 'written to uploads/_category-covers-preview/'}, ${skipped} skipped.`);
  if (!apply) console.log('Look at the previews, then run again with --apply to use them on the site.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end?.());
