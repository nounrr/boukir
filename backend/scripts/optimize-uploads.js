// Compresses the catalogue photos already stored in backend/uploads (products, categories, brands,
// hero slides), in place: same file names, same formats, so every URL in the database stays valid.
//
//   npm run images:optimize            -> preview only: lists what would be saved, changes nothing
//   npm run images:optimize -- --apply -> compresses, and keeps each original in uploads/_originals/
//
// Run it once on the server after deploying; new uploads are compressed automatically.
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { optimizeImageFile } from '../utils/optimizeImage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS = path.resolve(__dirname, '..', 'uploads');
// Public catalogue folders only (private folders such as payments or employee_docs are never touched).
const FOLDERS = ['products', 'categories', 'brands', 'hero_slides', 'services'];
const IMAGE = /\.(jpe?g|png|webp)$/i;
const apply = process.argv.includes('--apply');

async function* walk(dir) {
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && IMAGE.test(entry.name)) yield full;
  }
}

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
let seen = 0;
let changed = 0;
let before = 0;
let after = 0;

for (const folder of FOLDERS) {
  for await (const file of walk(path.join(UPLOADS, folder))) {
    seen += 1;
    const result = await optimizeImageFile(file, { dryRun: true });
    if (!result.changed) continue;
    if (apply) {
      const backup = path.join(UPLOADS, '_originals', path.relative(UPLOADS, file));
      await fs.mkdir(path.dirname(backup), { recursive: true });
      // Keep the first original only (running the script twice never overwrites it).
      await fs.copyFile(file, backup, fs.constants.COPYFILE_EXCL).catch(() => {});
      const done = await optimizeImageFile(file);
      if (!done.changed) continue;
      result.after = done.after;
    }
    changed += 1;
    before += result.before;
    after += result.after;
    console.log(`${path.relative(UPLOADS, file)}: ${kb(result.before)} -> ${kb(result.after)}`);
  }
}

console.log(`\n${seen} images checked, ${changed} ${apply ? 'compressed' : 'to compress'}: ${kb(before)} -> ${kb(after)} (${before ? Math.round((1 - after / before) * 100) : 0}% lighter).`);
if (!apply && changed) console.log('Preview only. Run again with --apply to write the files (originals kept in uploads/_originals/).');
