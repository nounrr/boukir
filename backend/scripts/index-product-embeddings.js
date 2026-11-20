/**
 * First (or full) indexing of product photos for visual search.
 *   node backend/scripts/index-product-embeddings.js            (all products missing a vector)
 *   node backend/scripts/index-product-embeddings.js --limit 300
 * Needs GEMINI_API_KEY and the database settings in the environment (.env). Safe to re-run:
 * products already indexed with the same photo are skipped.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load backend/.env relative to this script, then import the pool (it reads the env on import).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
const { default: pool } = await import('../db/pool.js');
const { ensureVisualSearchSchema, geminiKey, indexProductImages } = await import('../utils/visualSearch.js');

const arg = process.argv.indexOf('--limit');
const total = arg > 0 ? Math.max(1, Number(process.argv[arg + 1]) || 0) : Infinity;

if (!geminiKey()) {
  console.error('GEMINI_API_KEY is not set.');
  process.exit(1);
}
await ensureVisualSearchSchema(pool);
let done = 0;
for (;;) {
  const step = Math.min(120, total - done);
  if (step <= 0) break;
  const result = await indexProductImages(pool, { limit: step, log: console.log });
  done += result.indexed;
  console.log(`indexed ${result.indexed}, unreadable ${result.skipped}, remaining ${result.pending}`);
  if (result.indexed === 0 || result.pending === 0) break;
}
console.log(`Done: ${done} product photos indexed.`);
await pool.end();
