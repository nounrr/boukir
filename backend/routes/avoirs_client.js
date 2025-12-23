import express from 'express';
import pool from '../db/pool.js';
import { verifyToken } from '../middleware/auth.js';
import { applyStockDeltas, buildStockDeltaMaps, mergeStockDeltaMaps } from '../utils/stock.js';

const router = express.Router();

/* =========== GET / (liste) =========== */
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        ac.*,
        c.nom_complet AS client_nom,
        COALESCE((
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', i.id,
              'product_id', i.product_id,
              'variant_id', i.variant_id,
              'unit_id', i.unit_id,
              'designation', p.designation,
              'quantite', i.quantite,
              'prix_unitaire', i.prix_unitaire,
              'remise_pourcentage', i.remise_pourcentage,
              'remise_montant', i.remise_montant,
              'total', i.total
            )
          )
          FROM avoir_client_items i
          LEFT JOIN products p ON p.id = i.product_id
          WHERE i.avoir_client_id = ac.id
        ), JSON_ARRAY()) AS items
      FROM avoirs_client ac
      LEFT JOIN contacts c ON c.id = ac.client_id
      ORDER BY ac.created_at DESC
    `);

    const data = rows.map(r => ({
      ...r,
      // numero is no longer stored; compute display value AVC + zero-padded id
      numero: `AVC${String(r.id).padStart(2, '0')}`,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || [])
    }));

    res.json(data);
  } catch (error) {
    console.error('GET /avoirs_client error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

/* =============== GET /:id (détail) =============== */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(`
      SELECT
        ac.*,
        c.nom_complet AS client_nom,
        COALESCE((
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', i.id,
              'product_id', i.product_id,
              'designation', p.designation,
              'quantite', i.quantite,
              'prix_unitaire', i.prix_unitaire,
              'remise_pourcentage', i.remise_pourcentage,
              'remise_montant', i.remise_montant,
              'total', i.total
            )
          )
          FROM avoir_client_items i
          LEFT JOIN products p ON p.id = i.product_id
          WHERE i.avoir_client_id = ac.id
        ), JSON_ARRAY()) AS items
      FROM avoirs_client ac
      LEFT JOIN contacts c ON c.id = ac.client_id
      WHERE ac.id = ?
      LIMIT 1
    `, [id]);

    if (rows.length === 0) return res.status(404).json({ message: 'Avoir client non trouvé' });

    const r = rows[0];
    const data = {
      ...r,
  numero: `AVC${String(r.id).padStart(2, '0')}`,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || [])
    };

    res.json(data);
  } catch (error) {
    console.error('GET /avoirs_client/:id error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

/* =================== POST / (création) =================== */
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      date_creation,
      client_id,
      lieu_chargement,
      adresse_livraison,
      montant_total,
      statut = 'En attente',            // ✅ aligné avec l'ENUM
      created_by,
      items = []
    } = req.body || {};
    const phone = req.body?.phone ?? null;
    const isNotCalculated = req.body?.isNotCalculated === true ? true : null;

    if (!date_creation || !montant_total || !created_by) {
      await connection.rollback();
      return res.status(400).json({ message: 'Champs requis manquants' });
    }

    const cId  = client_id ?? null;
    const lieu = lieu_chargement ?? null;
    const st   = statut ?? 'En attente';

    const [resAvoir] = await connection.execute(`
      INSERT INTO avoirs_client (
        date_creation, client_id, phone,
        lieu_chargement, adresse_livraison, montant_total, statut, created_by, isNotCalculated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [date_creation, cId, phone, lieu, adresse_livraison ?? null, montant_total, st, created_by, isNotCalculated]);

    const avoirId = resAvoir.insertId;
    const finalNumero = `AVC${String(avoirId).padStart(2, '0')}`;

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
      } = it;

      if (!product_id || quantite == null || prix_unitaire == null || total == null) {
        await connection.rollback();
        return res.status(400).json({ message: 'Item invalide: champs requis manquants' });
      }

      await connection.execute(`
        INSERT INTO avoir_client_items (
          avoir_client_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total, variant_id, unit_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [avoirId, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total, variant_id || null, unit_id || null]);
    }

    // Stock: AvoirClient => inverse de Sortie/Comptant => ajoute au stock dès la création
    // Sauf si statut = "Annulé".
    if (st !== 'Annulé') {
      const deltas = buildStockDeltaMaps(items, +1);
      await applyStockDeltas(connection, deltas, req.user?.id ?? created_by ?? null);
    }

  await connection.commit();
  res.status(201).json({ message: 'Avoir client créé avec succès', id: avoirId, numero: finalNumero });
  } catch (error) {
    await connection.rollback();
    console.error('POST /avoirs_client error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

/* =================== PUT /:id (mise à jour) =================== */
router.put('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      date_creation,
      client_id,
      lieu_chargement,
      adresse_livraison,
      montant_total,
      statut,
      items = []
    } = req.body || {};
    const phone = req.body?.phone ?? null;
    const isNotCalculated = req.body?.isNotCalculated === true ? true : null;

    const [exists] = await connection.execute('SELECT statut FROM avoirs_client WHERE id = ? FOR UPDATE', [id]);
    if (!Array.isArray(exists) || exists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Avoir client non trouvé' });
    }
    const oldStatut = exists[0].statut;

    const [oldItemsStock] = await connection.execute(
      'SELECT product_id, variant_id, quantite FROM avoir_client_items WHERE avoir_client_id = ?',
      [id]
    );

    const cId  = client_id ?? null;
    const lieu = lieu_chargement ?? null;
    const st   = statut ?? null;

    await connection.execute(`
      UPDATE avoirs_client SET
        date_creation = ?, client_id = ?, phone = ?,
        lieu_chargement = ?, adresse_livraison = ?, montant_total = ?, statut = ?, isNotCalculated = ?
      WHERE id = ?
    `, [date_creation, cId, phone, lieu, adresse_livraison ?? null, montant_total, st, isNotCalculated, id]);

    // ✅ bonne colonne FK pour purge des items
    await connection.execute('DELETE FROM avoir_client_items WHERE avoir_client_id = ?', [id]);

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
      } = it;

      if (!product_id || quantite == null || prix_unitaire == null || total == null) {
        await connection.rollback();
        return res.status(400).json({ message: 'Item invalide: champs requis manquants' });
      }

      await connection.execute(`
        INSERT INTO avoir_client_items (
          avoir_client_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total, variant_id, unit_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total, variant_id || null, unit_id || null]);
    }

    // Stock: AvoirClient => effet = +quantite au stock
    // On annule l'effet des anciens items (si pas Annulé), puis on applique les nouveaux (si pas Annulé)
    const deltas = buildStockDeltaMaps([], 1);
    if (oldStatut !== 'Annulé') {
      mergeStockDeltaMaps(deltas, buildStockDeltaMaps(oldItemsStock, -1));
    }
    if (st !== 'Annulé') {
      mergeStockDeltaMaps(deltas, buildStockDeltaMaps(items, +1));
    }
    await applyStockDeltas(connection, deltas, req.user?.id ?? null);

    await connection.commit();
    res.json({ message: 'Avoir client mis à jour avec succès' });
  } catch (error) {
    await connection.rollback();
    console.error('PUT /avoirs_client/:id error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

/* ========== PATCH /:id/statut (changer) ========== */
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

    // ✅ valeurs autorisées pour les avoirs
    const valides = ['En attente', 'Validé', 'Appliqué', 'Annulé'];
    if (!valides.includes(statut)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Statut invalide' });
    }

    // Seul PDG peut valider
    const userRole = req.user?.role;
    const lower = String(statut).toLowerCase();
    if ((lower === 'validé' || lower === 'valid') && userRole !== 'PDG' && userRole !== 'ManagerPlus') {
      await connection.rollback();
      return res.status(403).json({ message: 'Rôle PDG requis pour valider' });
    }

    const [oldRows] = await connection.execute(
      'SELECT statut FROM avoirs_client WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!Array.isArray(oldRows) || oldRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Avoir client non trouvé' });
    }
    const oldStatut = oldRows[0].statut;
    if (oldStatut === statut) {
      await connection.rollback();
      return res.status(200).json({ success: true, message: 'Aucun changement de statut', data: { id: Number(id), statut } });
    }

    const [result] = await connection.execute(
      'UPDATE avoirs_client SET statut = ?, updated_at = NOW() WHERE id = ?',
      [statut, id]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Avoir client non trouvé' });
    }

    // Stock: AvoirClient => effet = +quantite quand pas Annulé
    // Si on passe en Annulé => on retire (-). Si on sort de Annulé => on remet (+).
    const enteringCancelled = oldStatut !== 'Annulé' && statut === 'Annulé';
    const leavingCancelled = oldStatut === 'Annulé' && statut !== 'Annulé';
    if (enteringCancelled || leavingCancelled) {
      const [itemsStock] = await connection.execute(
        'SELECT product_id, variant_id, quantite FROM avoir_client_items WHERE avoir_client_id = ?',
        [id]
      );
      const deltas = buildStockDeltaMaps(itemsStock, enteringCancelled ? -1 : +1);
      await applyStockDeltas(connection, deltas, req.user?.id ?? null);
    }

    const [rows] = await connection.execute(`
      SELECT ac.*, c.nom_complet AS client_nom
      FROM avoirs_client ac
      LEFT JOIN contacts c ON c.id = ac.client_id
      WHERE ac.id = ?
    `, [id]);

    await connection.commit();
    res.json({ success: true, message: `Statut mis à jour: ${statut}`, data: rows[0] });
  } catch (error) {
    await connection.rollback();
    console.error('PATCH /avoirs_client/:id/statut error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

/* =================== DELETE /:id =================== */
router.delete('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    const [exists] = await connection.execute('SELECT statut FROM avoirs_client WHERE id = ? FOR UPDATE', [id]);
    if (!Array.isArray(exists) || exists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Avoir client non trouvé' });
    }

    const oldStatut = exists[0].statut;
    if (oldStatut !== 'Annulé') {
      const [itemsStock] = await connection.execute(
        'SELECT product_id, variant_id, quantite FROM avoir_client_items WHERE avoir_client_id = ?',
        [id]
      );
      // Delete should reverse: remove stock
      const deltas = buildStockDeltaMaps(itemsStock, -1);
      await applyStockDeltas(connection, deltas, null);
    }

    // ✅ bonne colonne FK
    await connection.execute('DELETE FROM avoir_client_items WHERE avoir_client_id = ?', [id]);
    await connection.execute('DELETE FROM avoirs_client WHERE id = ?', [id]);

    await connection.commit();
    res.json({ success: true, id: Number(id) });
  } catch (error) {
    await connection.rollback();
    console.error('DELETE /avoirs_client/:id error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

export default router;
