import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Load backend/.env relative to this script
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Import pool after env is loaded
const { default: pool } = await import('../db/pool.js');

try {
  const [rows] = await pool.query('SELECT 1 AS ok, DATABASE() AS db, CURRENT_USER() AS user');
  console.log({ ok: true, result: rows[0] });
  process.exit(0);
} catch (err) {
  console.error({ ok: false, error: err.message });
  process.exit(1);
}
