import mysql from 'mysql2/promise';

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'rootroot@',
    database: 'boukir',
    port: 3307
  });

  const cleanBonId = 252;
  console.log('🔍 Recherche bon ID:', cleanBonId);
  
  const bonTables = [
    { table: 'bons_commande', dateField: 'date_creation' },
    { table: 'bons_sortie', dateField: 'date_creation' },
    { table: 'bons_comptant', dateField: 'date_creation' },
    { table: 'avoirs_client', dateField: 'date_creation' },
    { table: 'avoirs_fournisseur', dateField: 'date_creation' }
  ];
  
  let bonDate = null;
  
  for (const { table, dateField } of bonTables) {
    try {
      const [bonRows] = await pool.query(
        `SELECT ${dateField} as date_doc, created_at FROM ${table} WHERE id = ?`,
        [cleanBonId]
      );
      
      if (bonRows.length > 0) {
        console.log(`✅ Bon trouvé dans ${table}`);
        console.log('   Row:', bonRows[0]);
        bonDate = new Date(bonRows[0].date_doc || bonRows[0].created_at);
        console.log('   Date objet:', bonDate);
        console.log('   Date ISO:', bonDate.toISOString());
        
        bonDate.setSeconds(bonDate.getSeconds() + 5);
        const createdAtValue = bonDate.toISOString().slice(0, 19).replace('T', ' ');
        console.log('   created_at final:', createdAtValue);
        break;
      }
    } catch (e) {
      console.log(`⚠️ Erreur dans ${table}:`, e.message);
    }
  }
  
  if (!bonDate) {
    console.log('❌ Bon non trouvé!');
  }
  
  await pool.end();
})();
