import pool from '../db/pool.js';
import { normalizePermissionFlag } from './clientCollaborationPermissions.js';

/**
 * Autorisations de la page Charges.
 *  - view  : ouvrir la page Charges ;
 *  - fixed : ajouter, modifier et supprimer les charges fixes (exige view).
 * Le PDG a toujours tout ; un compte client n'a rien.
 */
export const CHARGE_PAGE_COLUMNS = Object.freeze({
  view: 'acces_page_charges',
  fixed: 'acces_charges_fixes',
});

export function normalizeChargePermissions(user) {
  const employee = Boolean(user?.role) && user?.type_compte == null;
  const flags = Object.fromEntries(Object.entries(CHARGE_PAGE_COLUMNS).map(([key, column]) => [
    key,
    employee && (user.role === 'PDG' || normalizePermissionFlag(user[column])),
  ]));
  flags.fixed &&= flags.view;
  return flags;
}

export function requireChargePermission(permission) {
  return (req, res, next) => {
    if (normalizeChargePermissions(req.user)[permission]) return next();
    return res.status(403).json({ message: 'Accès aux charges non autorisé.', permission });
  };
}

let schemaReady;
export function ensureChargePermissionSchema(db = pool) {
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const column of Object.values(CHARGE_PAGE_COLUMNS)) {
        const [columns] = await db.query('SHOW COLUMNS FROM employees LIKE ?', [column]);
        if (columns.length) continue;
        try {
          await db.query(`ALTER TABLE employees ADD COLUMN ${column} TINYINT(1) NOT NULL DEFAULT 0`);
        } catch (error) {
          if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
        }
      }
    })().catch((error) => { schemaReady = null; throw error; });
  }
  return schemaReady;
}
