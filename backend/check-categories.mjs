import pool from './db/pool.js';

(async () => {
  try {
    console.log('\n📁 ALL CATEGORIES IN DATABASE:');
    console.log('='.repeat(100));
    
    const [allCats] = await pool.query(`
      SELECT id, nom, parent_id
      FROM categories
      ORDER BY id
    `);
    
    allCats.forEach(c => {
      const parentInfo = c.parent_id ? `Parent: ${c.parent_id}` : 'ROOT';
      console.log(`ID: ${c.id} | ${c.nom} | ${parentInfo}`);
    });
    
    console.log('\n\n📦 CATEGORIES USED BY E-COMMERCE PRODUCTS:');
    console.log('='.repeat(100));
    
    const [usedCats] = await pool.query(`
      SELECT DISTINCT 
        c.id, 
        c.nom, 
        c.parent_id,
        COUNT(p.id) as product_count
      FROM categories c
      INNER JOIN products p ON p.categorie_id = c.id
      WHERE p.ecom_published = 1
      GROUP BY c.id, c.nom, c.parent_id
      ORDER BY c.id
    `);
    
    usedCats.forEach(c => {
      const parentInfo = c.parent_id ? `Parent: ${c.parent_id}` : 'ROOT';
      console.log(`ID: ${c.id} | ${c.nom} | ${parentInfo} | Products: ${c.product_count}`);
    });
    
    console.log('\n\n🌳 TESTING RECURSIVE CATEGORY TREE QUERY:');
    console.log('='.repeat(100));
    
    const [treeResult] = await pool.query(`
      WITH RECURSIVE category_tree AS (
        -- Get all leaf categories that have published products
        SELECT DISTINCT c.id, c.nom, c.parent_id
        FROM categories c
        INNER JOIN products p ON p.categorie_id = c.id
        WHERE p.ecom_published = 1 
          AND COALESCE(p.is_deleted, 0) = 0
        
        UNION
        
        -- Recursively get all parent categories
        SELECT c.id, c.nom, c.parent_id
        FROM categories c
        INNER JOIN category_tree ct ON c.id = ct.parent_id
      )
      SELECT DISTINCT id, nom, parent_id
      FROM category_tree
      ORDER BY parent_id, nom
    `);
    
    console.log(`Found ${treeResult.length} categories in tree:`);
    treeResult.forEach(c => {
      const parentInfo = c.parent_id ? `Parent: ${c.parent_id}` : 'ROOT';
      console.log(`  ID: ${c.id} | ${c.nom} | ${parentInfo}`);
    });
    
    await pool.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err);
    process.exit(1);
  }
})();
