import pool from './backend/db/pool.js';

async function addColumn() {
  try {
    await pool.execute(`
      ALTER TABLE employe_salaire 
      ADD COLUMN statut ENUM('En attente', 'Validé', 'Annulé') 
      NOT NULL DEFAULT 'En attente' 
      AFTER note
    `);
    console.log('Column statut added successfully!');
  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('Column statut already exists');
    } else {
      console.error('Error adding column:', error);
    }
  } finally {
    await pool.end();
  }
}

addColumn();