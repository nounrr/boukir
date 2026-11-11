import pool from '../db/pool.js';
import { normalizePermissionFlag } from './clientCollaborationPermissions.js';

export const COMPTANT_PAYMENT_VERIFICATION_COLUMN = 'acces_verification_reglements_comptant';

let schemaReady;
export function ensureComptantPaymentVerificationPermissionSchema(db = pool) {
  if (!schemaReady) {
    schemaReady = (async () => {
      const [columns] = await db.query('SHOW COLUMNS FROM employees WHERE Field = ?', [COMPTANT_PAYMENT_VERIFICATION_COLUMN]);
      if (columns.length) return;
      try {
        await db.query(`ALTER TABLE employees ADD COLUMN ${COMPTANT_PAYMENT_VERIFICATION_COLUMN} TINYINT(1) NOT NULL DEFAULT 0`);
      } catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
      }
    })().catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  return schemaReady;
}

export async function loadComptantPaymentVerificationAccess(user) {
  if (!user?.role || user.type_compte != null) return false;
  await ensureComptantPaymentVerificationPermissionSchema();
  const [[employee]] = await pool.execute(
    `SELECT role, ${COMPTANT_PAYMENT_VERIFICATION_COLUMN}
     FROM employees WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [user.id]
  );
  return employee?.role === 'PDG' || normalizePermissionFlag(employee?.[COMPTANT_PAYMENT_VERIFICATION_COLUMN]);
}
