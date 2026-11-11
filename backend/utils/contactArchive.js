import pool from '../db/pool.js';
import { CONTACT_BALANCE_JOINS, TOTAL_CUMULE_EXPR } from './contactBalanceSql.js';

export async function ensureContactArchiveSchema(db = pool) {
  const [columns] = await db.query('SHOW COLUMNS FROM contacts');
  const existing = new Set(columns.map(({ Field }) => Field));
  for (const [column, type] of [
    ['archived_at', 'DATETIME'],
    ['archive_reason', 'VARCHAR(20)'],
    ['archive_reactivated_at', 'DATETIME'],
  ]) {
    if (existing.has(column)) continue;
    try {
      await db.query(`ALTER TABLE contacts ADD COLUMN ${column} ${type} NULL`);
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
}

const cutoff = 'DATE_SUB(NOW(), INTERVAL 3 MONTH)';
const recent = (...dates) => dates.map(date => `${date} >= ${cutoff}`).join(' OR ');
const recentDocuments = [
  ['bons_sortie', 'client_id'],
  ['bons_sortie', 'fournisseur_id'],
  ['bons_comptant', 'client_id'],
  ['bons_charge', 'client_id'],
  ['avoirs_charge', 'client_id'],
  ['bons_commande', 'fournisseur_id'],
  ['avoirs_client', 'client_id'],
  ['avoirs_client', 'fournisseur_id'],
  ['avoirs_fournisseur', 'fournisseur_id'],
].map(([table, owner]) => `
  NOT EXISTS (SELECT 1 FROM ${table} m WHERE m.${owner} = c.id
    AND (${recent('m.date_creation', 'm.created_at', 'm.updated_at')}))`).join(' AND ');

export async function archiveInactiveContacts(db = pool) {
  const [result] = await db.query(`
    UPDATE contacts target
    JOIN (
    -- Materialise the candidates in a fixed join order before updating contacts.
    SELECT DISTINCT STRAIGHT_JOIN c.id, c.updated_at
    FROM contacts c
    ${CONTACT_BALANCE_JOINS}
    WHERE c.deleted_at IS NULL
      AND c.archived_at IS NULL
      AND c.type IN ('Client', 'Fournisseur')
      AND COALESCE(c.is_charge, 0) = 0
      AND c.created_at < ${cutoff}
      AND (c.archive_reactivated_at IS NULL OR c.archive_reactivated_at < ${cutoff})
      AND (${TOTAL_CUMULE_EXPR}) = 0
      AND ${recentDocuments}
      AND NOT EXISTS (
        SELECT 1 FROM payments p WHERE p.contact_id = c.id
          AND (${recent('p.date_paiement', 'p.created_at', 'p.updated_at')}
            OR (p.date_echeance >= CURDATE() AND LOWER(COALESCE(p.statut, '')) NOT LIKE 'annul%'))
      )
      AND NOT EXISTS (
        SELECT 1 FROM bons_comptant bc WHERE bc.client_id = c.id AND bc.reste > 0
          AND LOWER(COALESCE(bc.statut, '')) NOT LIKE 'annul%'
          AND LOWER(COALESCE(bc.statut, '')) <> 'avoir'
      )
      AND NOT EXISTS (
        SELECT 1 FROM paiement_boncomptant_nonpaye p
        JOIN bons_comptant bc ON bc.id = p.bon_comptant_id
        WHERE bc.client_id = c.id AND (${recent('p.date_paiement', 'p.created_at', 'p.updated_at')})
      )
      AND NOT EXISTS (
        SELECT 1 FROM ecommerce_orders o WHERE o.user_id = c.id
          AND (${recent('o.created_at', 'o.updated_at')} OR o.status IN ('pending','confirmed','processing','shipped'))
      )
      AND NOT EXISTS (
        SELECT 1 FROM avoirs_ecommerce a JOIN ecommerce_orders o ON o.id = a.ecommerce_order_id
        WHERE o.user_id = c.id AND (${recent('a.date_creation', 'a.created_at', 'a.updated_at')})
      )
    ) eligible ON eligible.id = target.id
    SET target.archived_at = NOW(), target.archive_reason = 'inactivity'
    WHERE target.archived_at IS NULL AND target.deleted_at IS NULL
      AND (target.archive_reactivated_at IS NULL OR target.archive_reactivated_at < ${cutoff})
      AND target.updated_at <=> eligible.updated_at
  `);
  return result.affectedRows;
}

export function startContactArchiveWorker() {
  const run = () => archiveInactiveContacts().catch(error => {
    console.error('Archivage automatique des contacts :', error.message);
  });
  const firstRun = setTimeout(run, 30_000);
  firstRun.unref();
  const dailyRun = setInterval(run, 24 * 60 * 60 * 1000);
  dailyRun.unref();
}
