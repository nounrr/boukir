import pool from '../db/pool.js';

export async function ensureComptantPaymentCompletionSchema(db = pool) {
  for (const [column, definition] of [['reglement_complete_par', 'INT NULL'], ['reglement_complete_le', 'DATETIME NULL']]) {
    const [rows] = await db.query('SHOW COLUMNS FROM bons_comptant LIKE ?', [column]);
    if (!rows.length) {
      try { await db.query(`ALTER TABLE bons_comptant ADD COLUMN ${column} ${definition}`); }
      catch (error) { if (error.code !== 'ER_DUP_FIELDNAME') throw error; }
    }
  }
}

export async function trackComptantPaymentCompletion(db, bonId, reste, montantTotal, actorId) {
  if (reste > 0 || Number(montantTotal) <= 0) {
    await db.execute('UPDATE bons_comptant SET reglement_complete_par = NULL, reglement_complete_le = NULL WHERE id = ?', [bonId]);
  } else if (Number.isSafeInteger(Number(actorId)) && Number(actorId) > 0) {
    // Keep the author of this settlement until the balance is reopened.
    await db.execute(`UPDATE bons_comptant SET reglement_complete_par = ?, reglement_complete_le = NOW()
      WHERE id = ? AND reglement_complete_par IS NULL`, [Number(actorId), bonId]);
  }
}
