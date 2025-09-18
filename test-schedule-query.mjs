import pool from './backend/db/pool.js';

try {
  console.log('Test de la requête access_schedules...');
  
  const [rows] = await pool.execute(`
    SELECT 
      id,
      user_id,
      user_name,
      user_role,
      start_time,
      end_time,
      days_of_week,
      detailed_schedules,
      is_active,
      created_at,
      updated_at
    FROM access_schedules
    ORDER BY user_name ASC
  `);

  console.log('Requête exécutée avec succès:', rows.length, 'résultats');
  
  const schedules = rows.map(schedule => ({
    ...schedule,
    days_of_week: Array.isArray(schedule.days_of_week) ? schedule.days_of_week : JSON.parse(schedule.days_of_week || '[1,2,3,4,5]'),
    detailed_schedules: schedule.detailed_schedules ? 
      (typeof schedule.detailed_schedules === 'object' ? schedule.detailed_schedules : JSON.parse(schedule.detailed_schedules)) 
      : null
  }));
  
  console.log('Données parsées avec succès');
  console.log('Premier résultat:', JSON.stringify(schedules[0], null, 2));
  process.exit(0);
} catch(err) {
  console.error('Erreur détaillée:', err.message);
  console.error('Stack:', err.stack);
  process.exit(1);
}