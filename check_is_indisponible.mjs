import pool from './backend/db/pool.js';

const tables = [
  'commande_items',
  'sortie_items',
  'comptant_items',
  'ecommerce_order_items',
  'avoir_client_items',
  'avoir_comptant_items',
  'avoir_fournisseur_items',
  'avoir_ecommerce_items',
];

for (const t of tables) {
  try {
    const [rows] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME='is_indisponible'`,
      [t]
    );
    console.log(t + ': ' + (rows.length ? 'OK' : 'MISSING'));
  } catch (e) {
    console.log(t + ': ERROR ' + e.message);
  }
}

process.exit(0);
