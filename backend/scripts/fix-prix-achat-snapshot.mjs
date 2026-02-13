import 'dotenv/config';
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: 3307,   // MySQL94 is on 3307, override .env which says 3306
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'boukir',
  waitForConnections: true,
  connectionLimit: 5,
});

async function run() {
  console.log('=== Connecting to MySQL... ===');
  const conn = await pool.getConnection();
  console.log('✓ Connected!\n');

  try {
    // ==============================
    // DIAGNOSTIC
    // ==============================

    // TEST 1: Produits avec/sans last_boncommande_id
    console.log('=== TEST 1: products.last_boncommande_id ===');
    const [t1] = await conn.query(`
      SELECT COUNT(*) AS total_products,
             SUM(last_boncommande_id IS NOT NULL) AS avec_last_bon,
             SUM(last_boncommande_id IS NULL) AS sans_last_bon
      FROM products
    `);
    console.table(t1);

    // TEST 2: Statuts bons_commande
    console.log('\n=== TEST 2: Statuts bons_commande ===');
    const [t2] = await conn.query(`
      SELECT statut, LOWER(TRIM(statut)) AS normalized, COUNT(*) AS nb
      FROM bons_commande GROUP BY statut ORDER BY nb DESC
    `);
    console.table(t2);

    // TEST 3: Produits dans commande_items validés
    console.log('\n=== TEST 3: Produits avec bon commande validé ===');
    const [t3] = await conn.query(`
      SELECT COUNT(DISTINCT ci.product_id) AS nb_produits_avec_bon_valide
      FROM commande_items ci
      JOIN bons_commande bc ON bc.id = ci.bon_commande_id
      WHERE LOWER(TRIM(bc.statut)) IN ('validé','valide')
    `);
    console.table(t3);

    // TEST 7: Vérifier si colonnes existent
    console.log('\n=== TEST 7: Colonnes prix_achat_snapshot existantes ===');
    const [t7] = await conn.query(`
      SELECT TABLE_NAME, COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND COLUMN_NAME = 'prix_achat_snapshot'
      ORDER BY TABLE_NAME
    `);
    console.table(t7);
    const snapshotExists = t7.length > 0;

    // TEST 4: sortie_items détaillé
    console.log('\n=== TEST 4: sortie_items breakdown ===');
    const [t4] = await conn.query(`
      SELECT
        COUNT(*) AS total,
        SUM(si.bon_commande_id IS NOT NULL) AS avec_bon_cmd,
        SUM(si.bon_commande_id IS NULL) AS sans_bon_cmd,
        SUM(si.bon_commande_id IS NULL AND p.last_boncommande_id IS NULL) AS sans_les_deux,
        SUM(
          si.bon_commande_id IS NULL
          AND p.last_boncommande_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM commande_items ci2
            JOIN bons_commande bc2 ON bc2.id = ci2.bon_commande_id
            WHERE ci2.product_id = si.product_id
              AND (ci2.variant_id <=> si.variant_id)
              AND LOWER(TRIM(bc2.statut)) IN ('validé','valide')
          )
        ) AS eligible_snapshot
      FROM sortie_items si
      JOIN products p ON p.id = si.product_id
    `);
    console.table(t4);

    // TEST NEW: Items sans bon_commande_id MAIS produit apparait dans commande_items validé
    // => Ces items devraient avoir un bon_commande_id !
    console.log('\n=== TEST IMPORTANT: Items SANS bon_commande_id mais produit a un bon commande validé ===');
    const tables = [
      { name: 'sortie_items', alias: 'si', fk: 'bon_sortie_id', hasVariant: true },
      { name: 'comptant_items', alias: 'ci', fk: 'bon_comptant_id', hasVariant: true },
      { name: 'devis_items', alias: 'di', fk: 'devis_id', hasVariant: true },
      { name: 'vehicule_items', alias: 'vi', fk: 'bon_vehicule_id', hasVariant: false },
      { name: 'avoir_client_items', alias: 'ai', fk: 'avoir_client_id', hasVariant: true },
      { name: 'avoir_comptant_items', alias: 'aci', fk: 'avoir_comptant_id', hasVariant: true },
      { name: 'avoir_fournisseur_items', alias: 'afi', fk: 'avoir_fournisseur_id', hasVariant: true },
      { name: 'ecommerce_order_items', alias: 'oi', fk: 'order_id', hasVariant: true },
      { name: 'avoir_ecommerce_items', alias: 'aei', fk: 'avoir_ecommerce_id', hasVariant: true },
    ];

    for (const tbl of tables) {
      const variantMatch = tbl.hasVariant
        ? `AND (ci2.variant_id <=> ${tbl.alias}.variant_id)`
        : `AND ci2.variant_id IS NULL`;
      const [rows] = await conn.query(`
        SELECT COUNT(*) AS total,
               SUM(${tbl.alias}.bon_commande_id IS NOT NULL) AS avec_bon_cmd,
               SUM(${tbl.alias}.bon_commande_id IS NULL) AS sans_bon_cmd,
               SUM(
                 ${tbl.alias}.bon_commande_id IS NULL
                 AND (
                   p.last_boncommande_id IS NOT NULL
                   OR EXISTS (
                     SELECT 1 FROM commande_items ci2
                     JOIN bons_commande bc2 ON bc2.id = ci2.bon_commande_id
                     WHERE ci2.product_id = ${tbl.alias}.product_id
                       ${variantMatch}
                       AND LOWER(TRIM(bc2.statut)) IN ('validé','valide')
                   )
                 )
               ) AS MANQUE_bon_cmd_id
        FROM ${tbl.name} ${tbl.alias}
        JOIN products p ON p.id = ${tbl.alias}.product_id
      `);
      const r = rows[0];
      console.log(`${tbl.name}: total=${r.total}, avec_bon=${r.avec_bon_cmd}, sans_bon=${r.sans_bon_cmd}, MANQUE_bon_cmd=${r.MANQUE_bon_cmd_id}`);
    }

    // ==============================
    // FIX 1: Remplir bon_commande_id manquants
    // Pour les items qui n'ont pas de bon_commande_id mais dont le produit
    // a un last_boncommande_id OU apparait dans un bon commande validé
    // ==============================
    console.log('\n\n========================================');
    console.log('=== FIX 1: Remplir bon_commande_id manquants ===');
    console.log('========================================\n');

    for (const tbl of tables) {
      const variantMatch = tbl.hasVariant
        ? `AND (ci2.variant_id <=> ${tbl.alias}.variant_id)`
        : `AND ci2.variant_id IS NULL`;

      // Cas 1: Produit a last_boncommande_id => l'utiliser directement
      const [r1] = await conn.query(`
        UPDATE ${tbl.name} ${tbl.alias}
        JOIN products p ON p.id = ${tbl.alias}.product_id
        SET ${tbl.alias}.bon_commande_id = p.last_boncommande_id
        WHERE ${tbl.alias}.bon_commande_id IS NULL
          AND p.last_boncommande_id IS NOT NULL
      `);
      console.log(`${tbl.name} - via last_boncommande_id: ${r1.affectedRows} rows updated`);

      // Cas 2: Produit n'a pas last_boncommande_id mais apparait dans commande_items validé
      // => Prendre le dernier bon commande validé pour ce produit+variante
      const [r2] = await conn.query(`
        UPDATE ${tbl.name} ${tbl.alias}
        JOIN products p ON p.id = ${tbl.alias}.product_id
        SET ${tbl.alias}.bon_commande_id = (
          SELECT ci2.bon_commande_id
          FROM commande_items ci2
          JOIN bons_commande bc2 ON bc2.id = ci2.bon_commande_id
          WHERE ci2.product_id = ${tbl.alias}.product_id
            ${variantMatch}
            AND LOWER(TRIM(bc2.statut)) IN ('validé','valide')
          ORDER BY bc2.id DESC
          LIMIT 1
        )
        WHERE ${tbl.alias}.bon_commande_id IS NULL
          AND p.last_boncommande_id IS NULL
          AND EXISTS (
            SELECT 1 FROM commande_items ci2
            JOIN bons_commande bc2 ON bc2.id = ci2.bon_commande_id
            WHERE ci2.product_id = ${tbl.alias}.product_id
              ${variantMatch}
              AND LOWER(TRIM(bc2.statut)) IN ('validé','valide')
          )
      `);
      console.log(`${tbl.name} - via commande_items lookup: ${r2.affectedRows} rows updated`);
    }

    // ==============================
    // FIX 2: Colonnes prix_achat_snapshot
    // ==============================
    console.log('\n\n========================================');
    console.log('=== FIX 2: prix_achat_snapshot ===');
    console.log('========================================\n');

    // Drop si existant
    if (snapshotExists) {
      console.log('Dropping existing prix_achat_snapshot columns...');
      for (const tbl of tables) {
        try {
          await conn.query(`ALTER TABLE ${tbl.name} DROP COLUMN prix_achat_snapshot`);
          console.log(`  ✓ Dropped from ${tbl.name}`);
        } catch (e) {
          console.log(`  - ${tbl.name}: ${e.message}`);
        }
      }
    }

    // Add columns
    console.log('\nAdding prix_achat_snapshot columns...');
    for (const tbl of tables) {
      try {
        await conn.query(`ALTER TABLE ${tbl.name} ADD COLUMN prix_achat_snapshot DECIMAL(10,2) DEFAULT NULL AFTER bon_commande_id`);
        console.log(`  ✓ Added to ${tbl.name}`);
      } catch (e) {
        console.log(`  - ${tbl.name}: ${e.message}`);
      }
    }

    // Backfill: SEULEMENT pour items qui n'ont TOUJOURS PAS de bon_commande_id
    // (après FIX 1, ce sont les vrais produits sans aucun bon commande)
    console.log('\nBackfilling prix_achat_snapshot (only for items still without bon_commande_id)...');
    for (const tbl of tables) {
      const [r] = await conn.query(`
        UPDATE ${tbl.name} ${tbl.alias}
        JOIN products p ON p.id = ${tbl.alias}.product_id
        SET ${tbl.alias}.prix_achat_snapshot = p.prix_achat
        WHERE ${tbl.alias}.bon_commande_id IS NULL
          AND ${tbl.alias}.prix_achat_snapshot IS NULL
          AND p.prix_achat IS NOT NULL
          AND p.prix_achat > 0
      `);
      console.log(`  ${tbl.name}: ${r.affectedRows} rows filled`);
    }

    // ==============================
    // VERIFICATION FINALE
    // ==============================
    console.log('\n\n========================================');
    console.log('=== VERIFICATION FINALE ===');
    console.log('========================================\n');

    for (const tbl of tables) {
      const [rows] = await conn.query(`
        SELECT COUNT(*) AS total,
               SUM(bon_commande_id IS NOT NULL) AS avec_bon_cmd,
               SUM(bon_commande_id IS NULL) AS sans_bon_cmd,
               SUM(prix_achat_snapshot IS NOT NULL) AS avec_snapshot,
               SUM(bon_commande_id IS NULL AND prix_achat_snapshot IS NULL) AS sans_rien
        FROM ${tbl.name}
      `);
      const r = rows[0];
      console.log(`${tbl.name}: total=${r.total} | bon_cmd=${r.avec_bon_cmd} | snapshot=${r.avec_snapshot} | sans_rien=${r.sans_rien}`);
    }

    console.log('\n✅ DONE! Tout est corrigé.');

  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('❌ ERROR:', err.message);
  process.exit(1);
});
