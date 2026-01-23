import mysql from 'mysql2/promise';

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'rootroot@',
    database: 'boukir',
    port: 3307
  });

  const bonId = 252;
  console.log('=== TEST DATE PAIEMENT POUR BON 252 ===\n');
  
  // 1. Vérifier le bon sortie
  console.log('1️⃣ BON SORTIE 252:');
  const [bonRows] = await pool.query(
    'SELECT id, date_creation, created_at FROM bons_sortie WHERE id = ?',
    [bonId]
  );
  
  if (bonRows.length > 0) {
    const bon = bonRows[0];
    console.log('   date_creation:', bon.date_creation);
    console.log('   created_at:', bon.created_at);
    
    const dateDoc = new Date(bon.date_creation);
    const dateCreated = new Date(bon.created_at);
    const bonDate = dateDoc > dateCreated ? dateDoc : dateCreated;
    
    console.log('\n2️⃣ CALCUL DATE PAIEMENT (NOUVELLE LOGIQUE):');
    console.log('   Date doc (date_creation):', dateDoc.toISOString());
    console.log('   Date created (created_at):', dateCreated.toISOString());
    console.log('   Date retenue (la plus récente):', bonDate.toISOString());
    
    // Nouvelle logique: +1 heure avec getTime()
    const paymentDate = new Date(bonDate.getTime() + (60 * 60 * 1000)); // +1 heure
    const createdAtValue = paymentDate.toISOString().slice(0, 19).replace('T', ' ');
    
    console.log('   Date finale (+1 heure):', paymentDate.toISOString());
    console.log('   Format MySQL:', createdAtValue);
    
    // 3. Vérifier s'il y a des paiements pour ce bon
    console.log('\n3️⃣ PAIEMENTS EXISTANTS POUR CE BON:');
    const [payments] = await pool.query(
      'SELECT id, numero, created_at, date_ajout_reelle, bon_id FROM payments WHERE bon_id = ? ORDER BY created_at DESC LIMIT 5',
      [bonId]
    );
    
    if (payments.length > 0) {
      payments.forEach(p => {
        console.log(`   Paiement ${p.numero}: created_at=${p.created_at} | date_ajout_reelle=${p.date_ajout_reelle}`);
      });
    } else {
      console.log('   Aucun paiement trouvé');
    }
    
    // 4. Comparer les dates
    console.log('\n4️⃣ COMPARAISON:');
    console.log('   Bon date_creation:', bon.date_creation);
    console.log('   Bon created_at:', bon.created_at);
    console.log('   Paiement devrait être à:', createdAtValue);
    
    if (payments.length > 0) {
      const lastPayment = payments[0];
      const paymentDate = new Date(lastPayment.created_at);
      const bonDateFinal = new Date(bon.date_creation > bon.created_at ? bon.date_creation : bon.created_at);
      
      console.log('\n   Dernier paiement:', lastPayment.created_at);
      console.log('   Le paiement est-il APRÈS le bon?', paymentDate > bonDateFinal ? '✅ OUI' : '❌ NON');
    }
  }
  
  await pool.end();
})();
