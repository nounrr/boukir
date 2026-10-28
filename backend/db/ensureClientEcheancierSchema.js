import { getClientCreditState } from '../utils/bonExceptionAuthorization.js';
import pool from './pool.js';

export async function ensureClientEcheancierSchema(db = pool) {
  const [columns] = await db.query("SHOW COLUMNS FROM contacts LIKE 'plafond_echeance'");
  if (!columns.length) await db.query('ALTER TABLE contacts ADD COLUMN plafond_echeance DECIMAL(15,2) NULL DEFAULT NULL');
  const [references] = await db.query("SHOW COLUMNS FROM contacts LIKE 'plafond_echeance_reference'");
  if (!references.length) await db.query('ALTER TABLE contacts ADD COLUMN plafond_echeance_reference DECIMAL(15,2) NULL DEFAULT NULL');
  // Freeze existing automatic ceilings before any new sales/payments are accepted.
  const [clients] = await db.query("SELECT id FROM contacts WHERE type = 'Client' AND deleted_at IS NULL AND plafond_echeance = 0 AND plafond_echeance_reference IS NULL");
  for (const client of clients) await getClientCreditState(db, client.id, { lock: false });
}
