import mysql from 'mysql2/promise';
import 'dotenv/config';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'boukir',
});

async function run() {
  const conn = await pool.getConnection();
  try {
    // 1. Check if column already exists
    const [cols] = await conn.query(
      `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND COLUMN_NAME = 'prix_achat_snapshot'`,
      [process.env.DB_NAME || 'boukir']
    );
    const existingTables = new Set(cols.map(c => c.TABLE_NAME));

    const itemTables = [
      { table: 'sortie_items',           afterCol: 'bon_commande_id' },
      { table: 'comptant_items',          afterCol: 'bon_commande_id' },
      { table: 'devis_items',             afterCol: 'bon_commande_id' },
      { table: 'vehicule_items',          afterCol: 'bon_commande_id' },
      { table: 'avoir_client_items',      afterCol: 'bon_commande_id' },
      { table: 'avoir_comptant_items',    afterCol: 'bon_commande_id' },
      { table: 'avoir_fournisseur_items', afterCol: 'bon_commande_id' },
      { table: 'ecommerce_order_items',   afterCol: 'bon_commande_id' },
      { table: 'avoir_ecommerce_items',   afterCol: 'bon_commande_id' },
    ];

    // 2. ALTER TABLE — add column if not exists
    for (const { table, afterCol } of itemTables) {
      if (existingTables.has(table)) {
        console.log(`  ✓ ${table} — column already exists, skipping ALTER`);
      } else {
        console.log(`  + ${table} — adding prix_achat_snapshot column...`);
        await conn.query(
          `ALTER TABLE \`${table}\` ADD COLUMN prix_achat_snapshot DECIMAL(10,2) DEFAULT NULL AFTER \`${afterCol}\``
        );
      }
    }

    // 3. Backfill: for items where bon_commande_id IS NULL, set prix_achat_snapshot = products.prix_achat
    console.log('\n--- Backfill: setting prix_achat_snapshot for items without bon_commande_id ---');
    for (const { table } of itemTables) {
      const [result] = await conn.query(
        `UPDATE \`${table}\` t
         JOIN products p ON p.id = t.product_id
         SET t.prix_achat_snapshot = p.prix_achat
         WHERE t.bon_commande_id IS NULL
           AND t.prix_achat_snapshot IS NULL`
      );
      console.log(`  ${table}: ${result.affectedRows} rows updated`);
    }

    // 4. Verification
    console.log('\n--- Verification ---');
    for (const { table } of itemTables) {
      const [rows] = await conn.query(
        `SELECT COUNT(*) AS total,
                SUM(bon_commande_id IS NOT NULL) AS with_bon,
                SUM(bon_commande_id IS NULL) AS without_bon,
                SUM(prix_achat_snapshot IS NOT NULL) AS with_snapshot
         FROM \`${table}\``
      );
      const r = rows[0];
      console.log(`  ${table}: total=${r.total}, with_bon=${r.with_bon}, without_bon=${r.without_bon}, with_snapshot=${r.with_snapshot}`);
    }

    console.log('\n✅ Done!');
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
