import express from 'express';
import pool from '../db/pool.js';

const router = express.Router();

const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

const parseDateRange = (req) => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dateFrom = isIsoDate(req.query?.dateFrom) ? String(req.query.dateFrom) : today;
  const dateTo = isIsoDate(req.query?.dateTo) ? String(req.query.dateTo) : dateFrom;
  return dateFrom <= dateTo ? { dateFrom, dateTo } : { dateFrom: dateTo, dateTo: dateFrom };
};

const toNumber = (value) => Number(value || 0);
const netAmountSql = (amountExpr, ignoredAmountExpr) =>
  `GREATEST(COALESCE(${amountExpr}, 0) - COALESCE(${ignoredAmountExpr}, 0), 0)`;
const bonComptantPaymentNetSql = (paymentAlias = 'p', bonAlias = 'bc') => `
  CASE
    WHEN NOT EXISTS (
      SELECT 1
        FROM paiement_boncomptant_nonpaye pbcnp_next
       WHERE pbcnp_next.bon_comptant_id = ${paymentAlias}.bon_comptant_id
         AND (
           pbcnp_next.date_paiement > ${paymentAlias}.date_paiement
           OR (
             pbcnp_next.date_paiement = ${paymentAlias}.date_paiement
             AND pbcnp_next.id > ${paymentAlias}.id
           )
         )
    )
      THEN GREATEST(COALESCE(${paymentAlias}.montant, 0) - COALESCE(${bonAlias}.montant_ignorer, 0), 0)
    ELSE COALESCE(${paymentAlias}.montant, 0)
  END
`;
const afterLatestCaisseStartSql = (dateTimeExpr) => `
            AND (
              NOT EXISTS (
                SELECT 1
                  FROM fond_caisse_entries fci_start
                 WHERE fci_start.jour = DATE(${dateTimeExpr})
                   AND fci_start.entry_type = 'caisse_initial'
              )
              OR ${dateTimeExpr} >= (
                SELECT fci_start.opened_at
                  FROM fond_caisse_entries fci_start
                 WHERE fci_start.jour = DATE(${dateTimeExpr})
                   AND fci_start.entry_type = 'caisse_initial'
                 ORDER BY fci_start.opened_at DESC, fci_start.id DESC
                 LIMIT 1
              )
            )
            AND (
              NOT EXISTS (
                SELECT 1
                  FROM coffre cof_start
                 WHERE cof_start.jour = DATE(${dateTimeExpr})
                   AND cof_start.entry_type = 'coffre_initial'
              )
              OR ${dateTimeExpr} >= (
                SELECT cof_start.opened_at
                  FROM coffre cof_start
                 WHERE cof_start.jour = DATE(${dateTimeExpr})
                   AND cof_start.entry_type = 'coffre_initial'
                 ORDER BY cof_start.opened_at DESC, cof_start.id DESC
                 LIMIT 1
              )
            )`;
const afterLatestCoffreStartSql = (dateTimeExpr) => `
            AND (
              NOT EXISTS (
                SELECT 1
                  FROM coffre cof_start
                 WHERE cof_start.jour = DATE(${dateTimeExpr})
                   AND cof_start.entry_type = 'coffre_initial'
              )
              OR ${dateTimeExpr} >= (
                SELECT cof_start.opened_at
                  FROM coffre cof_start
                 WHERE cof_start.jour = DATE(${dateTimeExpr})
                   AND cof_start.entry_type = 'coffre_initial'
                 ORDER BY cof_start.opened_at DESC, cof_start.id DESC
                 LIMIT 1
              )
            )`;

const emptyMovementRows = [];
const FOND_CAISSE_START_DATE = '2000-01-01';

async function ensureFondCaisseEntriesTable(db = pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS fond_caisse_entries (
      id INT NOT NULL AUTO_INCREMENT,
      montant DECIMAL(12,2) NOT NULL DEFAULT 0,
      entry_type VARCHAR(50) NOT NULL DEFAULT 'caisse_initial',
      note VARCHAR(255) NULL,
      mode_paiement VARCHAR(30) NOT NULL DEFAULT 'Espece',
      opened_at DATETIME NOT NULL,
      jour DATE NOT NULL,
      created_by INT NULL,
      created_by_name VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_fond_caisse_entries_jour (jour),
      KEY idx_fond_caisse_entries_created_by (created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  try {
    const [typeCols] = await db.query("SHOW COLUMNS FROM fond_caisse_entries LIKE 'entry_type'");
    if (!Array.isArray(typeCols) || typeCols.length === 0) {
      await db.query("ALTER TABLE fond_caisse_entries ADD COLUMN entry_type VARCHAR(50) NOT NULL DEFAULT 'caisse_initial' AFTER montant");
    }
  } catch (error) {
    console.error('ensureFondCaisseEntriesTable entry_type:', error);
  }

  try {
    const [noteCols] = await db.query("SHOW COLUMNS FROM fond_caisse_entries LIKE 'note'");
    if (!Array.isArray(noteCols) || noteCols.length === 0) {
      await db.query("ALTER TABLE fond_caisse_entries ADD COLUMN note VARCHAR(255) NULL AFTER entry_type");
    }
  } catch (error) {
    console.error('ensureFondCaisseEntriesTable note:', error);
  }

  try {
    const [modeCols] = await db.query("SHOW COLUMNS FROM fond_caisse_entries LIKE 'mode_paiement'");
    if (!Array.isArray(modeCols) || modeCols.length === 0) {
      await db.query("ALTER TABLE fond_caisse_entries ADD COLUMN mode_paiement VARCHAR(30) NOT NULL DEFAULT 'Espece' AFTER note");
    }
  } catch (error) {
    console.error('ensureFondCaisseEntriesTable mode_paiement:', error);
  }
}

async function ensureCoffreTable(db = pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS coffre (
      id INT NOT NULL AUTO_INCREMENT,
      montant DECIMAL(12,2) NOT NULL DEFAULT 0,
      entry_type VARCHAR(50) NOT NULL DEFAULT 'coffre_initial',
      note VARCHAR(255) NULL,
      mode_paiement VARCHAR(30) NOT NULL DEFAULT 'Espece',
      opened_at DATETIME NOT NULL,
      jour DATE NOT NULL,
      fond_caisse_entry_id INT NULL,
      created_by INT NULL,
      created_by_name VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_coffre_fond_caisse_entry_id (fond_caisse_entry_id),
      KEY idx_coffre_jour (jour),
      KEY idx_coffre_entry_type_jour (entry_type, jour),
      KEY idx_coffre_created_by (created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  try {
    const [modeCols] = await db.query("SHOW COLUMNS FROM coffre LIKE 'mode_paiement'");
    if (!Array.isArray(modeCols) || modeCols.length === 0) {
      await db.query("ALTER TABLE coffre ADD COLUMN mode_paiement VARCHAR(30) NOT NULL DEFAULT 'Espece' AFTER note");
    }
  } catch (error) {
    console.error('ensureCoffreTable mode_paiement:', error);
  }
}

async function ensureMontantIgnorerColumns(db = pool) {
  try {
    const [paymentCols] = await db.query("SHOW COLUMNS FROM payments LIKE 'montant_ignorer'");
    if (!Array.isArray(paymentCols) || paymentCols.length === 0) {
      await db.query("ALTER TABLE payments ADD COLUMN montant_ignorer DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER montant_total");
    }
  } catch (error) {
    if (error?.code !== 'ER_NO_SUCH_TABLE') {
      console.error('ensureMontantIgnorerColumns payments:', error);
    }
  }

  try {
    const [comptantCols] = await db.query("SHOW COLUMNS FROM bons_comptant LIKE 'montant_ignorer'");
    if (!Array.isArray(comptantCols) || comptantCols.length === 0) {
      await db.query("ALTER TABLE bons_comptant ADD COLUMN montant_ignorer DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER montant_total");
    }
  } catch (error) {
    if (error?.code !== 'ER_NO_SUCH_TABLE') {
      console.error('ensureMontantIgnorerColumns bons_comptant:', error);
    }
  }

  try {
    const [resteCols] = await db.query("SHOW COLUMNS FROM bons_comptant LIKE 'reste'");
    if (!Array.isArray(resteCols) || resteCols.length === 0) {
      await db.query("ALTER TABLE bons_comptant ADD COLUMN reste DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER montant_ignorer");
    }
  } catch (error) {
    if (error?.code !== 'ER_NO_SUCH_TABLE') {
      console.error('ensureMontantIgnorerColumns bons_comptant reste:', error);
    }
  }

  try {
    const [nonPayeCols] = await db.query("SHOW COLUMNS FROM bons_comptant LIKE 'non_paye'");
    if (!Array.isArray(nonPayeCols) || nonPayeCols.length === 0) {
      await db.query("ALTER TABLE bons_comptant ADD COLUMN non_paye TINYINT(1) NOT NULL DEFAULT 0 AFTER reste");
    }
  } catch (error) {
    if (error?.code !== 'ER_NO_SUCH_TABLE') {
      console.error('ensureMontantIgnorerColumns bons_comptant non_paye:', error);
    }
  }
}

ensureFondCaisseEntriesTable().catch((error) => {
  console.error('ensureFondCaisseEntriesTable:', error);
});
ensureCoffreTable().catch((error) => {
  console.error('ensureCoffreTable:', error);
});
ensureMontantIgnorerColumns().catch((error) => {
  console.error('ensureMontantIgnorerColumns:', error);
});

const normalizeSqlDateTime = (value) => {
  if (!value) return null;
  const input = String(value).trim();
  if (!input) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(input)) return input;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) return `${input.replace('T', ' ')}:00`;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const formatDateValue = (value) => {
  if (!value) return '';
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
};

const addDaysToIsoDate = (value, days) => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatDateTimeValue = (value) => {
  if (!value) return '';
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    const hours = String(value.getHours()).padStart(2, '0');
    const minutes = String(value.getMinutes()).padStart(2, '0');
    const seconds = String(value.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
  return String(value);
};

const mapEntry = (row) => ({
  id: Number(row.id),
  montant: toNumber(row.montant),
  entryType: String(row.entry_type || 'caisse_initial'),
  note: row.note || '',
  openedAt: formatDateTimeValue(row.opened_at),
  jour: formatDateValue(row.jour),
  createdByUserId: row.created_by == null ? null : Number(row.created_by),
  createdByName: row.created_by_name || 'Inconnu',
  createdAt: formatDateTimeValue(row.created_at),
  modePaiement: row.mode_paiement || 'Espece',
});

const mapCoffreEntry = (row) => ({
  id: -Number(row.id),
  montant: toNumber(row.montant),
  entryType: String(row.entry_type || 'coffre_initial'),
  note: row.note || '',
  openedAt: formatDateTimeValue(row.opened_at),
  jour: formatDateValue(row.jour),
  createdByUserId: row.created_by == null ? null : Number(row.created_by),
  createdByName: row.created_by_name || 'Inconnu',
  createdAt: formatDateTimeValue(row.created_at),
  modePaiement: row.mode_paiement || 'Espece',
});

const ALLOWED_ENTRY_TYPES = new Set([
  'caisse_initial',
  'caisse_libre',
  'coffre_initial',
  'transfer_to_coffre',
  'transfer_to_poche',
  'coffre_transfer_to_poche',
]);
const ALLOWED_PAYMENT_MODES = new Set(['Espece', 'Virement', 'Cheque']);

const normalizePaymentMode = (value) => {
  const raw = String(value || 'Espece').trim();
  if (raw === 'Espèces' || raw === 'Espèce' || raw.toLowerCase() === 'espece') return 'Espece';
  if (raw.toLowerCase() === 'virement') return 'Virement';
  if (raw === 'Chèque' || raw.toLowerCase() === 'cheque') return 'Cheque';
  return raw;
};

async function getEmployeeName(userId) {
  if (!userId) return null;
  const [rows] = await pool.query(
    'SELECT nom_complet, cin FROM employees WHERE id = ? LIMIT 1',
    [userId]
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  return row?.nom_complet || row?.cin || null;
}

async function runMovementQuery(sql, params, label) {
  try {
    const [rows] = await pool.query(sql, params);
    return Array.isArray(rows) ? rows : emptyMovementRows;
  } catch (error) {
    if (
      error?.code === 'ER_NO_SUCH_TABLE' ||
      error?.code === 'ER_BAD_FIELD_ERROR'
    ) {
      console.warn(`Fond caisse: ${label} ignore (${error.sqlMessage || error.message})`);
      return emptyMovementRows;
    }
    throw error;
  }
}

function mergeMovement(target, jour, values) {
  if (!jour) return;
  const key = jour instanceof Date ? formatDateValue(jour) : String(jour).slice(0, 10);
  if (!key) return;
  const current = target.get(key) || {
    jour: key,
    bonComptantPaye: 0,
    paiementBonComptantNonPaye: 0,
    paiementClientCaisse: 0,
    montantLibreCaisse: 0,
    avoirChargeInclusCaisse: 0,
    bonChargeInclusCaisse: 0,
    bonCommandeInclusCaisse: 0,
    bonVehicule: 0,
    avoirComptant: 0,
    transfertVersCoffre: 0,
  };
  for (const [field, value] of Object.entries(values)) {
    current[field] = toNumber(current[field]) + toNumber(value);
  }
  target.set(key, current);
}

router.get('/entries', async (req, res) => {
  try {
    await ensureFondCaisseEntriesTable();
    await ensureCoffreTable();
    const { dateFrom, dateTo } = parseDateRange(req);
    const [caisseRows] = await pool.query(
      `SELECT *
         FROM fond_caisse_entries
        WHERE jour BETWEEN ? AND ?
          AND entry_type IN ('caisse_initial', 'caisse_libre', 'transfer_to_coffre', 'transfer_to_poche')
        ORDER BY opened_at DESC, id DESC`,
      [dateFrom, dateTo]
    );
    const [coffreRows] = await pool.query(
      `SELECT *
         FROM coffre
        WHERE jour BETWEEN ? AND ?
          AND entry_type IN ('coffre_initial', 'coffre_transfer_to_poche')
        ORDER BY opened_at DESC, id DESC`,
      [dateFrom, dateTo]
    );
    const data = [
      ...caisseRows.map(mapEntry),
      ...coffreRows.map(mapCoffreEntry),
    ].sort((a, b) => {
      const byDate = String(b.openedAt || '').localeCompare(String(a.openedAt || ''));
      if (byDate !== 0) return byDate;
      return Number(b.id) - Number(a.id);
    });
    res.json({ dateFrom, dateTo, data });
  } catch (error) {
    console.error('GET /fond-caisse/entries error:', error);
    res.status(500).json({ message: 'Erreur chargement fonds de caisse', error: error?.sqlMessage || error?.message });
  }
});

router.post('/entries', async (req, res) => {
  try {
    await ensureFondCaisseEntriesTable();
    await ensureCoffreTable();

    const montant = Number(req.body?.montant);
    const entryType = String(req.body?.entryType || 'caisse_initial').trim();
    const note = req.body?.note != null ? String(req.body.note).trim() : null;
    const modePaiement = normalizePaymentMode(req.body?.modePaiement);
    const openedAt = normalizeSqlDateTime(req.body?.openedAt);
    if (!Number.isFinite(montant) || montant < 0) {
      return res.status(400).json({ message: 'Montant invalide' });
    }
    if (!ALLOWED_ENTRY_TYPES.has(entryType)) {
      return res.status(400).json({ message: "Type d'entree invalide" });
    }
    if (!ALLOWED_PAYMENT_MODES.has(modePaiement)) {
      return res.status(400).json({ message: 'Mode de paiement invalide' });
    }
    if (!openedAt) {
      return res.status(400).json({ message: 'Date ouverture invalide' });
    }

    const jour = openedAt.slice(0, 10);
    const createdBy = req.user?.id ?? null;
    const createdByName = await getEmployeeName(createdBy) || req.user?.cin || 'Caissier';

    if (entryType === 'coffre_initial' || entryType === 'coffre_transfer_to_poche') {
      const [result] = await pool.query(
        `INSERT INTO coffre (montant, entry_type, note, mode_paiement, opened_at, jour, created_by, created_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          montant,
          entryType,
          note || (entryType === 'coffre_transfer_to_poche' ? 'Transfert coffre vers poche' : null),
          modePaiement,
          openedAt,
          jour,
          createdBy,
          createdByName,
        ]
      );
      const [rows] = await pool.query('SELECT * FROM coffre WHERE id = ? LIMIT 1', [result.insertId]);
      return res.status(201).json(mapCoffreEntry(rows[0]));
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.query(
        `INSERT INTO fond_caisse_entries (montant, entry_type, note, mode_paiement, opened_at, jour, created_by, created_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [montant, entryType, note, modePaiement, openedAt, jour, createdBy, createdByName]
      );
      if (entryType === 'transfer_to_coffre') {
        await connection.query(
          `INSERT INTO coffre (montant, entry_type, note, mode_paiement, opened_at, jour, fond_caisse_entry_id, created_by, created_by_name)
           VALUES (?, 'transfer_from_caisse', ?, ?, ?, ?, ?, ?, ?)`,
          [montant, note || 'Transfert vers coffre', modePaiement, openedAt, jour, result.insertId, createdBy, createdByName]
        );
      }
      await connection.commit();
      const [rows] = await pool.query('SELECT * FROM fond_caisse_entries WHERE id = ? LIMIT 1', [result.insertId]);
      return res.status(201).json(mapEntry(rows[0]));
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('POST /fond-caisse/entries error:', error);
    res.status(500).json({ message: 'Erreur sauvegarde fond de caisse', error: error?.sqlMessage || error?.message });
  }
});

router.delete('/entries/:id', async (req, res) => {
  try {
    await ensureFondCaisseEntriesTable();
    await ensureCoffreTable();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id === 0) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    if (id < 0) {
      const [result] = await pool.query('DELETE FROM coffre WHERE id = ?', [Math.abs(id)]);
      if (!result || result.affectedRows === 0) {
        return res.status(404).json({ message: 'Fond de coffre introuvable' });
      }
      return res.json({ success: true, id });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query(
        'SELECT entry_type FROM fond_caisse_entries WHERE id = ? LIMIT 1',
        [id]
      );
      if (!Array.isArray(rows) || rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: 'Fond de caisse introuvable' });
      }
      if (rows[0].entry_type === 'transfer_to_coffre') {
        await connection.query('DELETE FROM coffre WHERE fond_caisse_entry_id = ?', [id]);
      }
      const [result] = await connection.query('DELETE FROM fond_caisse_entries WHERE id = ?', [id]);
      await connection.commit();
      if (!result || result.affectedRows === 0) {
        return res.status(404).json({ message: 'Fond de caisse introuvable' });
      }
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    res.json({ success: true, id });
  } catch (error) {
    console.error('DELETE /fond-caisse/entries/:id error:', error);
    res.status(500).json({ message: 'Erreur suppression fond de caisse', error: error?.sqlMessage || error?.message });
  }
});

async function runDetailQuery(sql, params, label) {
  try {
    const [rows] = await pool.query(sql, params);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE' || error?.code === 'ER_BAD_FIELD_ERROR') {
      console.warn(`Fond caisse detail: ${label} ignore (${error.sqlMessage || error.message})`);
      return [];
    }
    throw error;
  }
}

const mapActionDateTime = (value) => formatDateTimeValue(value);

async function getCaisseMovementsByDay(dateFrom, dateTo) {
  if (!dateFrom || !dateTo || dateFrom > dateTo) return [];
  const params = [dateFrom, dateTo];
  const movements = new Map();
  const queries = [
    {
      label: 'bons_comptant',
      field: 'bonComptantPaye',
      sql: `
        SELECT DATE(bc.date_creation) AS jour,
               COALESCE(SUM(${netAmountSql('bc.montant_total', 'bc.montant_ignorer')}), 0) AS total
          FROM bons_comptant bc
         WHERE DATE(bc.date_creation) BETWEEN ? AND ?
           AND LOWER(COALESCE(bc.statut, '')) NOT LIKE 'annul%'
           AND LOWER(COALESCE(bc.statut, '')) <> 'avoir'
           AND COALESCE(bc.non_paye, 0) = 0
           AND NOT EXISTS (
             SELECT 1
               FROM paiement_boncomptant_nonpaye pbcnp
              WHERE pbcnp.bon_comptant_id = bc.id
           )
           AND ${netAmountSql('bc.montant_total', 'bc.montant_ignorer')} > 0
           ${afterLatestCaisseStartSql('bc.date_creation')}
         GROUP BY DATE(bc.date_creation)
      `,
    },
    {
      label: 'paiement_boncomptant_nonpaye',
      field: 'paiementBonComptantNonPaye',
      sql: `
        SELECT DATE(p.date_paiement) AS jour, COALESCE(SUM(${bonComptantPaymentNetSql('p', 'bc')}), 0) AS total
          FROM paiement_boncomptant_nonpaye p
          LEFT JOIN bons_comptant bc ON bc.id = p.bon_comptant_id
         WHERE DATE(p.date_paiement) BETWEEN ? AND ?
           ${afterLatestCaisseStartSql('p.date_paiement')}
           AND ${bonComptantPaymentNetSql('p', 'bc')} > 0
         GROUP BY DATE(p.date_paiement)
      `,
    },
    {
      label: 'payments',
      field: 'paiementClientCaisse',
      sql: `
        SELECT DATE(p.date_paiement) AS jour,
               COALESCE(SUM(${netAmountSql('p.montant_total', 'p.montant_ignorer')}), 0) AS total
          FROM payments p
         WHERE DATE(p.date_paiement) BETWEEN ? AND ?
           AND COALESCE(p.bon_type, '') <> 'Comptant'
           AND LOWER(COALESCE(p.statut, '')) NOT LIKE 'annul%'
           AND LOWER(COALESCE(p.statut, '')) NOT LIKE 'refus%'
           AND ${netAmountSql('p.montant_total', 'p.montant_ignorer')} > 0
           ${afterLatestCaisseStartSql('p.date_paiement')}
           AND (
             p.type_paiement = 'Client'
             OR (
               p.type_paiement = 'Fournisseur'
               AND (
                 (COALESCE(p.bon_type, '') = 'Sortie' AND EXISTS (
                   SELECT 1
                     FROM bons_sortie bs
                    WHERE bs.id = p.bon_id
                      AND COALESCE(bs.vendre_au_fournisseur, 0) = 1
                 ))
                 OR
                 (COALESCE(p.bon_type, '') = 'Avoir' AND EXISTS (
                   SELECT 1
                     FROM avoirs_client ac
                    WHERE ac.id = p.bon_id
                      AND COALESCE(ac.vendre_au_fournisseur, 0) = 1
                 ))
               )
             )
           )
         GROUP BY DATE(p.date_paiement)
      `,
    },
    {
      label: 'montant_libre_caisse',
      field: 'montantLibreCaisse',
      sql: `
        SELECT DATE(fce.opened_at) AS jour, COALESCE(SUM(fce.montant), 0) AS total
          FROM fond_caisse_entries fce
         WHERE DATE(fce.opened_at) BETWEEN ? AND ?
           AND fce.entry_type = 'caisse_libre'
           ${afterLatestCaisseStartSql('fce.opened_at')}
         GROUP BY DATE(fce.opened_at)
      `,
    },
    {
      label: 'transfert_vers_coffre',
      field: 'transfertVersCoffre',
      sql: `
        SELECT DATE(cof.opened_at) AS jour, COALESCE(SUM(cof.montant), 0) AS total
          FROM coffre cof
         WHERE DATE(cof.opened_at) BETWEEN ? AND ?
           AND cof.entry_type = 'transfer_from_caisse'
           ${afterLatestCaisseStartSql('cof.opened_at')}
           ${afterLatestCoffreStartSql('cof.opened_at')}
         GROUP BY DATE(cof.opened_at)
      `,
    },
    {
      label: 'transfert_vers_poche',
      field: 'transfertVersPoche',
      sql: `
        SELECT DATE(fce.opened_at) AS jour, COALESCE(SUM(fce.montant), 0) AS total
          FROM fond_caisse_entries fce
         WHERE DATE(fce.opened_at) BETWEEN ? AND ?
           AND fce.entry_type = 'transfer_to_poche'
           ${afterLatestCaisseStartSql('fce.opened_at')}
         GROUP BY DATE(fce.opened_at)
      `,
    },
    {
      label: 'bons_charge',
      field: 'bonChargeInclusCaisse',
      sql: `
        SELECT DATE(bc.date_creation) AS jour,
               COALESCE(SUM(COALESCE(ci_sum.total_items, bc.montant_total, 0)), 0) AS total
          FROM bons_charge bc
          LEFT JOIN (
            SELECT bon_charge_id, SUM(total) AS total_items
              FROM charge_items
             GROUP BY bon_charge_id
          ) ci_sum ON ci_sum.bon_charge_id = bc.id
         WHERE DATE(bc.date_creation) BETWEEN ? AND ?
           AND COALESCE(bc.inclus_en_caisse, 0) = 1
           AND LOWER(COALESCE(bc.statut, '')) NOT LIKE 'annul%'
           ${afterLatestCaisseStartSql('bc.date_creation')}
         GROUP BY DATE(bc.date_creation)
      `,
    },
    {
      label: 'avoirs_charge',
      field: 'avoirChargeInclusCaisse',
      sql: `
        SELECT DATE(bc.date_creation) AS jour,
               COALESCE(SUM(COALESCE(ci_sum.total_items, bc.montant_total, 0)), 0) AS total
          FROM avoirs_charge bc
          LEFT JOIN (
            SELECT avoir_charge_id, SUM(total) AS total_items
              FROM items_avoir_charge
             GROUP BY avoir_charge_id
          ) ci_sum ON ci_sum.avoir_charge_id = bc.id
         WHERE DATE(bc.date_creation) BETWEEN ? AND ?
           AND COALESCE(bc.inclus_en_caisse, 0) = 1
           AND LOWER(COALESCE(bc.statut, '')) NOT LIKE 'annul%'
           ${afterLatestCaisseStartSql('bc.date_creation')}
         GROUP BY DATE(bc.date_creation)
      `,
    },
    {
      label: 'bons_commande',
      field: 'bonCommandeInclusCaisse',
      sql: `
        SELECT DATE(bc.date_creation) AS jour, COALESCE(SUM(bc.montant_total), 0) AS total
          FROM bons_commande bc
         WHERE DATE(bc.date_creation) BETWEEN ? AND ?
           AND COALESCE(bc.inclus_en_caisse, 0) = 1
           AND LOWER(COALESCE(bc.statut, '')) NOT LIKE 'annul%'
           ${afterLatestCaisseStartSql('bc.date_creation')}
         GROUP BY DATE(bc.date_creation)
      `,
    },
    {
      label: 'bons_vehicule',
      field: 'bonVehicule',
      sql: `
        SELECT DATE(bv.date_creation) AS jour, COALESCE(SUM(bv.montant_total), 0) AS total
          FROM bons_vehicule bv
         WHERE DATE(bv.date_creation) BETWEEN ? AND ?
           AND LOWER(COALESCE(bv.statut, '')) NOT LIKE 'annul%'
           ${afterLatestCaisseStartSql('bv.date_creation')}
         GROUP BY DATE(bv.date_creation)
      `,
    },
    {
      label: 'avoirs_comptant',
      field: 'avoirComptant',
      sql: `
        SELECT DATE(acp.date_creation) AS jour, COALESCE(SUM(acp.montant_total), 0) AS total
          FROM avoirs_comptant acp
         WHERE DATE(acp.date_creation) BETWEEN ? AND ?
           AND LOWER(COALESCE(acp.statut, '')) NOT LIKE 'annul%'
           ${afterLatestCaisseStartSql('acp.date_creation')}
         GROUP BY DATE(acp.date_creation)
      `,
    },
  ];

  for (const query of queries) {
    const rows = await runMovementQuery(query.sql, params, query.label);
    for (const row of rows) {
      mergeMovement(movements, row.jour, { [query.field]: row.total });
    }
  }

  return Array.from(movements.values()).sort((a, b) => a.jour.localeCompare(b.jour)).map((row) => {
    const bonComptantPaye = toNumber(row.bonComptantPaye);
    const paiementBonComptantNonPaye = toNumber(row.paiementBonComptantNonPaye);
    const paiementClientCaisse = toNumber(row.paiementClientCaisse);
    const montantLibreCaisse = toNumber(row.montantLibreCaisse);
    const avoirChargeInclusCaisse = toNumber(row.avoirChargeInclusCaisse);
    const transfertVersCoffre = toNumber(row.transfertVersCoffre);
    const transfertVersPoche = toNumber(row.transfertVersPoche);
    const bonChargeInclusCaisse = toNumber(row.bonChargeInclusCaisse);
    const bonCommandeInclusCaisse = toNumber(row.bonCommandeInclusCaisse);
    const bonVehicule = toNumber(row.bonVehicule);
    const avoirComptant = toNumber(row.avoirComptant);
    const entrees = bonComptantPaye + paiementBonComptantNonPaye + paiementClientCaisse + montantLibreCaisse + avoirChargeInclusCaisse;
    const sorties = bonChargeInclusCaisse + bonCommandeInclusCaisse + bonVehicule + avoirComptant + transfertVersCoffre + transfertVersPoche;

    return {
      jour: row.jour,
      bonComptantPaye,
      paiementBonComptantNonPaye,
      paiementClientCaisse,
      montantLibreCaisse,
      avoirChargeInclusCaisse,
      transfertVersCoffre,
      transfertVersPoche,
      bonChargeInclusCaisse,
      bonCommandeInclusCaisse,
      bonVehicule,
      avoirComptant,
      entrees,
      sorties,
      mouvementNet: entrees - sorties,
    };
  });
}

async function getPreviousCaisseBalance(jour) {
  const previousDay = addDaysToIsoDate(jour, -1);
  if (!previousDay || previousDay < FOND_CAISSE_START_DATE) return 0;

  const [entryRows] = await pool.query(
    `SELECT jour, montant
       FROM fond_caisse_entries
      WHERE jour BETWEEN ? AND ?
        AND entry_type = 'caisse_initial'
      ORDER BY jour ASC, opened_at DESC, id DESC`,
    [FOND_CAISSE_START_DATE, previousDay]
  );

  const initialByDay = new Map();
  for (const row of Array.isArray(entryRows) ? entryRows : []) {
    const key = formatDateValue(row.jour);
    if (key && !initialByDay.has(key)) initialByDay.set(key, toNumber(row.montant));
  }

  const movements = await getCaisseMovementsByDay(FOND_CAISSE_START_DATE, previousDay);
  const days = new Set([...initialByDay.keys(), ...movements.map((row) => row.jour)]);
  let total = 0;
  for (const day of Array.from(days).sort()) {
    const movement = movements.find((row) => row.jour === day);
    const debut = initialByDay.has(day) ? initialByDay.get(day) : total;
    total = debut + toNumber(movement?.entrees) - toNumber(movement?.sorties);
  }

  return Number(total.toFixed(2));
}

router.get('/days/:date', async (req, res) => {
  try {
    await ensureFondCaisseEntriesTable();
    await ensureCoffreTable();
    await ensureMontantIgnorerColumns();
    const jour = isIsoDate(req.params.date) ? String(req.params.date) : '';
    if (!jour) {
      return res.status(400).json({ message: 'Date invalide' });
    }

    const actionQueries = [
      {
        label: 'fond_caisse_entries',
        sql: `
          SELECT
            id,
            opened_at AS action_date,
            CASE
              WHEN entry_type = 'caisse_initial' THEN 'Fond initial caisse'
              WHEN entry_type = 'caisse_libre' THEN 'Montant libre caisse'
              WHEN entry_type = 'transfer_to_coffre' THEN 'Transfert vers coffre'
              WHEN entry_type = 'transfer_to_poche' THEN 'Transfert vers poche'
              ELSE 'Fond initial'
            END AS type,
            CASE
              WHEN entry_type IN ('transfer_to_coffre', 'transfer_to_poche') THEN 'SORTIE'
              ELSE 'ENTREE'
            END AS direction,
            montant AS amount,
            CASE
              WHEN entry_type = 'caisse_initial' THEN CONCAT('FC-', id)
              WHEN entry_type = 'caisse_libre' THEN CONCAT('MLC-', id)
              WHEN entry_type = 'transfer_to_coffre' THEN CONCAT('TRC-', id)
              WHEN entry_type = 'transfer_to_poche' THEN CONCAT('TRP-', id)
              ELSE CONCAT('FND-', id)
            END AS reference,
            created_by_name AS actor,
            NULL AS statut,
            mode_paiement AS mode_paiement,
            COALESCE(
              note,
              CASE
                WHEN entry_type = 'caisse_initial' THEN 'Fond de caisse saisi'
                WHEN entry_type = 'caisse_libre' THEN 'Montant libre ajoute a la caisse'
                WHEN entry_type = 'transfer_to_coffre' THEN 'Montant retire de la caisse et place dans le coffre'
                WHEN entry_type = 'transfer_to_poche' THEN 'Montant retire de la caisse et transfere vers poche'
                ELSE 'Ecriture de caisse'
              END
            ) AS description
          FROM fond_caisse_entries
          WHERE jour = ?
            AND entry_type IN ('caisse_initial', 'caisse_libre', 'transfer_to_coffre', 'transfer_to_poche')
        `,
      },
      {
        label: 'coffre',
        sql: `
          SELECT
            id,
            opened_at AS action_date,
            CASE
              WHEN entry_type = 'coffre_initial' THEN 'Fond initial coffre'
              ELSE 'Transfert coffre vers poche'
            END AS type,
            CASE
              WHEN entry_type = 'coffre_initial' THEN 'ENTREE'
              ELSE 'SORTIE'
            END AS direction,
            montant AS amount,
            CASE
              WHEN entry_type = 'coffre_initial' THEN CONCAT('COF-', id)
              ELSE CONCAT('TCP-', id)
            END AS reference,
            created_by_name AS actor,
            NULL AS statut,
            mode_paiement AS mode_paiement,
            COALESCE(
              note,
              CASE
                WHEN entry_type = 'coffre_initial' THEN 'Fond de coffre saisi'
                ELSE 'Montant retire du coffre et transfere vers poche'
              END
            ) AS description
          FROM coffre
          WHERE jour = ?
            AND entry_type IN ('coffre_initial', 'coffre_transfer_to_poche')
        `,
      },
      {
        label: 'bons_comptant',
        sql: `
          SELECT
            id,
            date_creation AS action_date,
            'Bon comptant paye' AS type,
            'ENTREE' AS direction,
            ${netAmountSql('montant_total', 'montant_ignorer')} AS amount,
            CONCAT('COM', LPAD(id, 4, '0')) AS reference,
            COALESCE(client_nom, '') AS actor,
            statut,
            'Bon comptant regle en caisse' AS description
          FROM bons_comptant
          WHERE DATE(date_creation) = ?
            AND LOWER(COALESCE(statut, '')) NOT LIKE 'annul%'
            AND LOWER(COALESCE(statut, '')) <> 'avoir'
            AND COALESCE(non_paye, 0) = 0
            AND NOT EXISTS (
              SELECT 1
                FROM paiement_boncomptant_nonpaye pbcnp
               WHERE pbcnp.bon_comptant_id = bons_comptant.id
            )
            AND ${netAmountSql('montant_total', 'montant_ignorer')} > 0
            ${afterLatestCaisseStartSql('date_creation')}
        `,
      },
      {
        label: 'paiement_boncomptant_nonpaye',
        sql: `
          SELECT
            p.id,
            COALESCE(p.bon_comptant_id, p.id) AS source_id,
            p.date_paiement AS action_date,
            'Paiement bon comptant' AS type,
            'ENTREE' AS direction,
            ${bonComptantPaymentNetSql('p', 'bc')} AS amount,
            CONCAT('COM', LPAD(COALESCE(p.bon_comptant_id, p.id), 4, '0')) AS reference,
            COALESCE(bc.client_nom, '') AS actor,
            NULL AS statut,
            COALESCE(p.note, 'Paiement d un bon comptant non paye') AS description
          FROM paiement_boncomptant_nonpaye p
          LEFT JOIN bons_comptant bc ON bc.id = p.bon_comptant_id
          WHERE DATE(p.date_paiement) = ?
            ${afterLatestCaisseStartSql('p.date_paiement')}
            AND ${bonComptantPaymentNetSql('p', 'bc')} > 0
        `,
      },
      {
        label: 'payments',
        sql: `
          SELECT
            p.id,
            p.date_paiement AS action_date,
            'Paiement caisse' AS type,
            'ENTREE' AS direction,
            ${netAmountSql('p.montant_total', 'p.montant_ignorer')} AS amount,
            COALESCE(p.numero, CONCAT('PAY', LPAD(p.id, 4, '0'))) AS reference,
            COALESCE(c.nom_complet, p.remise_account_name, '') AS actor,
            p.statut,
            COALESCE(p.designation, 'Paiement caisse') AS description
          FROM payments p
          LEFT JOIN contacts c ON c.id = p.contact_id
          WHERE DATE(p.date_paiement) = ?
            AND COALESCE(p.bon_type, '') <> 'Comptant'
            AND LOWER(COALESCE(p.statut, '')) NOT LIKE 'annul%'
            AND LOWER(COALESCE(p.statut, '')) NOT LIKE 'refus%'
            AND ${netAmountSql('p.montant_total', 'p.montant_ignorer')} > 0
            ${afterLatestCaisseStartSql('p.date_paiement')}
            AND (
              p.type_paiement = 'Client'
              OR (
                p.type_paiement = 'Fournisseur'
                AND (
                  (COALESCE(p.bon_type, '') = 'Sortie' AND EXISTS (
                    SELECT 1
                    FROM bons_sortie bs
                    WHERE bs.id = p.bon_id
                      AND COALESCE(bs.vendre_au_fournisseur, 0) = 1
                  ))
                  OR
                  (COALESCE(p.bon_type, '') = 'Avoir' AND EXISTS (
                    SELECT 1
                    FROM avoirs_client ac
                    WHERE ac.id = p.bon_id
                      AND COALESCE(ac.vendre_au_fournisseur, 0) = 1
                  ))
                )
              )
            )
        `,
      },
      {
        label: 'bons_charge',
        sql: `
          SELECT
            bc.id,
            bc.date_creation AS action_date,
            'Charge incluse caisse' AS type,
            'SORTIE' AS direction,
            COALESCE((SELECT SUM(ci.total) FROM charge_items ci WHERE ci.bon_charge_id = bc.id), bc.montant_total, 0) AS amount,
            CONCAT('CHG', LPAD(CAST(bc.id AS CHAR), 4, '0')) AS reference,
            COALESCE(c.nom_complet, '') AS actor,
            bc.statut,
            COALESCE(bc.observations, 'Charge sortie de caisse') AS description
          FROM bons_charge bc
          LEFT JOIN contacts c ON c.id = bc.client_id
          WHERE DATE(bc.date_creation) = ?
            AND COALESCE(bc.inclus_en_caisse, 0) = 1
            AND LOWER(COALESCE(bc.statut, '')) NOT LIKE 'annul%'
            ${afterLatestCaisseStartSql('bc.date_creation')}
        `,
      },
      {
        label: 'avoirs_charge',
        sql: `
          SELECT
            bc.id,
            bc.date_creation AS action_date,
            'Avoir charge' AS type,
            'ENTREE' AS direction,
            COALESCE((SELECT SUM(ci.total) FROM items_avoir_charge ci WHERE ci.avoir_charge_id = bc.id), bc.montant_total, 0) AS amount,
            CONCAT('ACH', LPAD(CAST(bc.id AS CHAR), 4, '0')) AS reference,
            COALESCE(c.nom_complet, '') AS actor,
            bc.statut,
            COALESCE(bc.observations, 'Avoir charge entree en caisse') AS description
          FROM avoirs_charge bc
          LEFT JOIN contacts c ON c.id = bc.client_id
          WHERE DATE(bc.date_creation) = ?
            AND COALESCE(bc.inclus_en_caisse, 0) = 1
            AND LOWER(COALESCE(bc.statut, '')) NOT LIKE 'annul%'
            ${afterLatestCaisseStartSql('bc.date_creation')}
        `,
      },
      {
        label: 'bons_commande',
        sql: `
          SELECT
            bc.id,
            bc.date_creation AS action_date,
            'Commande incluse caisse' AS type,
            'SORTIE' AS direction,
            bc.montant_total AS amount,
            CONCAT('CMD', LPAD(bc.id, 4, '0')) AS reference,
            COALESCE(f.nom_complet, '') AS actor,
            bc.statut,
            COALESCE(bc.lieu_chargement, 'Commande sortie de caisse') AS description
          FROM bons_commande bc
          LEFT JOIN contacts f ON f.id = bc.fournisseur_id
          WHERE DATE(bc.date_creation) = ?
            AND COALESCE(bc.inclus_en_caisse, 0) = 1
            AND LOWER(COALESCE(bc.statut, '')) NOT LIKE 'annul%'
            ${afterLatestCaisseStartSql('bc.date_creation')}
        `,
      },
      {
        label: 'bons_vehicule',
        sql: `
          SELECT
            bv.id,
            bv.date_creation AS action_date,
            'Bon vehicule' AS type,
            'SORTIE' AS direction,
            bv.montant_total AS amount,
            CONCAT('VEH', LPAD(bv.id, 4, '0')) AS reference,
            COALESCE(v.nom, '') AS actor,
            bv.statut,
            COALESCE(bv.lieu_chargement, 'Depense vehicule') AS description
          FROM bons_vehicule bv
          LEFT JOIN vehicules v ON v.id = bv.vehicule_id
          WHERE DATE(bv.date_creation) = ?
            AND LOWER(COALESCE(bv.statut, '')) NOT LIKE 'annul%'
            ${afterLatestCaisseStartSql('bv.date_creation')}
        `,
      },
      {
        label: 'avoirs_comptant',
        sql: `
          SELECT
            acp.id,
            acp.date_creation AS action_date,
            'Avoir comptant' AS type,
            'SORTIE' AS direction,
            acp.montant_total AS amount,
            CONCAT('AVCC', LPAD(acp.id, 4, '0')) AS reference,
            COALESCE(acp.client_nom, '') AS actor,
            acp.statut,
            COALESCE(acp.lieu_chargement, 'Avoir comptant') AS description
          FROM avoirs_comptant acp
          WHERE DATE(acp.date_creation) = ?
            AND LOWER(COALESCE(acp.statut, '')) NOT LIKE 'annul%'
            ${afterLatestCaisseStartSql('acp.date_creation')}
        `,
      },
    ];

    const actions = [];
    for (const query of actionQueries) {
      const rows = await runDetailQuery(query.sql, [jour], query.label);
      for (const row of rows) {
        actions.push({
          id: `${query.label}-${row.id}`,
          sourceTable: query.label,
          sourceId: Number(row.source_id || row.id),
          date: mapActionDateTime(row.action_date),
          type: row.type,
          direction: row.direction,
          amount: toNumber(row.amount),
          reference: row.reference || '',
          actor: row.actor || '',
          statut: row.statut || '',
          modePaiement: row.mode_paiement || '',
          description: row.description || '',
        });
      }
    }

    actions.sort((a, b) => {
      const byDate = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (byDate !== 0) return byDate;
      return a.id.localeCompare(b.id);
    });

    const initialCaisseActions = actions.filter(
      (action) => action.sourceTable === 'fond_caisse_entries' && action.type === 'Fond initial caisse'
    );
    const initialCoffreActions = actions.filter(
      (action) => action.sourceTable === 'coffre' && action.type === 'Fond initial coffre'
    );
    const activeInitialCaisseId = initialCaisseActions.reduce((selected, action) => {
      if (!selected) return action.id;
      const current = actions.find((item) => item.id === selected);
      const currentTime = new Date(current?.date || 0).getTime();
      const actionTime = new Date(action.date || 0).getTime();
      if (actionTime !== currentTime) return actionTime > currentTime ? action.id : selected;
      return Number(action.sourceId || 0) > Number(current?.sourceId || 0) ? action.id : selected;
    }, '');
    const activeInitialCoffreId = initialCoffreActions.reduce((selected, action) => {
      if (!selected) return action.id;
      const current = actions.find((item) => item.id === selected);
      const currentTime = new Date(current?.date || 0).getTime();
      const actionTime = new Date(action.date || 0).getTime();
      if (actionTime !== currentTime) return actionTime > currentTime ? action.id : selected;
      return Number(action.sourceId || 0) > Number(current?.sourceId || 0) ? action.id : selected;
    }, '');

    const activeInitialCaisse = actions.find((action) => action.id === activeInitialCaisseId);
    const activeInitialCoffre = actions.find((action) => action.id === activeInitialCoffreId);
    const activeInitialCaisseTime = activeInitialCaisse ? new Date(activeInitialCaisse.date || 0).getTime() : null;
    const activeInitialCoffreTime = activeInitialCoffre ? new Date(activeInitialCoffre.date || 0).getTime() : null;
    const previousCaisseBalance = activeInitialCaisseId ? 0 : await getPreviousCaisseBalance(jour);
    const reportCaisseAction = previousCaisseBalance === 0 ? null : {
      id: `report_caisse-${jour}`,
      sourceTable: 'report_caisse',
      sourceId: 0,
      date: `${jour} 00:00:00`,
      type: 'Caisse de hier',
      direction: previousCaisseBalance < 0 ? 'SORTIE' : 'ENTREE',
      amount: Math.abs(previousCaisseBalance),
      reference: '-',
      actor: 'Report caisse',
      statut: '',
      modePaiement: '',
      description: 'Solde final de la veille',
    };
    const activeBonCutoffTime = Math.max(
      Number.isFinite(activeInitialCaisseTime) ? activeInitialCaisseTime : 0,
      Number.isFinite(activeInitialCoffreTime) ? activeInitialCoffreTime : 0
    ) || null;

    const isBeforeCutoff = (action, cutoffTime) => {
      if (!cutoffTime) return false;
      const actionTime = new Date(action.date || 0).getTime();
      return Number.isFinite(actionTime) && actionTime < cutoffTime;
    };

    const isCaisseInitial = (action) =>
      action.sourceTable === 'fond_caisse_entries' && action.type === 'Fond initial caisse';
    const isCoffreInitial = (action) =>
      action.sourceTable === 'coffre' && action.type === 'Fond initial coffre';
    const actionOrderPriority = (action) => {
      if (action.sourceTable === 'report_caisse') return -1;
      if (isCaisseInitial(action)) return 0;
      if (isCoffreInitial(action)) return 1;
      return 2;
    };

    const visibleActions = [
      ...(reportCaisseAction ? [reportCaisseAction] : []),
      ...actions.filter((action) => {
      if (isCaisseInitial(action)) return action.id === activeInitialCaisseId;
      if (isCoffreInitial(action)) return action.id === activeInitialCoffreId;
      if (action.sourceTable === 'coffre') return !isBeforeCutoff(action, activeInitialCoffreTime);
      return !isBeforeCutoff(action, activeBonCutoffTime);
      }),
    ].sort((a, b) => {
      const byDate = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (byDate !== 0) return byDate;
      const byPriority = actionOrderPriority(a) - actionOrderPriority(b);
      if (byPriority !== 0) return byPriority;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });

    const affectsCaisseTotal = (action) => {
      if (action.sourceTable === 'coffre') return false;
      if (action.sourceTable === 'fond_caisse_entries' && action.type === 'Fond initial caisse') {
        return action.id === activeInitialCaisseId;
      }
      return true;
    };

    let cumulative = 0;
    const data = visibleActions.map((action) => {
      const affectsCaisse = affectsCaisseTotal(action);
      const signedAmount = affectsCaisse ? (action.direction === 'SORTIE' ? -action.amount : action.amount) : 0;
      if (isCaisseInitial(action)) {
        cumulative = action.amount;
      } else {
        cumulative += signedAmount;
      }
      return { ...action, signedAmount, cumulative, affectsCaisse };
    });

    const totalEntrees = data
      .filter((action) => action.affectsCaisse && action.direction === 'ENTREE')
      .reduce((sum, action) => sum + action.amount, 0);
    const totalSorties = data
      .filter((action) => action.affectsCaisse && action.direction === 'SORTIE')
      .reduce((sum, action) => sum + action.amount, 0);

    res.json({
      jour,
      summary: {
        totalEntrees,
        totalSorties,
        totalCumule: totalEntrees - totalSorties,
        actionsCount: data.length,
      },
      data,
    });
  } catch (error) {
    console.error('GET /fond-caisse/days/:date error:', error);
    res.status(500).json({ message: 'Erreur detail fond de caisse', error: error?.sqlMessage || error?.message });
  }
});

// GET /api/fond-caisse/mouvements?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
router.get('/mouvements', async (req, res) => {
  try {
    await ensureFondCaisseEntriesTable();
    await ensureCoffreTable();
    await ensureMontantIgnorerColumns();
    const { dateFrom, dateTo } = parseDateRange(req);
    const params = [dateFrom, dateTo];

    const movements = new Map();

    const queries = [
      {
        label: 'bons_comptant',
        field: 'bonComptantPaye',
        sql: `
          SELECT DATE(bc.date_creation) AS jour,
                 COALESCE(SUM(${netAmountSql('bc.montant_total', 'bc.montant_ignorer')}), 0) AS total
            FROM bons_comptant bc
           WHERE DATE(bc.date_creation) BETWEEN ? AND ?
             AND LOWER(COALESCE(bc.statut, '')) NOT LIKE 'annul%'
             AND LOWER(COALESCE(bc.statut, '')) <> 'avoir'
             AND COALESCE(bc.non_paye, 0) = 0
             AND NOT EXISTS (
               SELECT 1
                 FROM paiement_boncomptant_nonpaye pbcnp
                WHERE pbcnp.bon_comptant_id = bc.id
             )
             AND ${netAmountSql('bc.montant_total', 'bc.montant_ignorer')} > 0
             ${afterLatestCaisseStartSql('bc.date_creation')}
           GROUP BY DATE(bc.date_creation)
        `,
      },
      {
        label: 'paiement_boncomptant_nonpaye',
        field: 'paiementBonComptantNonPaye',
        sql: `
          SELECT DATE(p.date_paiement) AS jour, COALESCE(SUM(${bonComptantPaymentNetSql('p', 'bc')}), 0) AS total
           FROM paiement_boncomptant_nonpaye p
           LEFT JOIN bons_comptant bc ON bc.id = p.bon_comptant_id
           WHERE DATE(p.date_paiement) BETWEEN ? AND ?
             ${afterLatestCaisseStartSql('p.date_paiement')}
             AND ${bonComptantPaymentNetSql('p', 'bc')} > 0
           GROUP BY DATE(p.date_paiement)
        `,
      },
      {
        label: 'payments',
        field: 'paiementClientCaisse',
        sql: `
          SELECT DATE(p.date_paiement) AS jour,
                 COALESCE(SUM(${netAmountSql('p.montant_total', 'p.montant_ignorer')}), 0) AS total
            FROM payments p
           WHERE DATE(p.date_paiement) BETWEEN ? AND ?
             AND COALESCE(p.bon_type, '') <> 'Comptant'
             AND LOWER(COALESCE(p.statut, '')) NOT LIKE 'annul%'
             AND LOWER(COALESCE(p.statut, '')) NOT LIKE 'refus%'
             AND ${netAmountSql('p.montant_total', 'p.montant_ignorer')} > 0
             ${afterLatestCaisseStartSql('p.date_paiement')}
             AND (
               p.type_paiement = 'Client'
               OR (
                 p.type_paiement = 'Fournisseur'
                 AND (
                   (COALESCE(p.bon_type, '') = 'Sortie' AND EXISTS (
                     SELECT 1
                     FROM bons_sortie bs
                     WHERE bs.id = p.bon_id
                       AND COALESCE(bs.vendre_au_fournisseur, 0) = 1
                   ))
                   OR
                   (COALESCE(p.bon_type, '') = 'Avoir' AND EXISTS (
                     SELECT 1
                     FROM avoirs_client ac
                     WHERE ac.id = p.bon_id
                       AND COALESCE(ac.vendre_au_fournisseur, 0) = 1
                   ))
                 )
               )
             )
           GROUP BY DATE(p.date_paiement)
        `,
      },
      {
        label: 'montant_libre_caisse',
        field: 'montantLibreCaisse',
        sql: `
          SELECT DATE(fce.opened_at) AS jour, COALESCE(SUM(fce.montant), 0) AS total
           FROM fond_caisse_entries fce
           WHERE DATE(fce.opened_at) BETWEEN ? AND ?
             AND fce.entry_type = 'caisse_libre'
             ${afterLatestCaisseStartSql('fce.opened_at')}
           GROUP BY DATE(fce.opened_at)
        `,
      },
      {
        label: 'transfert_vers_coffre',
        field: 'transfertVersCoffre',
        sql: `
          SELECT DATE(cof.opened_at) AS jour, COALESCE(SUM(cof.montant), 0) AS total
           FROM coffre cof
           WHERE DATE(cof.opened_at) BETWEEN ? AND ?
             AND cof.entry_type = 'transfer_from_caisse'
             ${afterLatestCaisseStartSql('cof.opened_at')}
             ${afterLatestCoffreStartSql('cof.opened_at')}
           GROUP BY DATE(cof.opened_at)
        `,
      },
      {
        label: 'transfert_vers_poche',
        field: 'transfertVersPoche',
        sql: `
          SELECT DATE(fce.opened_at) AS jour, COALESCE(SUM(fce.montant), 0) AS total
           FROM fond_caisse_entries fce
           WHERE DATE(fce.opened_at) BETWEEN ? AND ?
             AND fce.entry_type = 'transfer_to_poche'
             ${afterLatestCaisseStartSql('fce.opened_at')}
           GROUP BY DATE(fce.opened_at)
        `,
      },
      {
        label: 'transfert_coffre_vers_poche',
        field: 'transfertCoffreVersPoche',
        sql: `
          SELECT DATE(cof.opened_at) AS jour, COALESCE(SUM(cof.montant), 0) AS total
           FROM coffre cof
           WHERE DATE(cof.opened_at) BETWEEN ? AND ?
             AND cof.entry_type = 'coffre_transfer_to_poche'
             ${afterLatestCoffreStartSql('cof.opened_at')}
           GROUP BY DATE(cof.opened_at)
        `,
      },
      {
        label: 'bons_charge',
        field: 'bonChargeInclusCaisse',
        sql: `
          SELECT DATE(bc.date_creation) AS jour,
                 COALESCE(SUM(COALESCE(ci_sum.total_items, bc.montant_total, 0)), 0) AS total
            FROM bons_charge bc
            LEFT JOIN (
              SELECT bon_charge_id, SUM(total) AS total_items
                FROM charge_items
               GROUP BY bon_charge_id
            ) ci_sum ON ci_sum.bon_charge_id = bc.id
           WHERE DATE(bc.date_creation) BETWEEN ? AND ?
             AND COALESCE(bc.inclus_en_caisse, 0) = 1
             AND LOWER(COALESCE(bc.statut, '')) NOT LIKE 'annul%'
             ${afterLatestCaisseStartSql('bc.date_creation')}
           GROUP BY DATE(bc.date_creation)
        `,
      },
      {
        label: 'avoirs_charge',
        field: 'avoirChargeInclusCaisse',
        sql: `
          SELECT DATE(bc.date_creation) AS jour,
                 COALESCE(SUM(COALESCE(ci_sum.total_items, bc.montant_total, 0)), 0) AS total
            FROM avoirs_charge bc
            LEFT JOIN (
              SELECT avoir_charge_id, SUM(total) AS total_items
                FROM items_avoir_charge
               GROUP BY avoir_charge_id
            ) ci_sum ON ci_sum.avoir_charge_id = bc.id
           WHERE DATE(bc.date_creation) BETWEEN ? AND ?
             AND COALESCE(bc.inclus_en_caisse, 0) = 1
             AND LOWER(COALESCE(bc.statut, '')) NOT LIKE 'annul%'
             ${afterLatestCaisseStartSql('bc.date_creation')}
           GROUP BY DATE(bc.date_creation)
        `,
      },
      {
        label: 'bons_commande',
        field: 'bonCommandeInclusCaisse',
        sql: `
          SELECT DATE(bc.date_creation) AS jour, COALESCE(SUM(bc.montant_total), 0) AS total
            FROM bons_commande bc
           WHERE DATE(bc.date_creation) BETWEEN ? AND ?
             AND COALESCE(bc.inclus_en_caisse, 0) = 1
             AND LOWER(COALESCE(bc.statut, '')) NOT LIKE 'annul%'
             ${afterLatestCaisseStartSql('bc.date_creation')}
           GROUP BY DATE(bc.date_creation)
        `,
      },
      {
        label: 'bons_vehicule',
        field: 'bonVehicule',
        sql: `
          SELECT DATE(bv.date_creation) AS jour, COALESCE(SUM(bv.montant_total), 0) AS total
            FROM bons_vehicule bv
           WHERE DATE(bv.date_creation) BETWEEN ? AND ?
             AND LOWER(COALESCE(bv.statut, '')) NOT LIKE 'annul%'
             ${afterLatestCaisseStartSql('bv.date_creation')}
           GROUP BY DATE(bv.date_creation)
        `,
      },
      {
        label: 'avoirs_comptant',
        field: 'avoirComptant',
        sql: `
          SELECT DATE(acp.date_creation) AS jour, COALESCE(SUM(acp.montant_total), 0) AS total
            FROM avoirs_comptant acp
           WHERE DATE(acp.date_creation) BETWEEN ? AND ?
             AND LOWER(COALESCE(acp.statut, '')) NOT LIKE 'annul%'
             ${afterLatestCaisseStartSql('acp.date_creation')}
           GROUP BY DATE(acp.date_creation)
        `,
      },
    ];

    for (const query of queries) {
      const rows = await runMovementQuery(query.sql, params, query.label);
      for (const row of rows) {
        mergeMovement(movements, row.jour, { [query.field]: row.total });
      }
    }

    res.json({
      dateFrom,
      dateTo,
      data: Array.from(movements.values()).sort((a, b) => a.jour.localeCompare(b.jour)).map((row) => {
        const bonComptantPaye = toNumber(row.bonComptantPaye);
        const paiementBonComptantNonPaye = toNumber(row.paiementBonComptantNonPaye);
        const paiementClientCaisse = toNumber(row.paiementClientCaisse);
        const montantLibreCaisse = toNumber(row.montantLibreCaisse);
        const avoirChargeInclusCaisse = toNumber(row.avoirChargeInclusCaisse);
        const transfertVersCoffre = toNumber(row.transfertVersCoffre);
        const transfertVersPoche = toNumber(row.transfertVersPoche);
        const transfertCoffreVersPoche = toNumber(row.transfertCoffreVersPoche);
        const bonChargeInclusCaisse = toNumber(row.bonChargeInclusCaisse);
        const bonCommandeInclusCaisse = toNumber(row.bonCommandeInclusCaisse);
        const bonVehicule = toNumber(row.bonVehicule);
        const avoirComptant = toNumber(row.avoirComptant);
        const entrees = bonComptantPaye + paiementBonComptantNonPaye + paiementClientCaisse + montantLibreCaisse + avoirChargeInclusCaisse;
        const sorties = bonChargeInclusCaisse + bonCommandeInclusCaisse + bonVehicule + avoirComptant + transfertVersCoffre + transfertVersPoche;

        return {
          jour: row.jour,
          bonComptantPaye,
          paiementBonComptantNonPaye,
          paiementClientCaisse,
          montantLibreCaisse,
          avoirChargeInclusCaisse,
          transfertVersCoffre,
          transfertVersPoche,
          transfertCoffreVersPoche,
          bonChargeInclusCaisse,
          bonCommandeInclusCaisse,
          bonVehicule,
          avoirComptant,
          entrees,
          sorties,
          coffreEntrees: transfertVersCoffre,
          coffreSorties: transfertCoffreVersPoche,
          mouvementNetCoffre: transfertVersCoffre - transfertCoffreVersPoche,
          mouvementNet: entrees - sorties,
        };
      }),
    });
  } catch (error) {
    console.error('GET /fond-caisse/mouvements error:', error);
    res.status(500).json({ message: 'Erreur calcul fond de caisse', error: error?.sqlMessage || error?.message });
  }
});

export default router;
