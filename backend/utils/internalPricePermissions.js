import pool from '../db/pool.js';

const allowedFlag = (value) => value === true || value === 1 || value === '1';

export function canViewInternalPrices(user) {
  if (!user || user.type_compte != null || !user.role) return false;
  if (user.role === 'PDG') return true;
  return allowedFlag(user.acces_prix_internes);
}

let schemaReady;
export function ensureInternalPricePermissionSchema(db = pool) {
  if (!schemaReady) {
    schemaReady = (async () => {
      const [columns] = await db.query("SHOW COLUMNS FROM employees LIKE 'acces_prix_internes'");
      if (columns.length) return;
      try {
        await db.query('ALTER TABLE employees ADD COLUMN acces_prix_internes TINYINT(1) NOT NULL DEFAULT 0');
        // Preserve existing access for roles that could already see internal prices.
        await db.query("UPDATE employees SET acces_prix_internes = 1 WHERE role NOT IN ('Employé', 'PDG') AND deleted_at IS NULL");
      } catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
      }
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}
