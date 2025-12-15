import pool from '../db/pool.js';

async function runMigration() {
  try {
    console.log('Adding multi-language columns to products table...');

    const columnsToAdd = [
      // Arabic
      "ADD COLUMN designation_ar VARCHAR(255) DEFAULT NULL",
      "ADD COLUMN description_ar TEXT DEFAULT NULL",
      "ADD COLUMN fiche_technique_ar VARCHAR(255) DEFAULT NULL",
      
      // English
      "ADD COLUMN designation_en VARCHAR(255) DEFAULT NULL",
      "ADD COLUMN description_en TEXT DEFAULT NULL",
      "ADD COLUMN fiche_technique_en VARCHAR(255) DEFAULT NULL",

      // Chinese
      "ADD COLUMN designation_zh VARCHAR(255) DEFAULT NULL",
      "ADD COLUMN description_zh TEXT DEFAULT NULL",
      "ADD COLUMN fiche_technique_zh VARCHAR(255) DEFAULT NULL"
    ];

    for (const col of columnsToAdd) {
      try {
        await pool.query(`ALTER TABLE products ${col}`);
        console.log(`Executed: ${col}`);
      } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
          console.log(`Column already exists, skipping: ${col}`);
        } else {
          throw e;
        }
      }
    }

    console.log('Migration successful');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

runMigration();