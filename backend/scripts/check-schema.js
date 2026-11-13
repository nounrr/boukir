/**
 * READ-ONLY check of the database against the migration files. It only runs SELECTs on information_schema and
 * schema_migrations: it never changes anything.
 *
 *   node backend/scripts/check-schema.js
 *
 * Exit code 0 = nothing missing, 1 = something missing (the report says which migration file to run).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { findMissing } from '../utils/schemaCheck.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

const { default: pool } = await import('../db/pool.js');

try {
  const [[{ db }]] = await pool.query('SELECT DATABASE() AS db');
  const [tableRows] = await pool.query('SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [db]);
  const [columnRows] = await pool.query('SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?', [db]);
  const existing = {
    tables: new Set(tableRows.map((r) => r.t)),
    columns: new Set(columnRows.map((r) => `${r.t}.${r.c}`)),
  };

  let recorded = null;
  if (existing.tables.has('schema_migrations')) {
    const [rows] = await pool.query('SELECT filename FROM schema_migrations');
    recorded = new Set(rows.map((r) => r.filename));
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8') }));

  console.log(`Base : ${db} (${existing.tables.size} tables)`);
  if (recorded) {
    const notRecorded = files.filter((f) => !recorded.has(f.name)).map((f) => f.name);
    console.log(`\nMigrations non enregistrées dans schema_migrations (${notRecorded.length}) :`);
    for (const n of notRecorded) console.log(`  - ${n}`);
  } else {
    console.log('\n(table schema_migrations absente : les migrations ont été appliquées à la main)');
  }

  const missing = findMissing(files, existing);
  if (!missing.length) {
    console.log('\nOK : toutes les tables et colonnes promises par les migrations existent.');
  } else {
    console.log('\nÉLÉMENTS MANQUANTS :');
    for (const m of missing) {
      console.log(`\n  ${m.file}`);
      for (const t of m.missingTables) console.log(`    table manquante   : ${t}`);
      for (const c of m.missingColumns) console.log(`    colonne manquante : ${c}`);
    }
    console.log('\nÀ faire (après sauvegarde) : npm run db:migrate   ou   npm run db:migrate:one -- <fichier>');
    process.exitCode = 1;
  }
} finally {
  await pool.end?.();
}
