import pool from './backend/db/pool.js';

async function checkSchema() {
  try {
    const [rows] = await pool.query('DESCRIBE ecommerce_orders');
    console.log(JSON.stringify(rows.map(r => r.Field), null, 2));
  } catch (err) {
    console.error(err);
  } finally {
//    await pool.end(); // Don't close pool if it's shared/managed elsewhere, but here it's fine.
    process.exit(0);
  }
}

checkSchema();
