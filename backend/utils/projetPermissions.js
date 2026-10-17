import pool from '../db/pool.js';
import { normalizePermissionFlag } from './clientCollaborationPermissions.js';

export function canAccessProjets(user) {
  if (!user?.role || user.type_compte != null) return false;
  return user.role === 'PDG' || normalizePermissionFlag(user.acces_projets);
}

let ensured;
export async function ensureProjetPermissionSchema(db = pool) {
  if (!ensured) ensured = (async () => {
    const [columns] = await db.query("SHOW COLUMNS FROM employees LIKE 'acces_projets'");
    if (!columns.length) {
      try { await db.query('ALTER TABLE employees ADD COLUMN acces_projets TINYINT(1) NOT NULL DEFAULT 0'); }
      catch (error) { if (error.code !== 'ER_DUP_FIELDNAME') throw error; }
    }
  })().catch((error) => { ensured = undefined; throw error; });
  return ensured;
}

export async function loadProjetAccess(user, db = pool) {
  if (!user?.role || user.type_compte != null) return false;
  await ensureProjetPermissionSchema(db);
  const [rows] = await db.query('SELECT role, acces_projets FROM employees WHERE id = ? AND deleted_at IS NULL LIMIT 1', [user.id]);
  return canAccessProjets(rows[0]);
}

export async function requireProjetAccess(req, res, next) {
  try {
    if (!(await loadProjetAccess(req.user))) return res.status(403).json({ message: 'Accès à la page Projets non autorisé.' });
    return next();
  } catch (error) { return next(error); }
}
