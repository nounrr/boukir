import pool from './db/pool.js';

async function addDetailedColumn() {
  try {
    console.log('Ajout de la colonne detailed_schedules...');
    
    await pool.execute(`
      ALTER TABLE access_schedules 
      ADD COLUMN detailed_schedules JSON NULL 
      COMMENT 'Horaires détaillés par jour'
    `);
    
    console.log('✓ Colonne detailed_schedules ajoutée');
    
    // Vérifier
    const [columns] = await pool.execute('DESCRIBE access_schedules');
    console.log('\nStructure mise à jour:');
    console.table(columns);
    
    await pool.end();
  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('⚠ Colonne detailed_schedules déjà existante');
    } else {
      console.error('Erreur:', error.message);
    }
    await pool.end();
  }
}

addDetailedColumn();