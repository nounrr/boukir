import pool from './db/pool.js';

(async () => {
  try {
    // Get all products with their categories
    const [products] = await pool.query(`
      SELECT 
        p.id,
        p.designation,
        p.categorie_id,
        c.nom as categorie_nom,
        c.parent_id,
        p.ecom_published,
        p.stock_partage_ecom,
        p.stock_partage_ecom_qty,
        p.has_variants,
        p.quantite
      FROM products p
      LEFT JOIN categories c ON p.categorie_id = c.id
      WHERE p.ecom_published = 1
      ORDER BY p.id
      LIMIT 25
    `);
    
    console.log('\n📦 Published E-commerce Products:');
    console.log('='.repeat(100));
    products.forEach(p => {
      console.log(`ID: ${p.id} | ${p.designation}`);
      console.log(`   Category: ${p.categorie_nom || 'NONE'} (ID: ${p.categorie_id || 'NULL'})`);
      console.log(`   Stock: qty=${p.quantite}, ecom_qty=${p.stock_partage_ecom_qty}, stock_partage_ecom=${p.stock_partage_ecom}, has_variants=${p.has_variants}`);
      console.log('');
    });
    
    // Get all categories
    const [categories] = await pool.query(`
      SELECT id, nom, parent_id
      FROM categories
      ORDER BY parent_id, id
    `);
    
    console.log('\n📁 All Categories:');
    console.log('='.repeat(100));
    categories.forEach(c => {
      console.log(`ID: ${c.id} | ${c.nom} | Parent: ${c.parent_id || 'ROOT'}`);
    });
    
    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
