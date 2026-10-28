import pool from './pool.js';
import { SAISIE_TABLES } from '../utils/bonSaisie.js';

export async function ensurePaymentModesAndSaisieSchema(db = pool) {
  for (const table of Object.values(SAISIE_TABLES)) {
    const [columns] = await db.query('SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table]);
    if (!columns.length) continue;
    if (!columns.some(column => column.COLUMN_NAME === 'is_saisise')) {
      await db.query(`ALTER TABLE \`${table}\` ADD COLUMN is_saisise TINYINT(1) NOT NULL DEFAULT 0`);
    }
    if (table === 'payments' || table === 'bons_comptant') {
      const mode = columns.find(column => column.COLUMN_NAME === 'mode_paiement');
      if (!mode) {
        await db.query(`ALTER TABLE \`${table}\` ADD COLUMN mode_paiement VARCHAR(30) NOT NULL DEFAULT 'Espèces'`);
      } else if (mode.COLUMN_TYPE.toLowerCase().startsWith('enum(') && !mode.COLUMN_TYPE.includes("'TPE'")) {
        // Keep all existing modes, including legacy values such as Carte.
        await db.query(`ALTER TABLE \`${table}\` MODIFY COLUMN mode_paiement VARCHAR(30) NOT NULL DEFAULT 'Espèces'`);
      }
    }
  }
}
