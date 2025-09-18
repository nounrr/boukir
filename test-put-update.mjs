import pool from './backend/db/pool.js';

async function testPutUpdate() {
  try {
    console.log('Test de modification d\'une règle existante...');
    
    // Récupérer une règle existante
    const [existing] = await pool.execute('SELECT * FROM access_schedules LIMIT 1');
    if (existing.length === 0) {
      console.log('Aucune règle existante pour tester');
      return;
    }
    
    const rule = existing[0];
    console.log('Règle à modifier:', {
      id: rule.id,
      user_id: rule.user_id,
      user_name: rule.user_name,
      start_time: rule.start_time,
      end_time: rule.end_time,
      days_of_week: rule.days_of_week,
      detailed_schedules: rule.detailed_schedules
    });
    
    // Simuler les données de modification
    const updateData = {
      user_name: rule.user_name,
      user_role: rule.user_role,
      start_time: '10:00',  // Changer l'heure
      end_time: '16:00',    // Changer l'heure
      days_of_week: [1, 2, 3], // Changer les jours
      detailed_schedules: null, // Pas de detailed_schedules
      is_active: true
    };
    
    console.log('Données de modification:', updateData);
    
    // Convertir les jours en JSON
    const daysJson = JSON.stringify(updateData.days_of_week);
    const detailedJson = updateData.detailed_schedules ? JSON.stringify(updateData.detailed_schedules) : null;
    
    console.log('JSON généré:', { daysJson, detailedJson });
    
    // Tester la requête UPDATE directement
    const [result] = await pool.execute(`
      UPDATE access_schedules 
      SET user_name = ?, user_role = ?, start_time = ?, end_time = ?, 
          days_of_week = ?, detailed_schedules = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      updateData.user_name, 
      updateData.user_role, 
      updateData.start_time, 
      updateData.end_time, 
      daysJson, 
      detailedJson, 
      updateData.is_active, 
      rule.id
    ]);
    
    console.log('Résultat UPDATE:', {
      affectedRows: result.affectedRows,
      changedRows: result.changedRows,
      info: result.info
    });
    
    if (result.affectedRows === 0) {
      console.log('❌ Aucune ligne affectée - la règle n\'a pas été trouvée');
    } else {
      console.log('✅ Modification réussie');
      
      // Vérifier le résultat
      const [updated] = await pool.execute('SELECT * FROM access_schedules WHERE id = ?', [rule.id]);
      console.log('Données après modification:', {
        id: updated[0].id,
        start_time: updated[0].start_time,
        end_time: updated[0].end_time,
        days_of_week: updated[0].days_of_week,
        detailed_schedules: updated[0].detailed_schedules
      });
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Erreur dans le test PUT:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
  }
}

testPutUpdate();