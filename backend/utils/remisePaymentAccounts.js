import pool from '../db/pool.js';

const ACTIVE_REMISE_PAYMENT_STATUSES = ['En attente', 'Validé'];

async function columnExists(db, tableName, columnName) {
  const [rows] = await db.execute(
    `SELECT 1
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

function makeInClause(values) {
  return values.map(() => '?').join(', ');
}

function mapTotals(rows, keyField = 'id') {
  const totals = new Map();
  for (const row of rows || []) {
    const key = Number(row?.[keyField]);
    if (!Number.isFinite(key)) continue;
    totals.set(key, Number(row?.total || 0));
  }
  return totals;
}

function mergeAccountTotal(targetMap, sourceMap, resolver) {
  for (const [key, total] of sourceMap.entries()) {
    const accountId = resolver(key);
    if (!Number.isFinite(accountId)) continue;
    targetMap.set(accountId, Number(targetMap.get(accountId) || 0) + Number(total || 0));
  }
}

export async function ensurePaymentRemiseColumns(db = pool) {
  if (!(await columnExists(db, 'payments', 'remise_account_id'))) {
    await db.execute('ALTER TABLE payments ADD COLUMN remise_account_id INT NULL AFTER contact_id');
  }
  if (!(await columnExists(db, 'payments', 'remise_account_type'))) {
    await db.execute('ALTER TABLE payments ADD COLUMN remise_account_type VARCHAR(32) NULL AFTER remise_account_id');
  }
  if (!(await columnExists(db, 'payments', 'remise_account_name'))) {
    await db.execute('ALTER TABLE payments ADD COLUMN remise_account_name VARCHAR(255) NULL AFTER remise_account_type');
  }
}

async function getOldRemiseTotals(db, accountIds) {
  if (!accountIds.length) return new Map();
  const [rows] = await db.execute(
    `SELECT ir.client_remise_id AS id,
            COALESCE(SUM(ir.qte * ir.prix_remise), 0) AS total
     FROM item_remises ir
     WHERE ir.client_remise_id IN (${makeInClause(accountIds)})
       AND ir.statut <> 'Annulé'
     GROUP BY ir.client_remise_id`,
    accountIds
  );
  return mapTotals(rows);
}

async function getAssignedBonRemiseTotals(db, accountIds) {
  const totals = new Map();
  if (!accountIds.length) return totals;

  const params = [...accountIds];
  const inClause = makeInClause(accountIds);
  const amountExpr = `COALESCE(SUM(
    CASE
      WHEN COALESCE(items.remise_montant, 0) <> 0 THEN COALESCE(items.quantite, 0) * COALESCE(items.remise_montant, 0)
      WHEN COALESCE(items.remise_pourcentage, 0) <> 0 THEN COALESCE(items.quantite, 0) * COALESCE(items.prix_unitaire, 0) * COALESCE(items.remise_pourcentage, 0) / 100
      ELSE 0
    END
  ), 0)`;

  const [sortieRows] = await db.execute(
    `SELECT bs.remise_id AS id, ${amountExpr} AS total
     FROM bons_sortie bs
     INNER JOIN sortie_items items ON items.bon_sortie_id = bs.id
     WHERE COALESCE(bs.remise_is_client, 1) = 0
       AND bs.remise_id IN (${inClause})
     GROUP BY bs.remise_id`,
    params
  );

  const [comptantRows] = await db.execute(
    `SELECT bc.remise_id AS id, ${amountExpr} AS total
     FROM bons_comptant bc
     INNER JOIN comptant_items items ON items.bon_comptant_id = bc.id
     WHERE COALESCE(bc.remise_is_client, 1) = 0
       AND bc.remise_id IN (${inClause})
     GROUP BY bc.remise_id`,
    params
  );

  mergeAccountTotal(totals, mapTotals(sortieRows), (key) => key);
  mergeAccountTotal(totals, mapTotals(comptantRows), (key) => key);
  return totals;
}

async function getDirectBonRemiseTotalsByContact(db, contactIds) {
  const totals = new Map();
  if (!contactIds.length) return totals;

  const params = [...contactIds];
  const inClause = makeInClause(contactIds);
  const amountExpr = `COALESCE(SUM(
    CASE
      WHEN COALESCE(items.remise_montant, 0) <> 0 THEN COALESCE(items.quantite, 0) * COALESCE(items.remise_montant, 0)
      WHEN COALESCE(items.remise_pourcentage, 0) <> 0 THEN COALESCE(items.quantite, 0) * COALESCE(items.prix_unitaire, 0) * COALESCE(items.remise_pourcentage, 0) / 100
      ELSE 0
    END
  ), 0)`;

  const [sortieRows] = await db.execute(
    `SELECT bs.client_id AS id, ${amountExpr} AS total
     FROM bons_sortie bs
     INNER JOIN sortie_items items ON items.bon_sortie_id = bs.id
     WHERE (COALESCE(bs.remise_is_client, 1) = 1 OR bs.remise_id IS NULL)
       AND bs.client_id IN (${inClause})
     GROUP BY bs.client_id`,
    params
  );

  const [comptantRows] = await db.execute(
    `SELECT bc.client_id AS id, ${amountExpr} AS total
     FROM bons_comptant bc
     INNER JOIN comptant_items items ON items.bon_comptant_id = bc.id
     WHERE (COALESCE(bc.remise_is_client, 1) = 1 OR bc.remise_id IS NULL)
       AND bc.client_id IN (${inClause})
     GROUP BY bc.client_id`,
    params
  );

  mergeAccountTotal(totals, mapTotals(sortieRows), (key) => key);
  mergeAccountTotal(totals, mapTotals(comptantRows), (key) => key);
  return totals;
}

async function getEcommerceEarnedTotalsByContact(db, contactIds) {
  if (!contactIds.length) return new Map();
  const [rows] = await db.execute(
    `SELECT o.user_id AS id,
            COALESCE(SUM(o.remise_earned_amount), 0) AS total
     FROM ecommerce_orders o
     WHERE o.user_id IN (${makeInClause(contactIds)})
     GROUP BY o.user_id`,
    contactIds
  );
  return mapTotals(rows);
}

async function getUsedRemiseTotals(db, accountIds) {
  if (!accountIds.length) return new Map();
  const [rows] = await db.execute(
    `SELECT p.remise_account_id AS id,
            COALESCE(SUM(p.montant_total), 0) AS total
     FROM payments p
     WHERE p.mode_paiement = 'Remise'
       AND p.remise_account_id IN (${makeInClause(accountIds)})
       AND p.statut IN (${makeInClause(ACTIVE_REMISE_PAYMENT_STATUSES)})
     GROUP BY p.remise_account_id`,
    [...accountIds, ...ACTIVE_REMISE_PAYMENT_STATUSES]
  );
  return mapTotals(rows);
}

export async function getRemisePaymentAccounts(db = pool, options = {}) {
  const { ids, onlyAvailable = false, types, contactIds: filterContactIds } = options;

  await ensurePaymentRemiseColumns(db);

  const where = [];
  const params = [];

  if (Array.isArray(ids) && ids.length) {
    where.push(`cr.id IN (${makeInClause(ids)})`);
    params.push(...ids);
  }

  if (Array.isArray(types) && types.length) {
    where.push(`cr.type IN (${makeInClause(types)})`);
    params.push(...types);
  }

  if (Array.isArray(filterContactIds) && filterContactIds.length) {
    where.push(`cr.contact_id IN (${makeInClause(filterContactIds)})`);
    params.push(...filterContactIds);
  }

  const [accounts] = await db.execute(
    `SELECT cr.id,
            cr.nom,
            cr.phone,
            cr.cin,
            cr.note,
            cr.type,
            cr.contact_id,
            cr.created_at,
            cr.updated_at,
            c.nom_complet AS contact_nom,
            c.societe AS contact_societe,
            c.telephone AS contact_phone
     FROM client_remises cr
     LEFT JOIN contacts c ON c.id = cr.contact_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY cr.nom ASC, cr.id DESC`,
    params
  );

  if (!accounts.length) return [];

  const accountIds = accounts.map((row) => Number(row.id)).filter(Number.isFinite);
  const accountContactIds = accounts
    .map((row) => Number(row.contact_id))
    .filter((value) => Number.isFinite(value) && value > 0);

  const oldTotals = await getOldRemiseTotals(db, accountIds);
  const assignedBonTotals = await getAssignedBonRemiseTotals(db, accountIds);
  const directBonTotalsByContact = await getDirectBonRemiseTotalsByContact(db, accountContactIds);
  const ecommerceTotalsByContact = await getEcommerceEarnedTotalsByContact(db, accountContactIds);
  const usedTotals = await getUsedRemiseTotals(db, accountIds);

  const accountIdByContactId = new Map();
  for (const account of accounts) {
    const contactId = Number(account.contact_id);
    if (Number.isFinite(contactId) && contactId > 0) {
      accountIdByContactId.set(contactId, Number(account.id));
    }
  }

  const directBonTotals = new Map();
  mergeAccountTotal(directBonTotals, directBonTotalsByContact, (contactId) => accountIdByContactId.get(contactId));

  const ecommerceTotals = new Map();
  mergeAccountTotal(ecommerceTotals, ecommerceTotalsByContact, (contactId) => accountIdByContactId.get(contactId));

  const result = accounts.map((account) => {
    const accountId = Number(account.id);
    const oldTotal = Math.max(0, Number(oldTotals.get(accountId) || 0));
    const assignedBonTotal = Math.max(0, Number(assignedBonTotals.get(accountId) || 0));
    const directBonTotal = Math.max(0, Number(directBonTotals.get(accountId) || 0));
    const ecommerceTotal = Math.max(0, Number(ecommerceTotals.get(accountId) || 0));
    const usedTotal = Number(usedTotals.get(accountId) || 0);

    const earnedBonTotal = directBonTotal + assignedBonTotal;
    const earnedEcommerceTotal = ecommerceTotal;
    const earnedTotal = Math.max(0, oldTotal + earnedBonTotal + earnedEcommerceTotal);
    const availableTotal = Math.max(0, earnedTotal - usedTotal);

    return {
      ...account,
      earned_old_total: Math.round(oldTotal * 100) / 100,
      earned_bon_total: Math.round(earnedBonTotal * 100) / 100,
      earned_ecommerce_total: Math.round(earnedEcommerceTotal * 100) / 100,
      earned_total: Math.round(earnedTotal * 100) / 100,
      used_total: Math.round(usedTotal * 100) / 100,
      available_total: Math.round(availableTotal * 100) / 100,
    };
  });

  return onlyAvailable ? result.filter((row) => Number(row.available_total || 0) > 0) : result;
}
