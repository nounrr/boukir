import pool from './backend/db/pool.js';

async function testPutRoute() {
  try {
    console.log('Test de la route PUT...');
    
    // Récupérer un horaire existant
    const [existing] = await pool.execute('SELECT * FROM access_schedules LIMIT 1');
    if (existing.length === 0) {
      console.log('Aucun horaire existant pour tester');
      return;
    }
    
    const schedule = existing[0];
    console.log('Horaire existant:', {
      id: schedule.id,
      user_id: schedule.user_id,
      user_name: schedule.user_name
    });
    
    // Simuler la requête PUT
    const testData = {
      user_name: schedule.user_name,
      user_role: schedule.user_role,
      start_time: '09:00',
      end_time: '18:00',
      days_of_week: [1, 2, 3, 4, 5],
      detailed_schedules: {
        "1": {"start_time": "09:00", "end_time": "17:00"},
        "2": {"start_time": "09:00", "end_time": "17:00"}
      },
      is_active: true
    };
    
    const daysJson = JSON.stringify(testData.days_of_week);
    const detailedJson = testData.detailed_schedules ? JSON.stringify(testData.detailed_schedules) : null;
    
    console.log('Données de test:', {
      days_of_week: testData.days_of_week,
      detailed_schedules: testData.detailed_schedules,
      daysJson,
      detailedJson
    });
    
    // Tester la requête UPDATE
    const [result] = await pool.execute(`
      UPDATE access_schedules 
      SET user_name = ?, user_role = ?, start_time = ?, end_time = ?, 
          days_of_week = ?, detailed_schedules = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      testData.user_name, 
      testData.user_role, 
      testData.start_time, 
      testData.end_time, 
      daysJson, 
      detailedJson, 
      testData.is_active, 
      schedule.id
    ]);
    
    console.log('Résultat UPDATE:', result);
    
    if (result.affectedRows === 0) {
      console.log('Aucune ligne affectée');
    } else {
      console.log('Mise à jour réussie');
    }
    
    // Vérifier le résultat
    const [updated] = await pool.execute('SELECT * FROM access_schedules WHERE id = ?', [schedule.id]);
    console.log('Données après mise à jour:', {
      id: updated[0].id,
      start_time: updated[0].start_time,
      end_time: updated[0].end_time,
      days_of_week: updated[0].days_of_week,
      detailed_schedules: updated[0].detailed_schedules
    });
    
    process.exit(0);
  } catch (err) {
    console.error('Erreur dans le test PUT:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
  }
}

testPutRoute();