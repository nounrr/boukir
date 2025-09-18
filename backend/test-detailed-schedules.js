import pool from './db/pool.js';

async function testDirectDB() {
  try {
    console.log('=== TEST DONNÉES HORAIRES DÉTAILLÉS ===');
    
    const query = `
      SELECT 
        asd.user_id,
        e.nom_complet as user_name,
        e.role as user_role,
        asd.day_of_week,
        asd.start_time,
        asd.end_time,
        asd.is_active
      FROM access_schedule_details asd
      JOIN employees e ON asd.user_id = e.id
      ORDER BY asd.user_id, asd.day_of_week
    `;

    const [schedules] = await pool.execute(query);

    console.log('Données brutes dans la base:');
    console.table(schedules);

    // Grouper par utilisateur comme dans l'API
    const groupedSchedules = schedules.reduce((acc, row) => {
      const userId = row.user_id;
      
      if (!acc[userId]) {
        acc[userId] = {
          user_id: userId,
          user_name: row.user_name,
          user_role: row.user_role,
          schedules: []
        };
      }
      
      acc[userId].schedules.push({
        user_id: userId,
        day_of_week: row.day_of_week,
        start_time: row.start_time,
        end_time: row.end_time,
        is_active: Boolean(row.is_active)
      });
      
      return acc;
    }, {});

    const result = Object.values(groupedSchedules);
    
    console.log('\nDonnées groupées (format API):');
    console.log(JSON.stringify(result, null, 2));
    
    await pool.end();
  } catch (error) {
    console.error('Erreur:', error);
    await pool.end();
  }
}

testDirectDB();