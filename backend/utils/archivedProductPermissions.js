import pool from '../db/pool.js';
import { normalizePermissionFlag } from './clientCollaborationPermissions.js';

export function canAccessArchivedProducts(user) {
  if (!user?.role || user.type_compte != null) return false;
  return user.role === 'PDG' || normalizePermissionFlag(user.acces_produits_archives);
}

let ensured;
export async function ensureArchivedProductPermissionSchema(db = pool) {
  if (!ensured) ensured = (async () => {
    const [columns] = await db.query("SHOW COLUMNS FROM employees LIKE 'acces_produits_archives'");
    if (!columns.length) {
      try {
        await db.query('ALTER TABLE employees ADD COLUMN acces_produits_archives TINYINT(1) NOT NULL DEFAULT 0');
      } catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
      }
    }
  })().catch((error) => { ensured = undefined; throw error; });
  return ensured;
}

export async function loadArchivedProductsAccess(user, db = pool) {
  if (!user?.role || user.type_compte != null) return false;
  await ensureArchivedProductPermissionSchema(db);
  const [rows] = await db.query(
    'SELECT role, acces_produits_archives FROM employees WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [user.id]
  );
  return canAccessArchivedProducts(rows[0]);
}

export async function requireArchivedProductsAccess(req, res, next) {
  try {
    if (!(await loadArchivedProductsAccess(req.user))) {
      return res.status(403).json({ message: 'Accès aux produits archivés non autorisé.' });
    }
    return next();
  } catch (error) { return next(error); }
}
