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
  if (!(await columnExists(db, 'payments', 'montant_ignorer'))) {
    await db.execute('ALTER TABLE payments ADD COLUMN montant_ignorer DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER montant_total');
  }
  if (!(await columnExists(db, 'payments', 'remise'))) {
    await db.execute('ALTER TABLE payments ADD COLUMN remise TINYINT(1) NOT NULL DEFAULT 0 AFTER montant_ignorer');
  }
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
       AND LOWER(COALESCE(bc.statut, '')) NOT LIKE 'annul%'
       AND LOWER(COALESCE(bc.statut, '')) <> 'avoir'
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
  const [remisePaymentRows] = await db.execute(
    `SELECT p.remise_account_id AS id,
            COALESCE(SUM(p.montant_total), 0) AS total
     FROM payments p
     WHERE p.mode_paiement = 'Remise'
       AND p.remise_account_id IN (${makeInClause(accountIds)})
       AND p.statut IN (${makeInClause(ACTIVE_REMISE_PAYMENT_STATUSES)})
     GROUP BY p.remise_account_id`,
    [...accountIds, ...ACTIVE_REMISE_PAYMENT_STATUSES]
  );
  const totals = mapTotals(remisePaymentRows);

  const [ignoredRemiseRows] = await db.execute(
    `SELECT cr.id AS id,
            COALESCE(SUM(p.montant_ignorer), 0) AS total
     FROM client_remises cr
     INNER JOIN payments p ON p.contact_id = cr.contact_id
     WHERE cr.id IN (${makeInClause(accountIds)})
       AND cr.type = 'client_abonne'
       AND cr.id = (
         SELECT MAX(cr2.id)
         FROM client_remises cr2
         WHERE cr2.contact_id = cr.contact_id
           AND cr2.type = 'client_abonne'
       )
       AND p.remise = 1
       AND p.mode_paiement <> 'Remise'
       AND p.statut IN (${makeInClause(ACTIVE_REMISE_PAYMENT_STATUSES)})
     GROUP BY cr.id`,
    [...accountIds, ...ACTIVE_REMISE_PAYMENT_STATUSES]
  );
  mergeAccountTotal(totals, mapTotals(ignoredRemiseRows), (accountId) => accountId);
  return totals;
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
    const accountId = Number(account.id);
    if (
      account.type === 'client_abonne' &&
      Number.isFinite(contactId) &&
      contactId > 0 &&
      (!accountIdByContactId.has(contactId) || accountId > accountIdByContactId.get(contactId))
    ) {
      accountIdByContactId.set(contactId, accountId);
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

// ── Direct contact remise (no client_remises entry) ─────────────────────────

const DIRECT_BON_AMOUNT_EXPR = `COALESCE(SUM(
  CASE
    WHEN COALESCE(items.remise_montant, 0) <> 0
      THEN COALESCE(items.quantite, 0) * COALESCE(items.remise_montant, 0)
    WHEN COALESCE(items.remise_pourcentage, 0) <> 0
      THEN COALESCE(items.quantite, 0) * COALESCE(items.prix_unitaire, 0) * COALESCE(items.remise_pourcentage, 0) / 100
    ELSE 0
  END
), 0)`;

async function getDirectBonEarnedAll(db) {
  const [sortieRows] = await db.execute(
    `SELECT bs.client_id AS id, ${DIRECT_BON_AMOUNT_EXPR} AS total
     FROM bons_sortie bs
     INNER JOIN sortie_items items ON items.bon_sortie_id = bs.id
     WHERE (COALESCE(bs.remise_is_client, 1) = 1 OR bs.remise_id IS NULL) AND bs.client_id IS NOT NULL
     GROUP BY bs.client_id`
  );
  const [comptantRows] = await db.execute(
    `SELECT bc.client_id AS id, ${DIRECT_BON_AMOUNT_EXPR} AS total
     FROM bons_comptant bc
     INNER JOIN comptant_items items ON items.bon_comptant_id = bc.id
     WHERE (COALESCE(bc.remise_is_client, 1) = 1 OR bc.remise_id IS NULL) AND bc.client_id IS NOT NULL
       AND LOWER(COALESCE(bc.statut, '')) NOT LIKE 'annul%'
       AND LOWER(COALESCE(bc.statut, '')) <> 'avoir'
     GROUP BY bc.client_id`
  );
  const map = new Map();
  for (const r of [...sortieRows, ...comptantRows]) {
    const id = Number(r.id);
    if (Number.isFinite(id)) map.set(id, (map.get(id) || 0) + Number(r.total || 0));
  }
  return map;
}

async function getUsedByContactDirect(db, contactIds) {
  if (!contactIds.length) return new Map();
  const [rows] = await db.execute(
    `SELECT p.contact_id AS id,
            COALESCE(SUM(
              CASE
                WHEN p.mode_paiement = 'Remise' AND p.remise_account_id IS NULL
                  THEN p.montant_total
                WHEN p.remise = 1
                  AND p.mode_paiement <> 'Remise'
                  AND NOT EXISTS (
                    SELECT 1
                    FROM client_remises cr
                    WHERE cr.contact_id = p.contact_id
                      AND cr.type = 'client_abonne'
                  )
                  THEN p.montant_ignorer
                ELSE 0
              END
            ), 0) AS total
     FROM payments p
     WHERE p.contact_id IN (${makeInClause(contactIds)})
       AND p.statut IN (${makeInClause(ACTIVE_REMISE_PAYMENT_STATUSES)})
       AND (
         (p.mode_paiement = 'Remise' AND p.remise_account_id IS NULL)
         OR (
           p.remise = 1
           AND p.mode_paiement <> 'Remise'
           AND NOT EXISTS (
             SELECT 1
             FROM client_remises cr
             WHERE cr.contact_id = p.contact_id
               AND cr.type = 'client_abonne'
           )
         )
       )
     GROUP BY p.contact_id`,
    [...contactIds, ...ACTIVE_REMISE_PAYMENT_STATUSES]
  );
  return mapTotals(rows);
}

async function getDirectOldEarnedAll(db) {
  try {
    const [rows] = await db.execute(`
      SELECT contact_id AS id, COALESCE(SUM(qte * prix_remise), 0) AS total
      FROM ancien_remises_abonne
      WHERE COALESCE(statut, '') NOT LIKE 'Annul%'
      GROUP BY contact_id
    `);
    const map = new Map();
    for (const r of rows) {
      const id = Number(r.id);
      if (Number.isFinite(id)) map.set(id, Number(r.total || 0));
    }
    return map;
  } catch (e) {
    return new Map();
  }
}

async function getRemiseContactItemsTotalAll(db) {
  try {
    const [rows] = await db.execute(`
      SELECT contact_id AS id, COALESCE(SUM(qte * prix_remise), 0) AS total
      FROM remise_contact_items
      WHERE statut <> 'Annulé'
      GROUP BY contact_id
    `);
    const map = new Map();
    for (const r of rows) {
      const id = Number(r.id);
      if (Number.isFinite(id)) map.set(id, Number(r.total || 0));
    }
    return map;
  } catch {
    return new Map();
  }
}

export async function getDirectContactRemiseBalances(db = pool) {
  await ensurePaymentRemiseColumns(db);
  const earnedMap = await getDirectBonEarnedAll(db);
  const oldEarnedMap = await getDirectOldEarnedAll(db);
  const separeeMap = await getRemiseContactItemsTotalAll(db);

  const contactIdsSet = new Set([...earnedMap.keys(), ...oldEarnedMap.keys(), ...separeeMap.keys()]);
  const contactIds = [...contactIdsSet];
  if (!contactIds.length) return [];

  const usedMap = await getUsedByContactDirect(db, contactIds);

  const [contacts] = await db.execute(
    `SELECT id, nom_complet, societe, telephone
     FROM contacts WHERE id IN (${makeInClause(contactIds)})`,
    contactIds
  );

  return contacts.map((c) => {
    const cId = Number(c.id);
    const earnedBons = (earnedMap.get(cId) || 0) + (oldEarnedMap.get(cId) || 0);
    const separee = separeeMap.get(cId) || 0;
    const earned = earnedBons + separee;
    const used = usedMap.get(cId) || 0;
    const available = Math.max(0, earned - used);
    return {
      contact_id: cId,
      nom_complet: c.nom_complet,
      societe: c.societe,
      telephone: c.telephone,
      earned_bons_total: Math.round(earnedBons * 100) / 100,
      earned_separee_total: Math.round(separee * 100) / 100,
      earned_total: Math.round(earned * 100) / 100,
      used_total: Math.round(used * 100) / 100,
      available_total: Math.round(available * 100) / 100,
    };
  });
}

export async function getDirectContactRemiseInfo(db, contactId) {
  await ensurePaymentRemiseColumns(db);
  const numId = Number(contactId);
  if (!Number.isFinite(numId) || numId <= 0) throw Object.assign(new Error('Contact invalide'), { statusCode: 400 });

  const [sortieRows] = await db.execute(
    `SELECT ${DIRECT_BON_AMOUNT_EXPR} AS total
     FROM bons_sortie bs
     INNER JOIN sortie_items items ON items.bon_sortie_id = bs.id
     WHERE (COALESCE(bs.remise_is_client, 1) = 1 OR bs.remise_id IS NULL) AND bs.client_id = ?`,
    [numId]
  );
  const [comptantRows] = await db.execute(
    `SELECT ${DIRECT_BON_AMOUNT_EXPR} AS total
     FROM bons_comptant bc
     INNER JOIN comptant_items items ON items.bon_comptant_id = bc.id
     WHERE (COALESCE(bc.remise_is_client, 1) = 1 OR bc.remise_id IS NULL) AND bc.client_id = ?
       AND LOWER(COALESCE(bc.statut, '')) NOT LIKE 'annul%'
       AND LOWER(COALESCE(bc.statut, '')) <> 'avoir'`,
    [numId]
  );
  let oldEarned = 0;
  try {
    const [oldRows] = await db.execute(
      `SELECT COALESCE(SUM(qte * prix_remise), 0) AS total
       FROM ancien_remises_abonne
       WHERE contact_id = ? AND COALESCE(statut, '') NOT LIKE 'Annul%'`,
      [numId]
    );
    oldEarned = Number(oldRows[0]?.total || 0);
  } catch {
    oldEarned = 0;
  }

  let separateEarned = 0;
  try {
    const [separateRows] = await db.execute(
      `SELECT COALESCE(SUM(qte * prix_remise), 0) AS total
       FROM remise_contact_items
       WHERE contact_id = ? AND statut <> 'Annulé'`,
      [numId]
    );
    separateEarned = Number(separateRows[0]?.total || 0);
  } catch {
    separateEarned = 0;
  }

  const earned = Math.max(0, Number(sortieRows[0]?.total || 0) + Number(comptantRows[0]?.total || 0) + oldEarned + separateEarned);

  const usedMap = await getUsedByContactDirect(db, [numId]);
  const used = usedMap.get(numId) || 0;

  const [contacts] = await db.execute('SELECT nom_complet FROM contacts WHERE id = ? LIMIT 1', [numId]);
  if (!contacts.length) throw Object.assign(new Error('Contact introuvable'), { statusCode: 404 });

  return {
    contact_id: numId,
    nom_complet: contacts[0].nom_complet,
    earned_total: Math.round(earned * 100) / 100,
    used_total: Math.round(used * 100) / 100,
    available: Math.max(0, Math.round((earned - used) * 100) / 100),
  };
}
