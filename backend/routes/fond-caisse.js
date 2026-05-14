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

const emptyMovementRows = [];

async function ensureFondCaisseEntriesTable(db = pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS fond_caisse_entries (
      id INT NOT NULL AUTO_INCREMENT,
      montant DECIMAL(12,2) NOT NULL DEFAULT 0,
      entry_type VARCHAR(50) NOT NULL DEFAULT 'caisse_initial',
      note VARCHAR(255) NULL,
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
}

ensureFondCaisseEntriesTable().catch((error) => {
  console.error('ensureFondCaisseEntriesTable:', error);
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
});

const ALLOWED_ENTRY_TYPES = new Set(['caisse_initial', 'coffre_initial', 'transfer_to_coffre']);

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
    bonChargeInclusCaisse: 0,
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
    const { dateFrom, dateTo } = parseDateRange(req);
    const [rows] = await pool.query(
      `SELECT *
         FROM fond_caisse_entries
        WHERE jour BETWEEN ? AND ?
        ORDER BY opened_at DESC, id DESC`,
      [dateFrom, dateTo]
    );
    res.json({ dateFrom, dateTo, data: rows.map(mapEntry) });
  } catch (error) {
    console.error('GET /fond-caisse/entries error:', error);
    res.status(500).json({ message: 'Erreur chargement fonds de caisse', error: error?.sqlMessage || error?.message });
  }
});

router.post('/entries', async (req, res) => {
  try {
    await ensureFondCaisseEntriesTable();

    const montant = Number(req.body?.montant);
    const entryType = String(req.body?.entryType || 'caisse_initial').trim();
    const note = req.body?.note != null ? String(req.body.note).trim() : null;
    const openedAt = normalizeSqlDateTime(req.body?.openedAt);
    if (!Number.isFinite(montant) || montant < 0) {
      return res.status(400).json({ message: 'Montant invalide' });
    }
    if (!ALLOWED_ENTRY_TYPES.has(entryType)) {
      return res.status(400).json({ message: "Type d'entree invalide" });
    }
    if (!openedAt) {
      return res.status(400).json({ message: 'Date ouverture invalide' });
    }

    const jour = openedAt.slice(0, 10);
    const createdBy = req.user?.id ?? null;
    const createdByName = await getEmployeeName(createdBy) || req.user?.cin || 'Caissier';

    const [result] = await pool.query(
      `INSERT INTO fond_caisse_entries (montant, entry_type, note, opened_at, jour, created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [montant, entryType, note, openedAt, jour, createdBy, createdByName]
    );

    const [rows] = await pool.query('SELECT * FROM fond_caisse_entries WHERE id = ? LIMIT 1', [result.insertId]);
    res.status(201).json(mapEntry(rows[0]));
  } catch (error) {
    console.error('POST /fond-caisse/entries error:', error);
    res.status(500).json({ message: 'Erreur sauvegarde fond de caisse', error: error?.sqlMessage || error?.message });
  }
});

router.delete('/entries/:id', async (req, res) => {
  try {
    await ensureFondCaisseEntriesTable();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    const [result] = await pool.query('DELETE FROM fond_caisse_entries WHERE id = ?', [id]);
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ message: 'Fond de caisse introuvable' });
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

router.get('/days/:date', async (req, res) => {
  try {
    await ensureFondCaisseEntriesTable();
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
              WHEN entry_type = 'transfer_to_coffre' THEN 'Transfert vers coffre'
              ELSE 'Fond initial'
            END AS type,
            CASE
              WHEN entry_type = 'transfer_to_coffre' THEN 'SORTIE'
              ELSE 'ENTREE'
            END AS direction,
            montant AS amount,
            CASE
              WHEN entry_type = 'caisse_initial' THEN CONCAT('FC-', id)
              WHEN entry_type = 'transfer_to_coffre' THEN CONCAT('TRC-', id)
              ELSE CONCAT('FND-', id)
            END AS reference,
            created_by_name AS actor,
            NULL AS statut,
            COALESCE(
              note,
              CASE
                WHEN entry_type = 'caisse_initial' THEN 'Fond de caisse saisi'
                WHEN entry_type = 'transfer_to_coffre' THEN 'Montant retire de la caisse et place dans le coffre'
                ELSE 'Ecriture de caisse'
              END
            ) AS description
          FROM fond_caisse_entries
          WHERE jour = ?
            AND entry_type IN ('caisse_initial', 'transfer_to_coffre')
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
            montant_total AS amount,
            CONCAT('COM', LPAD(id, 2, '0')) AS reference,
            COALESCE(client_nom, '') AS actor,
            statut,
            'Bon comptant regle en caisse' AS description
          FROM bons_comptant
          WHERE DATE(date_creation) = ?
            AND COALESCE(non_paye, 0) <> 1
            AND LOWER(COALESCE(statut, '')) NOT LIKE 'annul%'
            AND LOWER(COALESCE(statut, '')) <> 'avoir'
        `,
      },
      {
        label: 'paiement_boncomptant_nonpaye',
        sql: `
          SELECT
            p.id,
            p.date_paiement AS action_date,
            'Paiement bon comptant' AS type,
            'ENTREE' AS direction,
            p.montant AS amount,
            CONCAT('P-COM', p.id) AS reference,
            COALESCE(bc.client_nom, '') AS actor,
            NULL AS statut,
            COALESCE(p.note, 'Paiement d un bon comptant non paye') AS description
          FROM paiement_boncomptant_nonpaye p
          LEFT JOIN bons_comptant bc ON bc.id = p.bon_comptant_id
          WHERE DATE(p.date_paiement) = ?
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
            p.montant_total AS amount,
            COALESCE(p.numero, CONCAT('PAY', p.id)) AS reference,
            COALESCE(c.nom_complet, p.remise_account_name, '') AS actor,
            p.statut,
            COALESCE(p.designation, 'Paiement caisse') AS description
          FROM payments p
          LEFT JOIN contacts c ON c.id = p.contact_id
          WHERE DATE(p.date_paiement) = ?
            AND COALESCE(p.bon_type, '') <> 'Comptant'
            AND LOWER(COALESCE(p.statut, '')) NOT LIKE 'annul%'
            AND LOWER(COALESCE(p.statut, '')) NOT LIKE 'refus%'
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
            CONCAT('CHG', LPAD(CAST(bc.id AS CHAR), 2, '0')) AS reference,
            COALESCE(c.nom_complet, '') AS actor,
            bc.statut,
            COALESCE(bc.observations, 'Charge sortie de caisse') AS description
          FROM bons_charge bc
          LEFT JOIN contacts c ON c.id = bc.client_id
          WHERE DATE(bc.date_creation) = ?
            AND COALESCE(bc.inclus_en_caisse, 0) = 1
            AND LOWER(COALESCE(bc.statut, '')) NOT LIKE 'annul%'
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
            CONCAT('VEH', LPAD(bv.id, 2, '0')) AS reference,
            COALESCE(v.nom, '') AS actor,
            bv.statut,
            COALESCE(bv.lieu_chargement, 'Depense vehicule') AS description
          FROM bons_vehicule bv
          LEFT JOIN vehicules v ON v.id = bv.vehicule_id
          WHERE DATE(bv.date_creation) = ?
            AND LOWER(COALESCE(bv.statut, '')) NOT LIKE 'annul%'
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
            CONCAT('AVCC', LPAD(acp.id, 2, '0')) AS reference,
            COALESCE(acp.client_nom, '') AS actor,
            acp.statut,
            COALESCE(acp.lieu_chargement, 'Avoir comptant') AS description
          FROM avoirs_comptant acp
          WHERE DATE(acp.date_creation) = ?
            AND LOWER(COALESCE(acp.statut, '')) NOT LIKE 'annul%'
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
          sourceId: Number(row.id),
          date: mapActionDateTime(row.action_date),
          type: row.type,
          direction: row.direction,
          amount: toNumber(row.amount),
          reference: row.reference || '',
          actor: row.actor || '',
          statut: row.statut || '',
          description: row.description || '',
        });
      }
    }

    actions.sort((a, b) => {
      const byDate = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (byDate !== 0) return byDate;
      return a.id.localeCompare(b.id);
    });

    let cumulative = 0;
    const data = actions.map((action) => {
      const signedAmount = action.direction === 'SORTIE' ? -action.amount : action.amount;
      cumulative += signedAmount;
      return { ...action, signedAmount, cumulative };
    });

    const totalEntrees = data
      .filter((action) => action.direction === 'ENTREE')
      .reduce((sum, action) => sum + action.amount, 0);
    const totalSorties = data
      .filter((action) => action.direction === 'SORTIE')
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
    const { dateFrom, dateTo } = parseDateRange(req);
    const params = [dateFrom, dateTo];

    const movements = new Map();

    const queries = [
      {
        label: 'bons_comptant',
        field: 'bonComptantPaye',
        sql: `
          SELECT DATE(date_creation) AS jour, COALESCE(SUM(montant_total), 0) AS total
            FROM bons_comptant
           WHERE DATE(date_creation) BETWEEN ? AND ?
             AND COALESCE(non_paye, 0) <> 1
             AND LOWER(COALESCE(statut, '')) NOT LIKE 'annul%'
             AND LOWER(COALESCE(statut, '')) <> 'avoir'
           GROUP BY DATE(date_creation)
        `,
      },
      {
        label: 'paiement_boncomptant_nonpaye',
        field: 'paiementBonComptantNonPaye',
        sql: `
          SELECT DATE(date_paiement) AS jour, COALESCE(SUM(montant), 0) AS total
            FROM paiement_boncomptant_nonpaye
           WHERE DATE(date_paiement) BETWEEN ? AND ?
           GROUP BY DATE(date_paiement)
        `,
      },
      {
        label: 'payments',
        field: 'paiementClientCaisse',
        sql: `
          SELECT DATE(date_paiement) AS jour, COALESCE(SUM(montant_total), 0) AS total
            FROM payments
           WHERE DATE(date_paiement) BETWEEN ? AND ?
             AND COALESCE(bon_type, '') <> 'Comptant'
             AND LOWER(COALESCE(statut, '')) NOT LIKE 'annul%'
             AND LOWER(COALESCE(statut, '')) NOT LIKE 'refus%'
             AND (
               type_paiement = 'Client'
               OR (
                 type_paiement = 'Fournisseur'
                 AND (
                   (COALESCE(bon_type, '') = 'Sortie' AND EXISTS (
                     SELECT 1
                     FROM bons_sortie bs
                     WHERE bs.id = payments.bon_id
                       AND COALESCE(bs.vendre_au_fournisseur, 0) = 1
                   ))
                   OR
                   (COALESCE(bon_type, '') = 'Avoir' AND EXISTS (
                     SELECT 1
                     FROM avoirs_client ac
                     WHERE ac.id = payments.bon_id
                       AND COALESCE(ac.vendre_au_fournisseur, 0) = 1
                   ))
                 )
               )
             )
           GROUP BY DATE(date_paiement)
        `,
      },
      {
        label: 'transfert_vers_coffre',
        field: 'transfertVersCoffre',
        sql: `
          SELECT DATE(opened_at) AS jour, COALESCE(SUM(montant), 0) AS total
            FROM fond_caisse_entries
           WHERE DATE(opened_at) BETWEEN ? AND ?
             AND entry_type = 'transfer_to_coffre'
           GROUP BY DATE(opened_at)
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
           GROUP BY DATE(bc.date_creation)
        `,
      },
      {
        label: 'bons_vehicule',
        field: 'bonVehicule',
        sql: `
          SELECT DATE(date_creation) AS jour, COALESCE(SUM(montant_total), 0) AS total
            FROM bons_vehicule
           WHERE DATE(date_creation) BETWEEN ? AND ?
             AND LOWER(COALESCE(statut, '')) NOT LIKE 'annul%'
           GROUP BY DATE(date_creation)
        `,
      },
      {
        label: 'avoirs_comptant',
        field: 'avoirComptant',
        sql: `
          SELECT DATE(date_creation) AS jour, COALESCE(SUM(montant_total), 0) AS total
            FROM avoirs_comptant
           WHERE DATE(date_creation) BETWEEN ? AND ?
             AND LOWER(COALESCE(statut, '')) NOT LIKE 'annul%'
           GROUP BY DATE(date_creation)
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
        const transfertVersCoffre = toNumber(row.transfertVersCoffre);
        const bonChargeInclusCaisse = toNumber(row.bonChargeInclusCaisse);
        const bonVehicule = toNumber(row.bonVehicule);
        const avoirComptant = toNumber(row.avoirComptant);
        const entrees = bonComptantPaye + paiementBonComptantNonPaye + paiementClientCaisse;
        const sorties = bonChargeInclusCaisse + bonVehicule + avoirComptant + transfertVersCoffre;

        return {
          jour: row.jour,
          bonComptantPaye,
          paiementBonComptantNonPaye,
          paiementClientCaisse,
          transfertVersCoffre,
          bonChargeInclusCaisse,
          bonVehicule,
          avoirComptant,
          entrees,
          sorties,
          coffreEntrees: transfertVersCoffre,
          coffreSorties: 0,
          mouvementNetCoffre: transfertVersCoffre,
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
