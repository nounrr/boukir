import express from 'express';
import pool from '../db/pool.js';
import { forbidRoles } from '../middleware/auth.js';
import { verifyToken } from '../middleware/auth.js';
import { resolveRemiseTarget } from '../utils/remiseTarget.js';
import { applyStockDeltas, buildStockDeltaMaps, mergeStockDeltaMaps } from '../utils/stock.js';
import { computeMouvementCalc } from '../utils/mouvementCalc.js';

const router = express.Router();

async function ensureComptantPaymentsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS paiement_boncomptant_nonpaye (
      id INT NOT NULL AUTO_INCREMENT,
      bon_comptant_id INT NOT NULL,
      montant DECIMAL(12,2) NOT NULL,
      date_paiement DATETIME NOT NULL,
      note TEXT NULL,
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
}

ensureComptantPaymentsTable().catch((error) => {
  console.error('ensureComptantPaymentsTable:', error);
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

async function sumComptantBonPayments(db, bonComptantId) {
  const [rows] = await db.execute(
    'SELECT COALESCE(SUM(montant), 0) AS total FROM paiement_boncomptant_nonpaye WHERE bon_comptant_id = ?',
    [bonComptantId]
  );
  return Number(rows?.[0]?.total || 0);
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
              'quantite', ci.quantite,
              'prix_unitaire', ci.prix_unitaire,
              'prix_achat', COALESCE(ps.prix_achat, p.prix_achat),
              'cout_revient', COALESCE(ps.cout_revient, p.cout_revient),
              'remise_pourcentage', ci.remise_pourcentage,
              'remise_montant', ci.remise_montant,
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
          const cost = (it?.cout_revient ?? it?.prix_achat ?? 0);
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
              'quantite', ci.quantite,
              'prix_unitaire', ci.prix_unitaire,
              'prix_achat', COALESCE(ps.prix_achat, p.prix_achat),
              'cout_revient', COALESCE(ps.cout_revient, p.cout_revient),
              'remise_pourcentage', ci.remise_pourcentage,
              'remise_montant', ci.remise_montant,
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
    const data = {
      ...r,
      numero: `COM${String(r.id).padStart(2, '0')}`,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []),
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
      `SELECT id, bon_comptant_id, montant, date_paiement, note, created_by, updated_by, created_at, updated_at
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
      'SELECT id, montant_total FROM bons_comptant WHERE id = ? FOR UPDATE',
      [bonId]
    );
    if (!Array.isArray(bonRows) || !bonRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bon comptant non trouvé' });
    }

    const bon = bonRows[0];
    const dejaPaye = await sumComptantBonPayments(connection, bonId);
    const montantDisponible = Math.max(0, Number(bon.montant_total || 0) - dejaPaye);
    if (montant > montantDisponible + 0.000001) {
      await connection.rollback();
      return res.status(400).json({ message: `Le paiement dépasse le reste (${montantDisponible.toFixed(2)} DH)` });
    }

    const [result] = await connection.execute(
      `INSERT INTO paiement_boncomptant_nonpaye
        (bon_comptant_id, montant, date_paiement, note, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [bonId, montant, datePaiement, note, createdBy]
    );

    await syncComptantBonReste(connection, bonId, bon.montant_total);

    const [rows] = await connection.execute(
      `SELECT id, bon_comptant_id, montant, date_paiement, note, created_by, updated_by, created_at, updated_at
         FROM paiement_boncomptant_nonpaye
        WHERE id = ? LIMIT 1`,
      [result.insertId]
    );

    await connection.commit();
    res.status(201).json(rows[0]);
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
    await syncComptantBonReste(connection, bonId, bonRows[0].montant_total);

    await connection.commit();
    res.json({ success: true, id: paymentId });
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

  const {
      date_creation,
  client_id,
  client_nom,
      vehicule_id,
      lieu_chargement,
      adresse_livraison,
      montant_total,
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

    const cId  = client_id ?? null;
    const vId  = vehicule_id ?? null;
    const lieu = lieu_chargement ?? null;
    const st   = statut ?? 'Brouillon';

    const resolved = await resolveRemiseTarget({
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
        lieu_chargement, adresse_livraison, montant_total, reste, non_paye, statut, created_by, isNotCalculated,
        remise_is_client, remise_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      normalizedDateCreation,
      cId,
      client_nom ?? null,
      phone,
      vId,
      lieu,
      adresse_livraison ?? null,
      montant_total,
      nonPayeRequested ? (req.body.reste || 0) : 0,
      nonPayeRequested ? 1 : 0,
      st,
      created_by,
      isNotCalculated,
      resolved.remise_is_client,
      resolved.remise_id,
    ]);

    const comptantId = comptantResult.insertId;

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

    for (const it of items) {
      const {
        product_id,
        quantite,
        prix_unitaire,
        remise_pourcentage = 0,
        remise_montant = 0,
        total,
        variant_id,
        unit_id
      } = it || {};

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

    const initialNonPayePayments = nonPayeRequested && Array.isArray(paiements_non_payes)
      ? paiements_non_payes
      : [];

    if (initialNonPayePayments.length) {
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
            (bon_comptant_id, montant, date_paiement, note, created_by)
           VALUES (?, ?, ?, ?, ?)`,
          [comptantId, montantPaiement, datePaiement, notePaiement, created_by ?? null]
        );
      }
    }

    if (nonPayeRequested) {
      await syncComptantBonReste(connection, comptantId, montant_total);
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
    console.error('Erreur POST /comptant:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message || String(error) });
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

    const [exists] = await connection.execute('SELECT date_creation, client_id, client_nom, phone, vehicule_id, lieu_chargement, adresse_livraison, montant_total, statut, isNotCalculated, remise_is_client, remise_id FROM bons_comptant WHERE id = ? FOR UPDATE', [id]);
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
    const cId  = client_id ?? null;
    const vId  = vehicule_id ?? null;
    const lieu = lieu_chargement ?? null;
    const st   = statut ?? null;
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

    await connection.execute(`
      UPDATE bons_comptant SET
        date_creation = ?, client_id = ?, client_nom = ?, phone = ?,
        vehicule_id = ?, lieu_chargement = ?, adresse_livraison = ?, montant_total = ?, reste = ?, non_paye = ?, statut = ?, isNotCalculated = ?,
        remise_is_client = ?, remise_id = ?
      WHERE id = ?
    `, [
      normalizedDateCreation,
      cId,
      client_nom ?? null,
      phone,
      vId,
      lieu,
      adresse_livraison ?? null,
      montant_total,
      nonPayeRequested ? (req.body.reste || 0) : 0,
      nonPayeRequested ? 1 : 0,
      st,
      isNotCalculated,
      resolved.remise_is_client,
      resolved.remise_id,
      id,
    ]);

    const nextNonPayePayments = nonPayeRequested && Array.isArray(paiements_non_payes)
      ? paiements_non_payes
      : [];

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
            (bon_comptant_id, montant, date_paiement, note, created_by)
           VALUES (?, ?, ?, ?, ?)`,
          [id, montantPaiement, datePaiement, notePaiement, createdBy]
        );
      }
    }

    if (nonPayeRequested) {
      await syncComptantBonReste(connection, id, montant_total);
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
        remise_pourcentage = 0,
        remise_montant = 0,
        total,
        variant_id,
        unit_id
      } = it || {};

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
    const enteringCancelled = oldStatut !== 'Annulé' && statut === 'Annulé';
    const leavingCancelled = oldStatut === 'Annulé' && statut !== 'Annulé';
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
