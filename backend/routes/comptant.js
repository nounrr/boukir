import express from 'express';
import pool from '../db/pool.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

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
              'designation', p.designation,
              'quantite', ci.quantite,
              'prix_unitaire', ci.prix_unitaire,
              'remise_pourcentage', ci.remise_pourcentage,
              'remise_montant', ci.remise_montant,
              'total', ci.total
            )
          )
          FROM comptant_items ci
          LEFT JOIN products p ON p.id = ci.product_id
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
    const data = rows.map(r => ({
      ...r,
      // numero no longer stored in DB; compute for display
      numero: `COM${String(r.id).padStart(2, '0')}`,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []),
      livraisons: byBonId.get(r.id) || []
    }));

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
              'designation', p.designation,
              'quantite', ci.quantite,
              'prix_unitaire', ci.prix_unitaire,
              'remise_pourcentage', ci.remise_pourcentage,
              'remise_montant', ci.remise_montant,
              'total', ci.total
            )
          )
          FROM comptant_items ci
          LEFT JOIN products p ON p.id = ci.product_id
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

    res.json(data);
  } catch (error) {
    console.error('Erreur GET /comptant/:id:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

/* =========================
   POST /comptant (création)
   ========================= */
router.post('/', async (req, res) => {
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
    livraisons
    } = req.body || {};

    const isNotCalculated = req.body?.isNotCalculated === true ? true : null;
    const phone = req.body?.phone ?? null;

  // Validation champs requis (détaillée)
  const missing = [];
  if (!date_creation) missing.push('date_creation');
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

    const [comptantResult] = await connection.execute(`
      INSERT INTO bons_comptant (
        date_creation, client_id, client_nom, phone, vehicule_id,
        lieu_chargement, adresse_livraison, montant_total, statut, created_by, isNotCalculated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [date_creation, cId, client_nom ?? null, phone, vId, lieu, adresse_livraison ?? null, montant_total, st, created_by, isNotCalculated]);

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
        total
      } = it || {};

      if (!product_id || quantite == null || prix_unitaire == null || total == null) {
        await connection.rollback();
        return res.status(400).json({ message: 'Item invalide: champs requis manquants' });
      }

      await connection.execute(`
        INSERT INTO comptant_items (
          bon_comptant_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [comptantId, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total]);
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
  const {
      date_creation,
  client_id,
  client_nom,
      vehicule_id,
      lieu_chargement,
      adresse_livraison,
      montant_total,
      statut,
    items = [],
    livraisons
    } = req.body || {};
    const phone = req.body?.phone ?? null;
    const isNotCalculated = req.body?.isNotCalculated === true ? true : null;

    const [exists] = await connection.execute('SELECT id FROM bons_comptant WHERE id = ?', [id]);
    if (exists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bon comptant non trouvé' });
    }

    const cId  = client_id ?? null;
    const vId  = vehicule_id ?? null;
    const lieu = lieu_chargement ?? null;
    const st   = statut ?? null;

    // Validation minimale (détaillée)
    const missingPut = [];
    if (!date_creation) missingPut.push('date_creation');
    if (!(typeof montant_total === 'number' ? true : montant_total != null)) missingPut.push('montant_total');
    if (!statut) missingPut.push('statut');
    if (missingPut.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'Champs requis manquants', missing: missingPut });
    }

    await connection.execute(`
      UPDATE bons_comptant SET
        date_creation = ?, client_id = ?, client_nom = ?, phone = ?,
        vehicule_id = ?, lieu_chargement = ?, adresse_livraison = ?, montant_total = ?, statut = ?, isNotCalculated = ?
      WHERE id = ?
    `, [date_creation, cId, client_nom ?? null, phone, vId, lieu, adresse_livraison ?? null, montant_total, st, isNotCalculated, id]);

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
        total
      } = it || {};

      if (!product_id || quantite == null || prix_unitaire == null || total == null) {
        await connection.rollback();
        return res.status(400).json({ message: 'Item invalide: champs requis manquants' });
      }

      await connection.execute(`
        INSERT INTO comptant_items (
          bon_comptant_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [id, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total]);
    }

    await connection.commit();
    res.json({ message: 'Bon comptant mis à jour avec succès' });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur PUT /comptant/:id:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message || String(error) });
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

    const [exists] = await connection.execute('SELECT id FROM bons_comptant WHERE id = ?', [id]);
    if (exists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bon comptant non trouvé' });
    }

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
  try {
    const { id } = req.params;
    const { statut } = req.body;

    if (!statut) return res.status(400).json({ message: 'Statut requis' });

    const valides = ['Brouillon', 'En attente', 'Validé', 'Livré', 'Annulé'];
    if (!valides.includes(statut)) {
      return res.status(400).json({ message: 'Statut invalide' });
    }

    // PDG-only for validation
    const userRole = req.user?.role;
    const lower = String(statut).toLowerCase();
    if ((lower === 'validé' || lower === 'valid') && userRole !== 'PDG' && userRole !== 'ManagerPlus') {
      return res.status(403).json({ message: 'Rôle PDG requis pour valider' });
    }

    const [result] = await pool.execute(
      'UPDATE bons_comptant SET statut = ?, updated_at = NOW() WHERE id = ?',
      [statut, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Bon comptant non trouvé' });

    const [rows] = await pool.execute(`
      SELECT bc.*, COALESCE(bc.client_nom, c.nom_complet) AS client_nom, v.nom AS vehicule_nom
      FROM bons_comptant bc
      LEFT JOIN contacts c ON c.id = bc.client_id
      LEFT JOIN vehicules v ON v.id = bc.vehicule_id
      WHERE bc.id = ?
    `, [id]);

    res.json({ success: true, message: `Statut mis à jour: ${statut}`, data: rows[0] });
  } catch (error) {
    console.error('PATCH /comptant/:id/statut', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
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
           avoir_client_id, product_id, quantite, prix_unitaire, total
         ) VALUES (?, ?, ?, ?, ?)`,
        [avoirId, it.product_id, it.quantite, it.prix_unitaire, it.total]
      );
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
