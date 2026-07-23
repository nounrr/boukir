import express from 'express';
import pool from '../db/pool.js';
import { forbidRoles } from '../middleware/auth.js';
import { verifyToken } from '../middleware/auth.js';
import { resolveRemiseTarget } from '../utils/remiseTarget.js';
import { syncBonItemRemises } from '../utils/syncBonItemRemises.js';
import { applyStockDeltas, buildStockDeltaMaps, mergeStockDeltaMaps } from '../utils/stock.js';
import { computeMouvementCalc } from '../utils/mouvementCalc.js';
import {
  BonAuthorizationError,
  bonAuthorizationErrorPayload,
  recordBonExceptionAuthorizationUsage,
  reserveBonExceptionAuthorizations,
} from '../utils/bonExceptionAuthorization.js';

const router = express.Router();

const averageSnapshotCoutRevientExpr = (itemAlias) => `COALESCE((
  SELECT SUM(COALESCE(ps_avg.cout_revient, 0) * ci_avg.quantite) / NULLIF(SUM(ci_avg.quantite), 0)
  FROM product_snapshot ps_avg
  JOIN commande_items ci_avg ON ci_avg.product_snapshot_id = ps_avg.id
  WHERE ps_avg.product_id = ${itemAlias}.product_id
    AND ((COALESCE(${itemAlias}.variant_id, ps.variant_id) IS NULL AND ps_avg.variant_id IS NULL)
      OR ps_avg.variant_id <=> COALESCE(${itemAlias}.variant_id, ps.variant_id))
    AND ci_avg.quantite IS NOT NULL
    AND ci_avg.quantite <> 0
    AND ps_avg.cout_revient IS NOT NULL
), p.cout_revient, ps.cout_revient, p.prix_achat, ps.prix_achat, 0)`;

async function ensureComptantPaymentsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS paiement_boncomptant_nonpaye (
      id INT NOT NULL AUTO_INCREMENT,
      bon_comptant_id INT NOT NULL,
      montant DECIMAL(12,2) NOT NULL,
      date_paiement DATETIME NOT NULL,
      note TEXT NULL,
      statut VARCHAR(50) NOT NULL DEFAULT 'Validé',
      created_by INT NULL,
      updated_by INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_pbcnp_bon_id (bon_comptant_id),
      CONSTRAINT fk_pbcnp_bon_comptant
        FOREIGN KEY (bon_comptant_id) REFERENCES bons_comptant(id)
        ON DELETE CASCADE
    )
  `);
  const [statutCols] = await pool.query("SHOW COLUMNS FROM paiement_boncomptant_nonpaye LIKE 'statut'");
  if (!Array.isArray(statutCols) || statutCols.length === 0) {
    await pool.query("ALTER TABLE paiement_boncomptant_nonpaye ADD COLUMN statut VARCHAR(50) NOT NULL DEFAULT 'Validé' AFTER note");
  }
}

ensureComptantPaymentsTable().catch((error) => {
  console.error('ensureComptantPaymentsTable:', error);
});

async function ensureBonsComptantMontantIgnorerColumn() {
  try {
    const [rows] = await pool.query("SHOW COLUMNS FROM bons_comptant LIKE 'montant_ignorer'");
    if (!Array.isArray(rows) || rows.length === 0) {
      await pool.query("ALTER TABLE bons_comptant ADD COLUMN montant_ignorer DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER montant_total");
    }
  } catch (error) {
    console.error('ensureBonsComptantMontantIgnorerColumn:', error);
    throw error;
  }
}

ensureBonsComptantMontantIgnorerColumn().catch((error) => {
  console.error('ensureBonsComptantMontantIgnorerColumn init:', error);
});

const normalizeSqlDateTime = (value) => {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return `${s.replace('T', ' ')}:00`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
};

const parseBooleanFlag = (value) => (
  value === true ||
  value === 1 ||
  value === '1' ||
  (typeof value === 'string' && value.toLowerCase() === 'true')
);

const comptantRemisePaymentGroupId = (bonId) => `comptant-remise-${Number(bonId)}`;

function computeComptantRemiseTotal(items) {
  const total = (Array.isArray(items) ? items : []).reduce((sum, item) => {
    const qte = Number(item?.quantite || 0);
    const prixUnitaire = Number(item?.prix_unitaire || 0);
    const remiseMontant = Number(item?.remise_montant || 0);
    const remisePourcentage = Number(item?.remise_pourcentage || 0);
    const remiseUnitaire = remiseMontant !== 0
      ? remiseMontant
      : (remisePourcentage !== 0 ? (prixUnitaire * remisePourcentage) / 100 : 0);
    return sum + (qte * remiseUnitaire);
  }, 0);
  return Math.max(0, Math.round(total * 100) / 100);
}

async function createComptantRemiseContact(db, { bonId, clientNom, createdBy }) {
  const effectiveName = String(clientNom || '').trim() || `client comptant_${Number(bonId)}`;
  const [result] = await db.execute(
    `INSERT INTO contacts (nom_complet, type, solde, created_by)
     VALUES (?, 'Client', 0, ?)`,
    [effectiveName, createdBy ?? null]
  );
  return { id: Number(result.insertId), name: effectiveName };
}

async function syncComptantDirectRemisePayment(db, {
  bonId,
  contactId,
  contactName,
  remiseIsClient,
  remiseTotal,
  bonStatut,
  createdBy,
}) {
  const paymentGroupId = comptantRemisePaymentGroupId(bonId);
  const isDirect = Number(remiseIsClient) === 1 && Number(contactId) > 0 && Number(remiseTotal) > 0;

  if (!isDirect) {
    await db.execute('DELETE FROM payments WHERE payment_group_id = ?', [paymentGroupId]);
    return;
  }

  const normalizedStatus = String(bonStatut || '').toLowerCase();
  const isCancelled = normalizedStatus.includes('annul') || normalizedStatus === 'avoir';
  const paymentStatus = isCancelled ? 'Annulé' : 'Validé';
  const designation = `Remise bon comptant COM${String(bonId).padStart(4, '0')}`;
  const [existing] = await db.execute(
    'SELECT id FROM payments WHERE payment_group_id = ? ORDER BY id ASC LIMIT 1 FOR UPDATE',
    [paymentGroupId]
  );

  if (existing.length) {
    const paymentId = Number(existing[0].id);
    await db.execute(
      `UPDATE payments SET
         type_paiement = 'Client', contact_id = ?, remise_account_id = NULL,
         remise_account_type = 'direct-client', remise_account_name = ?,
         bon_id = ?, bon_type = 'Comptant', montant_total = ?, mode_paiement = 'Remise',
         designation = ?, statut = ?, updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [contactId, contactName, bonId, remiseTotal, designation, paymentStatus, createdBy ?? null, paymentId]
    );
    await db.execute('DELETE FROM payments WHERE payment_group_id = ? AND id <> ?', [paymentGroupId, paymentId]);
    return;
  }

  const [result] = await db.execute(
    `INSERT INTO payments
      (numero, payment_group_id, type_paiement, contact_id, remise_account_id,
       remise_account_type, remise_account_name, bon_id, bon_type, montant_total,
       mode_paiement, date_paiement, designation, statut, created_by, created_at)
     VALUES ('', ?, 'Client', ?, NULL, 'direct-client', ?, ?, 'Comptant', ?,
             'Remise', NOW(), ?, ?, ?, NOW())`,
    [paymentGroupId, contactId, contactName, bonId, remiseTotal, designation, paymentStatus, createdBy ?? null]
  );
  await db.execute('UPDATE payments SET numero = CAST(id AS CHAR) WHERE id = ?', [result.insertId]);
}

async function sumComptantBonPayments(db, bonComptantId) {
  const [rows] = await db.execute(
    `SELECT COALESCE(SUM(montant), 0) AS total
       FROM paiement_boncomptant_nonpaye
      WHERE bon_comptant_id = ?
        AND LOWER(COALESCE(statut, '')) NOT LIKE 'annul%'`,
    [bonComptantId]
  );
  return Number(rows?.[0]?.total || 0);
}

const roundMoney = (value) => Number((Number(value || 0)).toFixed(2));

const sumPaymentPayloadAmounts = (payments = []) => (
  (Array.isArray(payments) ? payments : []).reduce((sum, payment) => {
    const montant = Number(payment?.montant || 0);
    return sum + (Number.isFinite(montant) && montant > 0 ? montant : 0);
  }, 0)
);

async function assertComptantPaymentsWithinTotal(db, bonComptantId, montantTotal, incomingPayments = [], options = {}) {
  const totalBon = roundMoney(montantTotal);
  const dejaPaye = bonComptantId ? await sumComptantBonPayments(db, bonComptantId) : 0;
  const montantEntrant = sumPaymentPayloadAmounts(incomingPayments);
  const totalPaye = roundMoney(dejaPaye + montantEntrant);
  const reste = Math.max(0, roundMoney(totalBon - dejaPaye));

  if (totalPaye > totalBon + 0.000001) {
    throw Object.assign(
      new Error(`Le total paye (${totalPaye.toFixed(2)} DH) depasse le montant total du bon (${totalBon.toFixed(2)} DH). Reste autorise: ${reste.toFixed(2)} DH`),
      { statusCode: 400 }
    );
  }

  if (options.requireFullPayment && montantEntrant > 0 && totalPaye < totalBon - 0.000001) {
    throw Object.assign(
      new Error(`Le paiement doit etre egal au reste (${reste.toFixed(2)} DH). Montant saisi: ${montantEntrant.toFixed(2)} DH`),
      { statusCode: 400 }
    );
  }
}

async function syncComptantBonReste(db, bonComptantId, montantTotalOverride = null) {
  const bonId = Number(bonComptantId);
  if (!Number.isFinite(bonId) || bonId <= 0) return 0;

  const montantTotal = montantTotalOverride == null
    ? await (async () => {
        const [rows] = await db.execute('SELECT montant_total FROM bons_comptant WHERE id = ? LIMIT 1', [bonId]);
        return Number(rows?.[0]?.montant_total || 0);
      })()
    : Number(montantTotalOverride || 0);

  const montantPaye = await sumComptantBonPayments(db, bonId);
  const reste = Math.max(0, Number((montantTotal - montantPaye).toFixed(2)));
  const nonPaye = reste > 0 ? 1 : 0;
  await db.execute(
    'UPDATE bons_comptant SET reste = ?, non_paye = ?, updated_at = NOW() WHERE id = ?',
    [reste, nonPaye, bonId]
  );
  return reste;
}

/* =========================
   GET /comptant (liste)
   ========================= */
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
  bc.*,
  COALESCE(bc.client_nom, c.nom_complet) AS client_nom,
        v.nom         AS vehicule_nom,
        COALESCE((
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', ci.id,
              'product_id', ci.product_id,
              'variant_id', ci.variant_id,
              'unit_id', ci.unit_id,
              'designation', p.designation,
              'est_service', p.est_service,
              'quantite', ci.quantite,
              'prix_unitaire', ci.prix_unitaire,
              'prix_achat', COALESCE(ps.prix_achat, p.prix_achat),
              'cout_revient', ${averageSnapshotCoutRevientExpr('ci')},
              'remise_pourcentage', ci.remise_pourcentage,
              'remise_montant', COALESCE(NULLIF(ci.remise_montant, 0), (
                SELECT COALESCE(SUM(ir.prix_remise), 0)
                FROM item_remises ir
                WHERE ir.bon_type = 'Comptant'
                  AND ir.bon_id = bc.id
                  AND ir.product_id = ci.product_id
                  AND COALESCE(ir.statut, '') NOT LIKE 'Annul%'
              )),
              'legacy_remise_client_id', (
                SELECT ir.client_remise_id
                FROM item_remises ir
                WHERE ir.bon_type = 'Comptant'
                  AND ir.bon_id = bc.id
                  AND ir.product_id = ci.product_id
                  AND COALESCE(ir.statut, '') NOT LIKE 'Annul%'
                LIMIT 1
              ),
              'total', ci.total,
              'product_snapshot_id', ci.product_snapshot_id
            )
          )
          FROM comptant_items ci
          LEFT JOIN products p ON p.id = ci.product_id
          LEFT JOIN product_snapshot ps ON ps.id = ci.product_snapshot_id
          WHERE ci.bon_comptant_id = bc.id
        ), JSON_ARRAY()) AS items
      FROM bons_comptant bc
  LEFT JOIN contacts  c ON c.id = bc.client_id
      LEFT JOIN vehicules v ON v.id = bc.vehicule_id
      ORDER BY bc.created_at DESC
    `);

    const ids = rows.map(r => r.id);
    let byBonId = new Map();
    if (ids.length) {
      const [livs] = await pool.query(
        `SELECT l.*, v.nom AS vehicule_nom, e.nom_complet AS chauffeur_nom
           FROM livraisons l
           LEFT JOIN vehicules v ON v.id = l.vehicule_id
           LEFT JOIN employees e ON e.id = l.user_id
          WHERE l.bon_type = 'Comptant' AND l.bon_id IN (?)`,
        [ids]
      );
      byBonId = livs.reduce((acc, r) => {
        const arr = acc.get(r.bon_id) || [];
        arr.push(r);
        acc.set(r.bon_id, arr);
        return acc;
      }, new Map());
    }
    let data = rows.map(r => ({
      ...r,
      // numero no longer stored in DB; compute for display
      numero: `COM${String(r.id).padStart(2, '0')}`,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []),
      livraisons: byBonId.get(r.id) || []
    }));
    data = data.map(b => {
      const legacyRemiseId = (b.items || []).find(it => it?.legacy_remise_client_id)?.legacy_remise_client_id;
      if (!legacyRemiseId || b.remise_id) return b;
      return { ...b, remise_is_client: 0, remise_id: legacyRemiseId };
    });

    // Optionnel: calcul serveur (profit/mouvement) si demandé
    const includeCalc = String((_req.query?.includeCalc ?? '')).toLowerCase();
    if (includeCalc === '1' || includeCalc === 'true') {
      data = data.map(b => {
        let profit = 0;
        let totalRemise = 0;
        let costBase = 0;
        const items = (b.items || []).map(it => {
          const q = Number(it?.quantite || 0);
          const pv = Number(it?.prix_unitaire || 0);
          const isService = it?.est_service === true || it?.est_service === 1 || it?.est_service === '1';
          const cost = isService ? 0 : (it?.cout_revient ?? it?.prix_achat ?? 0);
          const remise = Number(it?.remise_montant || 0) * q;
          const itemProfit = (pv - Number(cost || 0)) * q;
          profit += itemProfit;
          totalRemise += remise;
          costBase += Number(cost || 0) * q;
          return { ...it, profit: itemProfit - remise };
        });
        const totalBon = Number(b?.montant_total || 0);
        const profitNet = profit - totalRemise;
        const marginPct = costBase > 0 ? (profitNet / costBase) * 100 : null;
        const mouvement_calc = computeMouvementCalc({ type: 'Comptant', items });
        return { ...b, items, calc: { profitBon: profitNet, totalRemiseBon: totalRemise, netTotalBon: totalBon - totalRemise, marginPct }, mouvement_calc };
      });
    }

    res.json(data);
  } catch (error) {
    console.error('Erreur GET /comptant:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

/* =========================
   GET /comptant/:id (détail)
   ========================= */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(`
      SELECT
  bc.*,
  COALESCE(bc.client_nom, c.nom_complet) AS client_nom,
        v.nom         AS vehicule_nom,
        COALESCE((
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', ci.id,
              'product_id', ci.product_id,
              'variant_id', ci.variant_id,
              'unit_id', ci.unit_id,
              'designation', p.designation,
              'est_service', p.est_service,
              'quantite', ci.quantite,
              'prix_unitaire', ci.prix_unitaire,
              'prix_achat', COALESCE(ps.prix_achat, p.prix_achat),
              'cout_revient', ${averageSnapshotCoutRevientExpr('ci')},
              'remise_pourcentage', ci.remise_pourcentage,
              'remise_montant', COALESCE(NULLIF(ci.remise_montant, 0), (
                SELECT COALESCE(SUM(ir.prix_remise), 0)
                FROM item_remises ir
                WHERE ir.bon_type = 'Comptant'
                  AND ir.bon_id = bc.id
                  AND ir.product_id = ci.product_id
                  AND COALESCE(ir.statut, '') NOT LIKE 'Annul%'
              )),
              'legacy_remise_client_id', (
                SELECT ir.client_remise_id
                FROM item_remises ir
                WHERE ir.bon_type = 'Comptant'
                  AND ir.bon_id = bc.id
                  AND ir.product_id = ci.product_id
                  AND COALESCE(ir.statut, '') NOT LIKE 'Annul%'
                LIMIT 1
              ),
              'total', ci.total,
              'product_snapshot_id', ci.product_snapshot_id
            )
          )
          FROM comptant_items ci
          LEFT JOIN products p ON p.id = ci.product_id
          LEFT JOIN product_snapshot ps ON ps.id = ci.product_snapshot_id
          WHERE ci.bon_comptant_id = bc.id
        ), JSON_ARRAY()) AS items
      FROM bons_comptant bc
  LEFT JOIN contacts  c ON c.id = bc.client_id
      LEFT JOIN vehicules v ON v.id = bc.vehicule_id
      WHERE bc.id = ?
      LIMIT 1
    `, [id]);

    if (rows.length === 0) return res.status(404).json({ message: 'Bon comptant non trouvé' });

    const r = rows[0];
    const [livs] = await pool.query(
      `SELECT l.*, v.nom AS vehicule_nom, e.nom_complet AS chauffeur_nom
         FROM livraisons l
         LEFT JOIN vehicules v ON v.id = l.vehicule_id
         LEFT JOIN employees e ON e.id = l.user_id
        WHERE l.bon_type = 'Comptant' AND l.bon_id = ?`,
      [id]
    );
    const parsedItems = typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []);
    const legacyRemiseId = parsedItems.find(it => it?.legacy_remise_client_id)?.legacy_remise_client_id;
    const data = {
      ...r,
      ...(legacyRemiseId && !r.remise_id ? { remise_is_client: 0, remise_id: legacyRemiseId } : {}),
      numero: `COM${String(r.id).padStart(2, '0')}`,
      items: parsedItems,
      livraisons: livs
    };

    // Optional: include mouvement calculation when requested
    const includeCalc = String((req.query?.includeCalc ?? '')).toLowerCase();
    if (includeCalc === '1' || includeCalc === 'true') {
      data.mouvement_calc = computeMouvementCalc({ type: 'Comptant', items: data.items });
    }

    res.json(data);
  } catch (error) {
    console.error('Erreur GET /comptant/:id:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

/* =========================
   POST /comptant (création)
   ========================= */
/* =========================
   GET /comptant/:id/paiements
   ========================= */
router.get('/:id/paiements', verifyToken, async (req, res) => {
  try {
    await ensureComptantPaymentsTable();
    const bonId = Number(req.params.id);
    if (!Number.isFinite(bonId) || bonId <= 0) {
      return res.status(400).json({ message: 'Bon comptant invalide' });
    }

    const [rows] = await pool.execute(
      `SELECT id, bon_comptant_id, montant, date_paiement, note, statut, created_by, updated_by, created_at, updated_at
         FROM paiement_boncomptant_nonpaye
        WHERE bon_comptant_id = ?
        ORDER BY date_paiement ASC, id ASC`,
      [bonId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Erreur GET /comptant/:id/paiements:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

/* =========================
   POST /comptant/:id/paiements
   ========================= */
router.post('/:id/paiements', verifyToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await ensureComptantPaymentsTable();
    await connection.beginTransaction();

    const bonId = Number(req.params.id);
    const montant = Number(req.body?.montant || 0);
    const datePaiement = normalizeSqlDateTime(req.body?.date_paiement);
    const note = req.body?.note ? String(req.body.note) : null;
    const createdBy = req.body?.created_by != null ? Number(req.body.created_by) : (req.user?.id ?? null);

    if (!Number.isFinite(bonId) || bonId <= 0) {
      await connection.rollback();
      return res.status(400).json({ message: 'Bon comptant invalide' });
    }
    if (!(montant > 0)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Montant invalide' });
    }
    if (!datePaiement) {
      await connection.rollback();
      return res.status(400).json({ message: 'Date de paiement invalide' });
    }

    const [bonRows] = await connection.execute(
      'SELECT id, montant_total, statut FROM bons_comptant WHERE id = ? FOR UPDATE',
      [bonId]
    );
    if (!Array.isArray(bonRows) || !bonRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bon comptant non trouvé' });
    }

    const bon = bonRows[0];
    const bonStatut = String(bon.statut || '').toLowerCase();
    if (bonStatut.includes('annul') || bonStatut === 'avoir') {
      await connection.rollback();
      return res.status(400).json({ message: 'Impossible d ajouter un paiement sur un bon comptant annulé/avoir' });
    }
    const dejaPaye = await sumComptantBonPayments(connection, bonId);
    const montantDisponible = Math.max(0, Number(bon.montant_total || 0) - dejaPaye);
    if (montant > montantDisponible + 0.000001) {
      await connection.rollback();
      return res.status(400).json({ message: `Le paiement dépasse le reste (${montantDisponible.toFixed(2)} DH)` });
    }

    const [result] = await connection.execute(
      `INSERT INTO paiement_boncomptant_nonpaye
        (bon_comptant_id, montant, date_paiement, note, statut, created_by)
       VALUES (?, ?, ?, ?, 'Validé', ?)`,
      [bonId, montant, datePaiement, note, createdBy]
    );

    const reste = await syncComptantBonReste(connection, bonId, bon.montant_total);
    const montantPaye = Math.max(0, Number((Number(bon.montant_total || 0) - reste).toFixed(2)));

    const [rows] = await connection.execute(
      `SELECT id, bon_comptant_id, montant, date_paiement, note, statut, created_by, updated_by, created_at, updated_at
         FROM paiement_boncomptant_nonpaye
        WHERE id = ? LIMIT 1`,
      [result.insertId]
    );

    await connection.commit();
    res.status(201).json({
      ...rows[0],
      bon: {
        id: bonId,
        montant_total: Number(bon.montant_total || 0),
        montant_paye: montantPaye,
        reste,
        non_paye: reste > 0 ? 1 : 0,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur POST /comptant/:id/paiements:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message || String(error) });
  } finally {
    connection.release();
  }
});

/* =========================
   DELETE /comptant/:id/paiements/:paymentId
   ========================= */
router.delete('/:id/paiements/:paymentId', verifyToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await ensureComptantPaymentsTable();
    await connection.beginTransaction();

    const bonId = Number(req.params.id);
    const paymentId = Number(req.params.paymentId);
    if (!Number.isFinite(bonId) || !Number.isFinite(paymentId)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Identifiant invalide' });
    }

    const [rows] = await connection.execute(
      'SELECT id FROM paiement_boncomptant_nonpaye WHERE id = ? AND bon_comptant_id = ?',
      [paymentId, bonId]
    );
    if (!Array.isArray(rows) || !rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Paiement non trouvé' });
    }

    const [bonRows] = await connection.execute(
      'SELECT montant_total FROM bons_comptant WHERE id = ? FOR UPDATE',
      [bonId]
    );
    if (!Array.isArray(bonRows) || !bonRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bon comptant non trouvé' });
    }

    await connection.execute(
      'DELETE FROM paiement_boncomptant_nonpaye WHERE id = ? AND bon_comptant_id = ?',
      [paymentId, bonId]
    );
    const reste = await syncComptantBonReste(connection, bonId, bonRows[0].montant_total);
    const montantTotal = Number(bonRows[0].montant_total || 0);
    const montantPaye = Math.max(0, Number((montantTotal - reste).toFixed(2)));

    await connection.commit();
    res.json({
      success: true,
      id: paymentId,
      bon: {
        id: bonId,
        montant_total: montantTotal,
        montant_paye: montantPaye,
        reste,
        non_paye: reste > 0 ? 1 : 0,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur DELETE /comptant/:id/paiements/:paymentId:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message || String(error) });
  } finally {
    connection.release();
  }
});

router.post('/', forbidRoles('ChefChauffeur'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await ensureBonsComptantMontantIgnorerColumn();
    await ensureComptantPaymentsTable();

  const {
      date_creation,
  client_id,
  client_nom,
      vehicule_id,
      lieu_chargement,
      adresse_livraison,
      montant_total,
      montant_ignorer = 0,
      statut = 'Brouillon',
    items = [],
    created_by,
    livraisons,
    paiements_non_payes = []
    } = req.body || {};

    const isNotCalculated = req.body?.isNotCalculated === true ? true : null;
    const phone = req.body?.phone ?? null;
    const normalizedDateCreation = normalizeSqlDateTime(date_creation);
    const nonPayeRequested = parseBooleanFlag(req.body?.non_paye);

    const remise_is_client = req.body?.remise_is_client;
    const remise_id = req.body?.remise_id;
    const remise_client_nom = req.body?.remise_client_nom;

  // Validation champs requis (détaillée)
  const missing = [];
  if (!normalizedDateCreation) missing.push('date_creation');
  if (!(typeof montant_total === 'number' ? montant_total > 0 : !!montant_total)) missing.push('montant_total');
  if (!created_by) missing.push('created_by');
  if (missing.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'Champs requis manquants', missing });
    }

    let cId  = client_id ?? null;
    let effectiveClientNom = String(client_nom || '').trim() || null;
    const comptantRemiseTotal = computeComptantRemiseTotal(items);
    const wantsDirectComptantRemise = parseBooleanFlag(remise_is_client) && comptantRemiseTotal > 0;
    const exceptionReservation = await reserveBonExceptionAuthorizations({
      db: connection,
      user: req.user,
      clientId: cId,
      amount: Number(montant_total || 0) + Number(montant_ignorer || 0),
      bonType: 'Comptant',
      requested: req.body?.use_exception_authorization,
    });
    const vId  = vehicule_id ?? null;
    const lieu = lieu_chargement ?? null;
    const st   = statut ?? 'Brouillon';
    const montantIgnorer = Number.isFinite(Number(montant_ignorer)) ? Number(montant_ignorer) : 0;

    const resolved = wantsDirectComptantRemise && !cId
      ? { remise_is_client: 1, remise_id: null }
      : await resolveRemiseTarget({
          db: connection,
          clientId: cId,
          remiseIsClient: remise_is_client,
          remiseId: remise_id,
          remiseClientNom: remise_client_nom,
        });
    if (resolved?.error) {
      await connection.rollback();
      return res.status(400).json({ message: resolved.error });
    }

    const [comptantResult] = await connection.execute(`
      INSERT INTO bons_comptant (
        date_creation, client_id, client_nom, phone, vehicule_id,
        lieu_chargement, adresse_livraison, montant_total, montant_ignorer, reste, non_paye, statut, created_by, isNotCalculated,
        remise_is_client, remise_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      normalizedDateCreation,
      cId,
      effectiveClientNom,
      phone,
      vId,
      lieu,
      adresse_livraison ?? null,
      montant_total,
      montantIgnorer,
      nonPayeRequested ? (req.body.reste || 0) : 0,
      nonPayeRequested ? 1 : 0,
      st,
      created_by,
      isNotCalculated,
      resolved.remise_is_client,
      resolved.remise_id,
    ]);

    const comptantId = comptantResult.insertId;
    await recordBonExceptionAuthorizationUsage({
      db: connection,
      reservation: exceptionReservation,
      user: req.user,
      bonType: 'Comptant',
      bonId: comptantId,
    });

    if (wantsDirectComptantRemise && !cId) {
      const createdContact = await createComptantRemiseContact(connection, {
        bonId: comptantId,
        clientNom: effectiveClientNom,
        createdBy: req.user?.id ?? created_by ?? null,
      });
      cId = createdContact.id;
      effectiveClientNom = createdContact.name;
      resolved.remise_id = createdContact.id;
      await connection.execute(
        'UPDATE bons_comptant SET client_id = ?, client_nom = ?, remise_is_client = 1, remise_id = ? WHERE id = ?',
        [createdContact.id, createdContact.name, createdContact.id, comptantId]
      );
    }
    if (wantsDirectComptantRemise && cId && !effectiveClientNom) {
      effectiveClientNom = `client comptant_${Number(comptantId)}`;
      await connection.execute('UPDATE bons_comptant SET client_nom = ? WHERE id = ?', [effectiveClientNom, comptantId]);
    }

    if (Array.isArray(livraisons) && livraisons.length) {
      for (const l of livraisons) {
        const vehiculeId2 = Number(l?.vehicule_id);
        const userId2 = l?.user_id != null ? Number(l.user_id) : null;
        if (!vehiculeId2) continue;
        await connection.execute(
          `INSERT INTO livraisons (bon_type, bon_id, vehicule_id, user_id) VALUES ('Comptant', ?, ?, ?)`,
          [comptantId, vehiculeId2, userId2]
        );
      }
    }

    const remiseExterne = Number(resolved.remise_is_client) === 0
      && Number.isFinite(Number(resolved.remise_id))
      && Number(resolved.remise_id) > 0;
    let montantTotalForPayments = Number(montant_total || 0);

    for (const it of items) {
      const {
        product_id,
        quantite,
        prix_unitaire,
        variant_id,
        unit_id
      } = it || {};
      const remise_pourcentage = remiseExterne ? 0 : (it?.remise_pourcentage ?? 0);
      const remise_montant = remiseExterne ? 0 : (it?.remise_montant ?? 0);
      const total = remiseExterne
        ? Number(quantite || 0) * Number(prix_unitaire || 0)
        : it?.total;

      if (!product_id || quantite == null || prix_unitaire == null || total == null) {
        await connection.rollback();
        return res.status(400).json({ message: 'Item invalide: champs requis manquants' });
      }

      const [productRows] = await connection.execute(
        'SELECT has_variants, is_obligatoire_variant FROM products WHERE id = ?',
        [product_id]
      );
      const p = Array.isArray(productRows) ? productRows[0] : null;
      if (!p) {
        await connection.rollback();
        return res.status(400).json({ message: `Produit introuvable (id=${product_id})` });
      }
      const requiresVariant = Number(p.has_variants) === 1 && Number(p.is_obligatoire_variant) === 1;
      if (requiresVariant && !variant_id) {
        await connection.rollback();
        return res.status(400).json({ message: `Variante obligatoire pour le produit (id=${product_id})` });
      }

      await connection.execute(`
        INSERT INTO comptant_items (
          bon_comptant_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total, variant_id, unit_id, product_snapshot_id, is_indisponible
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [comptantId, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total, variant_id || null, unit_id || null, it.product_snapshot_id || null, it.is_indisponible ? 1 : 0]);
    }

    if (remiseExterne) {
      const recomputed = (Array.isArray(items) ? items : []).reduce(
        (s, r) => s + (Number(r?.quantite || 0) * Number(r?.prix_unitaire || 0)),
        0
      );
      await connection.execute('UPDATE bons_comptant SET montant_total = ? WHERE id = ?', [recomputed, comptantId]);
      montantTotalForPayments = recomputed;
    }

    await syncBonItemRemises({
      db: connection,
      bonId: comptantId,
      bonType: 'Comptant',
      remiseIsClient: resolved.remise_is_client,
      remiseId: resolved.remise_id,
      items,
    });

    if (wantsDirectComptantRemise && cId && !resolved.remise_id) {
      resolved.remise_id = cId;
      await connection.execute('UPDATE bons_comptant SET remise_id = ? WHERE id = ?', [cId, comptantId]);
    }
    await syncComptantDirectRemisePayment(connection, {
      bonId: comptantId,
      contactId: cId,
      contactName: effectiveClientNom || `client comptant_${Number(comptantId)}`,
      remiseIsClient: resolved.remise_is_client,
      remiseTotal: comptantRemiseTotal,
      bonStatut: st,
      createdBy: req.user?.id ?? created_by ?? null,
    });

    const initialNonPayePayments = nonPayeRequested && Array.isArray(paiements_non_payes)
      ? paiements_non_payes
      : [];

    if (initialNonPayePayments.length) {
      await assertComptantPaymentsWithinTotal(connection, null, montantTotalForPayments, initialNonPayePayments);
      for (const paiement of initialNonPayePayments) {
        const montantPaiement = Number(paiement?.montant || 0);
        const datePaiement = normalizeSqlDateTime(paiement?.date_paiement || normalizedDateCreation);
        const notePaiement = paiement?.note ? String(paiement.note) : null;
        if (!(montantPaiement > 0) || !datePaiement) {
          await connection.rollback();
          return res.status(400).json({ message: 'Paiement initial invalide' });
        }
        await connection.execute(
          `INSERT INTO paiement_boncomptant_nonpaye
            (bon_comptant_id, montant, date_paiement, note, statut, created_by)
           VALUES (?, ?, ?, ?, 'Validé', ?)`,
          [comptantId, montantPaiement, datePaiement, notePaiement, created_by ?? null]
        );
      }
    }

    if (nonPayeRequested) {
      await syncComptantBonReste(connection, comptantId, montantTotalForPayments);
    } else {
      await connection.execute('UPDATE bons_comptant SET reste = 0, non_paye = 0 WHERE id = ?', [comptantId]);
    }

    // Stock: Comptant => retire du stock dès la création (même "En attente")
    // Sauf si statut = "Annulé".
    if (st !== 'Annulé') {
      const deltas = buildStockDeltaMaps(items, -1);
      await applyStockDeltas(connection, deltas, req.user?.id ?? created_by ?? null);
      // Deduct snapshot quantities
      for (const item of items) {
        if (item.product_snapshot_id) {
          await connection.execute(
            'UPDATE product_snapshot SET quantite = GREATEST(quantite - ?, 0) WHERE id = ?',
            [Number(item.quantite) || 0, item.product_snapshot_id]
          );
        }
      }
    }

  await connection.commit();
  const numero = `COM${String(comptantId).padStart(2, '0')}`;
  res.status(201).json({ message: 'Bon comptant créé avec succès', id: comptantId, numero });
  } catch (error) {
    await connection.rollback();
    if (error instanceof BonAuthorizationError) {
      return res.status(error.statusCode).json(bonAuthorizationErrorPayload(error));
    }
    console.error('Erreur POST /comptant:', error);
    const status = error?.statusCode && Number.isFinite(Number(error.statusCode)) ? Number(error.statusCode) : 500;
    const msg = status === 500 ? 'Erreur du serveur' : (error?.message || 'Erreur');
    res.status(status).json({ message: msg, error: status === 500 ? (error?.sqlMessage || error?.message || String(error)) : undefined });
  } finally {
    connection.release();
  }
});

/* =========================
   PUT /comptant/:id (mise à jour)
   ========================= */
router.put('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await ensureBonsComptantMontantIgnorerColumn();
    await ensureComptantPaymentsTable();

    const { id } = req.params;
    const userRole = req.user?.role;
    const isChefChauffeur = userRole === 'ChefChauffeur';

    let {
      date_creation,
  client_id,
  client_nom,
      vehicule_id,
      lieu_chargement,
      adresse_livraison,
      montant_total,
      montant_ignorer = 0,
      statut,
    items = [],
    livraisons,
    paiements_non_payes
    } = req.body || {};
    let phone = req.body?.phone ?? null;
    let isNotCalculated = req.body?.isNotCalculated === true ? true : null;

    const remise_is_client = req.body?.remise_is_client;
    const remise_id = req.body?.remise_id;
    const remise_client_nom = req.body?.remise_client_nom;

    const [exists] = await connection.execute('SELECT date_creation, client_id, client_nom, phone, vehicule_id, lieu_chargement, adresse_livraison, montant_total, montant_ignorer, statut, isNotCalculated, remise_is_client, remise_id FROM bons_comptant WHERE id = ? FOR UPDATE', [id]);
    if (!Array.isArray(exists) || exists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bon comptant non trouvé' });
    }
    const oldBon = exists[0];
    const oldStatut = oldBon.statut;

    if (isChefChauffeur && (String(oldStatut) === 'Validé' || String(oldStatut) === 'Annulé')) {
      await connection.rollback();
      return res.status(403).json({ message: 'Accès refusé: modification interdite sur un bon validé/annulé' });
    }

    const [oldItemsStock] = await connection.execute(
      'SELECT product_id, variant_id, unit_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, product_snapshot_id FROM comptant_items WHERE bon_comptant_id = ? ORDER BY id ASC',
      [id]
    );

    if (isChefChauffeur) {
      const incomingItems = Array.isArray(items) ? items : [];
      if (!Array.isArray(oldItemsStock) || oldItemsStock.length === 0) {
        await connection.rollback();
        return res.status(400).json({ message: 'Bon invalide: aucun item existant' });
      }
      if (incomingItems.length !== oldItemsStock.length) {
        await connection.rollback();
        return res.status(403).json({ message: 'Accès refusé: modification des lignes interdite (ajout/suppression)' });
      }

      const sanitizedItems = oldItemsStock.map((oldIt, idx) => {
        const inc = incomingItems[idx] || {};
        const sameProduct = Number(inc.product_id) === Number(oldIt.product_id);
        const sameVariant = (inc.variant_id == null || inc.variant_id === '' ? null : Number(inc.variant_id)) === (oldIt.variant_id == null ? null : Number(oldIt.variant_id));
        const sameUnit = (inc.unit_id == null || inc.unit_id === '' ? null : Number(inc.unit_id)) === (oldIt.unit_id == null ? null : Number(oldIt.unit_id));
        if (!sameProduct || !sameVariant || !sameUnit) {
          throw Object.assign(new Error('Accès refusé: modification des produits/variantes/unités interdite'), { statusCode: 403 });
        }
        const q = Number(inc.quantite);
        if (!Number.isFinite(q) || q <= 0) {
          throw Object.assign(new Error('Quantité invalide'), { statusCode: 400 });
        }
        const pu = Number(oldIt.prix_unitaire) || 0;
        return {
          product_id: oldIt.product_id,
          variant_id: oldIt.variant_id ?? null,
          unit_id: oldIt.unit_id ?? null,
          quantite: q,
          prix_unitaire: pu,
          remise_pourcentage: oldIt.remise_pourcentage ?? 0,
          remise_montant: oldIt.remise_montant ?? 0,
          total: q * pu,
        };
      });

      items = sanitizedItems;
      montant_total = sanitizedItems.reduce((s, r) => s + (Number(r.total) || 0), 0);
      montant_ignorer = oldBon.montant_ignorer;
      date_creation = oldBon.date_creation;
      client_id = oldBon.client_id;
      client_nom = oldBon.client_nom;
      vehicule_id = oldBon.vehicule_id;
      phone = oldBon.phone;
      lieu_chargement = oldBon.lieu_chargement;
      adresse_livraison = oldBon.adresse_livraison;
      statut = oldStatut;
      isNotCalculated = oldBon.isNotCalculated;
      // lock livraisons
      livraisons = undefined;
    }

    const normalizedDateCreation = normalizeSqlDateTime(date_creation);
    const comptantRemiseTotal = computeComptantRemiseTotal(items);
    const wantsDirectComptantRemise = parseBooleanFlag(remise_is_client) && comptantRemiseTotal > 0;
    let cId  = client_id ?? (wantsDirectComptantRemise ? oldBon.client_id : null);
    let effectiveClientNom = String(client_nom || oldBon.client_nom || '').trim() || null;
    if (wantsDirectComptantRemise && !cId) {
      const createdContact = await createComptantRemiseContact(connection, {
        bonId: id,
        clientNom: effectiveClientNom,
        createdBy: req.user?.id ?? null,
      });
      cId = createdContact.id;
      effectiveClientNom = createdContact.name;
    }
    if (wantsDirectComptantRemise && !effectiveClientNom) {
      effectiveClientNom = `client comptant_${Number(id)}`;
    }
    const exceptionReservation = await reserveBonExceptionAuthorizations({
      db: connection,
      user: req.user,
      clientId: cId,
      amount: Number(montant_total || 0) + Number(montant_ignorer || 0),
      bonType: 'Comptant',
      bonId: Number(id),
      existingBon: oldBon,
      requested: req.body?.use_exception_authorization,
    });
    const vId  = vehicule_id ?? null;
    const lieu = lieu_chargement ?? null;
    const st   = statut ?? null;
    const montantIgnorer = Number.isFinite(Number(montant_ignorer)) ? Number(montant_ignorer) : 0;
    const nonPayeRequested = parseBooleanFlag(req.body?.non_paye);

    // Validation minimale (détaillée)
    const missingPut = [];
    if (!normalizedDateCreation) missingPut.push('date_creation');
    if (!(typeof montant_total === 'number' ? true : montant_total != null)) missingPut.push('montant_total');
    if (!statut) missingPut.push('statut');
    if (missingPut.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'Champs requis manquants', missing: missingPut });
    }

    const resolved = isChefChauffeur
      ? { remise_is_client: oldBon.remise_is_client ?? null, remise_id: oldBon.remise_id ?? null }
      : await resolveRemiseTarget({
          db: connection,
          clientId: cId,
          remiseIsClient: remise_is_client,
          remiseId: remise_id,
          remiseClientNom: remise_client_nom,
        });
    if (resolved?.error) {
      await connection.rollback();
      return res.status(400).json({ message: resolved.error });
    }
    if (wantsDirectComptantRemise && cId) {
      resolved.remise_is_client = 1;
      resolved.remise_id = cId;
    }

    const remiseExterneUpd = Number(resolved.remise_is_client) === 0
      && Number.isFinite(Number(resolved.remise_id))
      && Number(resolved.remise_id) > 0;
    const montantTotalForPayments = remiseExterneUpd
      ? (Array.isArray(items) ? items : []).reduce(
          (s, r) => s + (Number(r?.quantite || 0) * Number(r?.prix_unitaire || 0)),
          0
        )
      : Number(montant_total || 0);

    await connection.execute(`
      UPDATE bons_comptant SET
        date_creation = ?, client_id = ?, client_nom = ?, phone = ?,
        vehicule_id = ?, lieu_chargement = ?, adresse_livraison = ?, montant_total = ?, montant_ignorer = ?, reste = ?, non_paye = ?, statut = ?, isNotCalculated = ?,
        remise_is_client = ?, remise_id = ?
      WHERE id = ?
    `, [
      normalizedDateCreation,
      cId,
      effectiveClientNom,
      phone,
      vId,
      lieu,
      adresse_livraison ?? null,
      montantTotalForPayments,
      montantIgnorer,
      nonPayeRequested ? (req.body.reste || 0) : 0,
      nonPayeRequested ? 1 : 0,
      st,
      isNotCalculated,
      resolved.remise_is_client,
      resolved.remise_id,
      id,
    ]);
    await recordBonExceptionAuthorizationUsage({
      db: connection,
      reservation: exceptionReservation,
      user: req.user,
      bonType: 'Comptant',
      bonId: Number(id),
    });

    const nextNonPayePayments = nonPayeRequested && Array.isArray(paiements_non_payes)
      ? paiements_non_payes
      : [];

    if (nonPayeRequested) {
      await assertComptantPaymentsWithinTotal(connection, id, montantTotalForPayments, nextNonPayePayments);
    }

    if (nextNonPayePayments.length) {
      for (const paiement of nextNonPayePayments) {
        const montantPaiement = Number(paiement?.montant || 0);
        const datePaiement = normalizeSqlDateTime(paiement?.date_paiement || normalizedDateCreation);
        const notePaiement = paiement?.note ? String(paiement.note) : null;
        const createdBy = paiement?.created_by != null ? Number(paiement.created_by) : (req.user?.id ?? null);

        if (!(montantPaiement > 0) || !datePaiement) {
          await connection.rollback();
          return res.status(400).json({ message: 'Paiement invalide' });
        }

        await connection.execute(
          `INSERT INTO paiement_boncomptant_nonpaye
            (bon_comptant_id, montant, date_paiement, note, statut, created_by)
           VALUES (?, ?, ?, ?, 'Validé', ?)`,
          [id, montantPaiement, datePaiement, notePaiement, createdBy]
        );
      }
    }

    if (nonPayeRequested) {
      await syncComptantBonReste(connection, id, montantTotalForPayments);
    } else {
      await connection.execute('DELETE FROM paiement_boncomptant_nonpaye WHERE bon_comptant_id = ?', [id]);
      await connection.execute('UPDATE bons_comptant SET reste = 0, non_paye = 0 WHERE id = ?', [id]);
    }

    await connection.execute('DELETE FROM comptant_items WHERE bon_comptant_id = ?', [id]);
    if (Array.isArray(livraisons)) {
      await connection.execute('DELETE FROM livraisons WHERE bon_type = \"Comptant\" AND bon_id = ?', [id]);
      for (const l of livraisons) {
        const vehiculeId2 = Number(l?.vehicule_id);
        const userId2 = l?.user_id != null ? Number(l.user_id) : null;
        if (!vehiculeId2) continue;
        await connection.execute(
          `INSERT INTO livraisons (bon_type, bon_id, vehicule_id, user_id) VALUES ('Comptant', ?, ?, ?)`,
          [Number(id), vehiculeId2, userId2]
        );
      }
    }

    for (const it of items) {
      const {
        product_id,
        quantite,
        prix_unitaire,
        variant_id,
        unit_id
      } = it || {};
      const remise_pourcentage = remiseExterneUpd ? 0 : (it?.remise_pourcentage ?? 0);
      const remise_montant = remiseExterneUpd ? 0 : (it?.remise_montant ?? 0);
      const total = remiseExterneUpd
        ? Number(quantite || 0) * Number(prix_unitaire || 0)
        : it?.total;

      if (!product_id || quantite == null || prix_unitaire == null || total == null) {
        await connection.rollback();
        return res.status(400).json({ message: 'Item invalide: champs requis manquants' });
      }

      const [productRows] = await connection.execute(
        'SELECT has_variants, is_obligatoire_variant FROM products WHERE id = ?',
        [product_id]
      );
      const p = Array.isArray(productRows) ? productRows[0] : null;
      if (!p) {
        await connection.rollback();
        return res.status(400).json({ message: `Produit introuvable (id=${product_id})` });
      }
      const requiresVariant = Number(p.has_variants) === 1 && Number(p.is_obligatoire_variant) === 1;
      if (requiresVariant && !variant_id) {
        await connection.rollback();
        return res.status(400).json({ message: `Variante obligatoire pour le produit (id=${product_id})` });
      }

      await connection.execute(`
        INSERT INTO comptant_items (
          bon_comptant_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total, variant_id, unit_id, product_snapshot_id, is_indisponible
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total, variant_id || null, unit_id || null, it.product_snapshot_id || null, it.is_indisponible ? 1 : 0]);
    }

    if (remiseExterneUpd) {
      const recomputed = (Array.isArray(items) ? items : []).reduce(
        (s, r) => s + (Number(r?.quantite || 0) * Number(r?.prix_unitaire || 0)),
        0
      );
      await connection.execute('UPDATE bons_comptant SET montant_total = ? WHERE id = ?', [recomputed, id]);
    }

    await syncBonItemRemises({
      db: connection,
      bonId: id,
      bonType: 'Comptant',
      remiseIsClient: resolved.remise_is_client,
      remiseId: resolved.remise_id,
      items,
    });

    await syncComptantDirectRemisePayment(connection, {
      bonId: id,
      contactId: cId,
      contactName: effectiveClientNom || `client comptant_${Number(id)}`,
      remiseIsClient: resolved.remise_is_client,
      remiseTotal: comptantRemiseTotal,
      bonStatut: st,
      createdBy: req.user?.id ?? null,
    });

    // Stock: Comptant => effet = -quantite au stock
    // On annule l'effet des anciens items (si pas Annulé), puis on applique les nouveaux (si pas Annulé)
    const deltas = buildStockDeltaMaps([], 1);
    if (oldStatut !== 'Annulé') {
      // revert old: add back
      mergeStockDeltaMaps(deltas, buildStockDeltaMaps(oldItemsStock, +1));
      // Restore old snapshot quantities
      for (const oldItem of oldItemsStock) {
        if (oldItem.product_snapshot_id) {
          await connection.execute(
            'UPDATE product_snapshot SET quantite = quantite + ? WHERE id = ?',
            [Number(oldItem.quantite) || 0, oldItem.product_snapshot_id]
          );
        }
      }
    }
    if (st !== 'Annulé') {
      // apply new: subtract
      mergeStockDeltaMaps(deltas, buildStockDeltaMaps(items, -1));
      // Deduct new snapshot quantities
      for (const item of items) {
        if (item.product_snapshot_id) {
          await connection.execute(
            'UPDATE product_snapshot SET quantite = GREATEST(quantite - ?, 0) WHERE id = ?',
            [Number(item.quantite) || 0, item.product_snapshot_id]
          );
        }
      }
    }
    await applyStockDeltas(connection, deltas, req.user?.id ?? null);

    await connection.commit();
    res.json({ message: 'Bon comptant mis à jour avec succès' });
  } catch (error) {
    await connection.rollback();
    if (error instanceof BonAuthorizationError) {
      return res.status(error.statusCode).json(bonAuthorizationErrorPayload(error));
    }
    console.error('Erreur PUT /comptant/:id:', error);
    const status = error?.statusCode && Number.isFinite(Number(error.statusCode)) ? Number(error.statusCode) : 500;
    const msg = status === 500 ? 'Erreur du serveur' : (error?.message || 'Erreur');
    res.status(status).json({ message: msg, error: status === 500 ? (error?.sqlMessage || error?.message || String(error)) : undefined });
  } finally {
    connection.release();
  }
});

/* =========================
   DELETE /comptant/:id
   ========================= */
router.delete('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    const [exists] = await connection.execute('SELECT statut FROM bons_comptant WHERE id = ? FOR UPDATE', [id]);
    if (!Array.isArray(exists) || exists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bon comptant non trouvé' });
    }

    const oldStatut = exists[0].statut;
    if (oldStatut !== 'Annulé') {
      const [itemsStock] = await connection.execute(
        'SELECT product_id, variant_id, quantite, product_snapshot_id FROM comptant_items WHERE bon_comptant_id = ?',
        [id]
      );
      // Delete should restore stock
      const deltas = buildStockDeltaMaps(itemsStock, +1);
      await applyStockDeltas(connection, deltas, null);
      // Restore snapshot quantities
      for (const sit of itemsStock) {
        if (sit.product_snapshot_id) {
          await connection.execute('UPDATE product_snapshot SET quantite = quantite + ? WHERE id = ?', [Number(sit.quantite) || 0, sit.product_snapshot_id]);
        }
      }
    }

    await connection.execute('DELETE FROM livraisons WHERE bon_type = "Comptant" AND bon_id = ?', [id]);
    await connection.execute('DELETE FROM payments WHERE payment_group_id = ?', [comptantRemisePaymentGroupId(id)]);
    await connection.execute('DELETE FROM comptant_items WHERE bon_comptant_id = ?', [id]);
    await connection.execute('DELETE FROM bons_comptant WHERE id = ?', [id]);

    await connection.commit();
    res.json({ success: true, id: Number(id) });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur DELETE /comptant/:id:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message || String(error) });
  } finally {
    connection.release();
  }
});

/* =========================
   PATCH /comptant/:id/statut
   ========================= */
// PATCH /comptant/:id/statut
router.patch('/:id/statut', verifyToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params;
    const { statut } = req.body;

    if (!statut) {
      await connection.rollback();
      return res.status(400).json({ message: 'Statut requis' });
    }

    const valides = ['Brouillon', 'En attente', 'Validé', 'Livré', 'Annulé'];
    if (!valides.includes(statut)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Statut invalide' });
    }

    const userRole = req.user?.role;
    const isChefChauffeur = userRole === 'ChefChauffeur';

    const [oldRows] = await connection.execute(
      'SELECT statut FROM bons_comptant WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!Array.isArray(oldRows) || oldRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bon comptant non trouvé' });
    }
    const oldStatut = oldRows[0].statut;

    if (isChefChauffeur) {
      const allowed = new Set(['En attente', 'Annulé']);
      if (String(oldStatut) === 'Validé') {
        await connection.rollback();
        return res.status(403).json({ message: 'Accès refusé: bon déjà validé' });
      }
      if (!allowed.has(statut)) {
        await connection.rollback();
        return res.status(403).json({ message: 'Accès refusé: Chef Chauffeur peut فقط En attente / Annulé' });
      }
    }

    // PDG-only for validation
    const lower = String(statut).toLowerCase();
    if (!isChefChauffeur && (lower === 'validé' || lower === 'valid') && userRole !== 'PDG' && userRole !== 'ManagerPlus') {
      await connection.rollback();
      return res.status(403).json({ message: 'Rôle PDG requis pour valider' });
    }
    if (oldStatut === statut) {
      await connection.rollback();
      return res.status(200).json({ success: true, message: 'Aucun changement de statut', data: { id: Number(id), statut } });
    }

    const [result] = await connection.execute(
      'UPDATE bons_comptant SET statut = ?, updated_at = NOW() WHERE id = ?',
      [statut, id]
    );
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bon comptant non trouvé' });
    }

    // Stock: Comptant => effet = -quantite quand pas Annulé
    // Si on passe en Annulé => on restaure (+). Si on sort de Annulé => on retire (-).
    const oldIsCancelled = String(oldStatut || '').toLowerCase().includes('annul');
    const newIsCancelled = String(statut || '').toLowerCase().includes('annul');
    const enteringCancelled = !oldIsCancelled && newIsCancelled;
    const leavingCancelled = oldIsCancelled && !newIsCancelled;
    if (enteringCancelled || leavingCancelled) {
      await ensureComptantPaymentsTable();
      await connection.execute(
        'UPDATE paiement_boncomptant_nonpaye SET statut = ?, updated_by = ?, updated_at = NOW() WHERE bon_comptant_id = ?',
        [enteringCancelled ? 'Annulé' : 'Validé', req.user?.id ?? null, id]
      );
      await connection.execute(
        'UPDATE payments SET statut = ?, updated_by = ?, updated_at = NOW() WHERE payment_group_id = ?',
        [statut, req.user?.id ?? null, comptantRemisePaymentGroupId(id)]
      );
    }
    if (enteringCancelled || leavingCancelled) {
      const [itemsStock] = await connection.execute(
        'SELECT product_id, variant_id, quantite, product_snapshot_id FROM comptant_items WHERE bon_comptant_id = ?',
        [id]
      );
      const deltas = buildStockDeltaMaps(itemsStock, enteringCancelled ? +1 : -1);
      await applyStockDeltas(connection, deltas, req.user?.id ?? null);
      // Restore/deduct snapshot quantities on cancel/uncancel
      for (const sit of itemsStock) {
        if (sit.product_snapshot_id) {
          if (enteringCancelled) {
            await connection.execute('UPDATE product_snapshot SET quantite = quantite + ? WHERE id = ?', [Number(sit.quantite) || 0, sit.product_snapshot_id]);
          } else {
            await connection.execute('UPDATE product_snapshot SET quantite = GREATEST(quantite - ?, 0) WHERE id = ?', [Number(sit.quantite) || 0, sit.product_snapshot_id]);
          }
        }
      }
    }

    await connection.commit();
    res.json({ success: true, message: `Statut mis à jour: ${statut}`, data: { id: Number(id), statut } });
  } catch (error) {
    await connection.rollback();
    console.error('PATCH /comptant/:id/statut', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});


export default router;
/* =========================
   POST /comptant/:id/mark-avoir
   Créer un avoir client depuis un bon comptant et marquer le bon en "Avoir"
   ========================= */
router.post('/:id/mark-avoir', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { created_by } = req.body || {};

    if (!created_by) {
      await connection.rollback();
      return res.status(400).json({ message: 'created_by requis' });
    }

    const [rows] = await connection.execute('SELECT * FROM bons_comptant WHERE id = ? LIMIT 1', [id]);
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bon comptant non trouvé' });
    }
    const bc = rows[0];

  const today = new Date().toISOString().split('T')[0];

    // Vérifier si les colonnes bon_origine_id et bon_origine_type existent
    const [columnsCheck] = await connection.execute(
      "SHOW COLUMNS FROM avoirs_client WHERE Field IN ('bon_origine_id', 'bon_origine_type')"
    );
    const existingColumns = columnsCheck.map(row => row.Field);
    const hasBonOrigineId = existingColumns.includes('bon_origine_id');
    const hasBonOrigineType = existingColumns.includes('bon_origine_type');

    let insertQuery, insertValues;
    if (hasBonOrigineId && hasBonOrigineType) {
      insertQuery = `INSERT INTO avoirs_client (
         date_creation, client_id, bon_origine_id, bon_origine_type,
         lieu_chargement, montant_total, statut, created_by
       ) VALUES (?, ?, ?, 'comptant', ?, ?, 'En attente', ?)`;
      insertValues = [today, bc.client_id ?? null, bc.id, bc.lieu_chargement ?? null, bc.montant_total, created_by];
    } else if (hasBonOrigineId) {
      insertQuery = `INSERT INTO avoirs_client (
         date_creation, client_id, bon_origine_id,
         lieu_chargement, montant_total, statut, created_by
       ) VALUES (?, ?, ?, ?, ?, 'En attente', ?)`;
      insertValues = [today, bc.client_id ?? null, bc.id, bc.lieu_chargement ?? null, bc.montant_total, created_by];
    } else if (hasBonOrigineType) {
      insertQuery = `INSERT INTO avoirs_client (
         date_creation, client_id, bon_origine_type,
         lieu_chargement, montant_total, statut, created_by
       ) VALUES (?, ?, ?, 'comptant', ?, 'En attente', ?)`;
      insertValues = [today, bc.client_id ?? null, bc.lieu_chargement ?? null, bc.montant_total, created_by];
    } else {
      insertQuery = `INSERT INTO avoirs_client (
         date_creation, client_id,
         lieu_chargement, montant_total, statut, created_by
       ) VALUES (?, ?, ?, ?, 'En attente', ?)`;
      insertValues = [today, bc.client_id ?? null, bc.lieu_chargement ?? null, bc.montant_total, created_by];
    }

    const [insAvoir] = await connection.execute(insertQuery, insertValues);
    const avoirId = insAvoir.insertId;
    const finalNumero = `AVC${String(avoirId).padStart(2, '0')}`;

    const [items] = await connection.execute('SELECT * FROM comptant_items WHERE bon_comptant_id = ?', [id]);
    for (const it of items) {
      await connection.execute(
        `INSERT INTO avoir_client_items (
           avoir_client_id, product_id, quantite, prix_unitaire,
           remise_pourcentage, remise_montant, total, variant_id, unit_id, product_snapshot_id, is_indisponible
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          avoirId,
          it.product_id,
          it.quantite,
          it.prix_unitaire,
          it.remise_pourcentage || 0,
          it.remise_montant || 0,
          it.total,
          it.variant_id || null,
          it.unit_id || null,
          it.product_snapshot_id || null,
          it.is_indisponible ? 1 : 0,
        ]
      );
    }

    // Stock: création d'un avoir (client) depuis comptant => on remet le stock (+)
    const deltas = buildStockDeltaMaps(items, +1);
    await applyStockDeltas(connection, deltas, created_by ?? null);
    // Restore snapshot quantities
    for (const it of items) {
      if (it.product_snapshot_id) {
        await connection.execute('UPDATE product_snapshot SET quantite = quantite + ? WHERE id = ?', [Number(it.quantite) || 0, it.product_snapshot_id]);
      }
    }

    await connection.execute('UPDATE bons_comptant SET statut = "Avoir", updated_at = NOW() WHERE id = ?', [id]);
    await connection.execute('DELETE FROM payments WHERE payment_group_id = ?', [comptantRemisePaymentGroupId(id)]);

    await connection.commit();
  return res.json({ success: true, avoir_id: avoirId, numero: finalNumero });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur POST /comptant/:id/mark-avoir:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});
