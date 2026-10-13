import pool from '../db/pool.js';
import { normalizePermissionFlag } from './clientCollaborationPermissions.js';

export const EMPLOYEE_PAGE_COLUMNS = Object.freeze({
  view: 'acces_page_employes',
  documents: 'acces_documents_employes',
  salaries: 'acces_salaires_employes',
  salary_details: 'acces_details_salaires_employes',
  archives: 'acces_archives_employes',
});

export function normalizeEmployeePagePermissions(user) {
  const employee = Boolean(user?.role) && user?.type_compte == null;
  const flags = Object.fromEntries(Object.entries(EMPLOYEE_PAGE_COLUMNS).map(([key, column]) => [
    key,
    employee && (user.role === 'PDG' || (user[column] == null
      ? user.role === 'ManagerPlus' && ['view', 'salaries'].includes(key)
      : normalizePermissionFlag(user[column]))),
  ]));
  for (const key of ['documents', 'salaries', 'archives']) flags[key] &&= flags.view;
  flags.salary_details &&= flags.salaries;
  return flags;
}

export function canReadOwnEmployeeRecord(user, targetId) {
  return Boolean(user?.role) && user?.type_compte == null && Number(targetId) > 0
    && Number(user.id) === Number(targetId);
}

export function requireEmployeePagePermission(permission, selfParam) {
  return (req, res, next) => {
    if (normalizeEmployeePagePermissions(req.user)[permission]
      || (selfParam && canReadOwnEmployeeRecord(req.user, req.params[selfParam]))) return next();
    return res.status(403).json({ message: 'Accès aux données des employés non autorisé.', permission });
  };
}

let schemaReady;
export function ensureEmployeePagePermissionSchema(db = pool) {
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const column of Object.values(EMPLOYEE_PAGE_COLUMNS)) {
        const [columns] = await db.query('SHOW COLUMNS FROM employees LIKE ?', [column]);
        if (columns.length) continue;
        try {
          // NULL preserves former ManagerPlus access until the PDG explicitly changes it.
          await db.query(`ALTER TABLE employees ADD COLUMN ${column} TINYINT(1) NULL DEFAULT NULL`);
        } catch (error) {
          if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
        }
      }
    })().catch((error) => { schemaReady = null; throw error; });
  }
  return schemaReady;
}
