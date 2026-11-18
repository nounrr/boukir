// New category images composed from our real products and brands (no AI, free, nothing invented):
// up to 4 published product photos of the category and its sub-categories (one per sub-category
// first, in stock first), and the logos of the brands most present in it.
// Same result as the « Nos produits » buttons of the back-office Catégories page.
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
import pool from '../db/pool.js';
import { UPLOADS_DIR, applyCategoryCover, buildCategoryCover } from '../utils/categoryCoverFromCatalog.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const onlyMissing = args.includes('--only-missing');
const idsArg = args.find((a) => a.startsWith('--ids='));
const revertArg = args.find((a) => a.startsWith('--revert='));
const onlyIds = idsArg ? new Set(idsArg.slice(6).split(',').map(Number).filter(Boolean)) : null;

async function revert(file) {
  const backup = JSON.parse(await fs.readFile(file, 'utf8'));
  for (const row of backup) {
    await pool.query('UPDATE categories SET image_url = ?, updated_at = ? WHERE id = ?', [row.previous_image_url, new Date(), row.id]);
  }
  console.log(`${backup.length} category images put back from ${file}.`);
}

async function main() {
  if (revertArg) return revert(revertArg.slice(9));

  const [categories] = await pool.query('SELECT id, nom, image_url FROM categories ORDER BY id');
  const targets = categories.filter((c) => (!onlyIds || onlyIds.has(c.id)) && (!onlyMissing || !c.image_url));
  const previewDir = path.join(UPLOADS_DIR, '_category-covers-preview');
  if (!apply) await fs.mkdir(previewDir, { recursive: true });
  const backup = [];
  let done = 0;
  let skipped = 0;

  for (const category of targets) {
    try {
      if (apply) {
        const result = await applyCategoryCover(category.id);
        if (!result || result.skipped) {
          skipped += 1;
          console.log(`- ${category.id} ${category.nom}: no product photo, kept as it is`);
          continue;
        }
        backup.push({ id: category.id, nom: category.nom, previous_image_url: result.previous_image_url });
        console.log(`+ ${category.id} ${category.nom}: ${result.products} products, ${result.brands} brands`);
      } else {
        const cover = await buildCategoryCover(category.id);
        if (!cover) {
          skipped += 1;
          console.log(`- ${category.id} ${category.nom}: no product photo, kept as it is`);
          continue;
        }
        await fs.writeFile(path.join(previewDir, `cat-${category.id}.jpg`), cover.buffer);
        console.log(`+ ${category.id} ${category.nom}: ${cover.products} products, ${cover.brands} brands`);
      }
      done += 1;
    } catch (error) {
      skipped += 1;
      console.log(`- ${category.id} ${category.nom}: failed (${error?.message || error})`);
    }
  }

  if (apply && backup.length) {
    const dir = path.join(UPLOADS_DIR, '_category-covers-backups');
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
