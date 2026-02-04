import express from 'express';
import pool from '../db/pool.js';
import { verifyToken, forbidRoles } from '../middleware/auth.js';
import { canManageBon, canValidate } from '../utils/permissions.js';
import { applyStockDeltas, buildStockDeltaMaps, mergeStockDeltaMaps } from '../utils/stock.js';

const router = express.Router();

/* ========== GET / (liste) ========== */
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        af.*,
        f.nom_complet AS fournisseur_nom,
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
          FROM avoir_fournisseur_items i
          LEFT JOIN products p ON p.id = i.product_id
          WHERE i.avoir_fournisseur_id = af.id
        ), JSON_ARRAY()) AS items
      FROM avoirs_fournisseur af
      LEFT JOIN contacts f ON f.id = af.fournisseur_id
      ORDER BY af.created_at DESC
    `);

    const data = rows.map(r => ({
      ...r,
      numero: `AVF${String(r.id).padStart(2, '0')}`,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || [])
    }));

    res.json(data);
  } catch (error) {
    console.error('GET /avoirs_fournisseur:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

/* ======= GET /:id (détail) ======= */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(`
      SELECT
        af.*,
        f.nom_complet AS fournisseur_nom,
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
          FROM avoir_fournisseur_items i
          LEFT JOIN products p ON p.id = i.product_id
          WHERE i.avoir_fournisseur_id = af.id
        ), JSON_ARRAY()) AS items
      FROM avoirs_fournisseur af
      LEFT JOIN contacts f ON f.id = af.fournisseur_id
      WHERE af.id = ?
      LIMIT 1
    `, [id]);

    if (rows.length === 0) return res.status(404).json({ message: 'Avoir fournisseur non trouvé' });

    const r = rows[0];
    const data = {
      ...r,
  numero: `AVF${String(r.id).padStart(2, '0')}`,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || [])
    };

    res.json(data);
  } catch (error) {
    console.error('GET /avoirs_fournisseur/:id:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

/* ===== POST / (création) ===== */
router.post('/', verifyToken, forbidRoles('ChefChauffeur'), async (req, res) => {
  if (!canManageBon('AvoirFournisseur', req.user?.role)) {
    return res.status(403).json({ message: 'Accès refusé' });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      // numero auto-généré avf{ID} => on ignore "numero" s'il est envoyé
      date_creation,
      fournisseur_id,
      montant_total,
      statut = 'En attente',
      created_by,
      items = [],
      // tolère snake_case et camelCase
      lieu_chargement: lieuSnake,
      lieuChargement: lieuCamel,
      adresse_livraison: adresseLivSnake,
      adresseLivraison: adresseLivCamel
    } = req.body || {};
    const phone = req.body?.phone ?? null;
    const isNotCalculated = req.body?.isNotCalculated === true ? true : null;

    if (!date_creation || !montant_total || !created_by) {
      await connection.rollback();
      return res.status(400).json({ message: 'Champs requis manquants' });
    }

    const fId  = fournisseur_id ?? null;
    const st   = statut ?? 'En attente';
    let lieu = null;
    if (typeof lieuSnake === 'string' && lieuSnake.trim() !== '') {
      lieu = lieuSnake.trim();
    } else if (typeof lieuCamel === 'string' && lieuCamel.trim() !== '') {
      lieu = lieuCamel.trim();
    }

    let adresseLiv = null;
    if (typeof adresseLivSnake === 'string' && adresseLivSnake.trim() !== '') {
      adresseLiv = adresseLivSnake.trim();
    } else if (typeof adresseLivCamel === 'string' && adresseLivCamel.trim() !== '') {
      adresseLiv = adresseLivCamel.trim();
    }

    const [ins] = await connection.execute(`
      INSERT INTO avoirs_fournisseur (
        date_creation, fournisseur_id, phone, lieu_chargement, adresse_livraison, montant_total, statut, created_by, isNotCalculated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [date_creation, fId, phone, lieu, adresseLiv, montant_total, st, created_by, isNotCalculated]);

    const avoirId = ins.insertId;
    const finalNumero = `AVF${String(avoirId).padStart(2, '0')}`;

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
        INSERT INTO avoir_fournisseur_items (
          avoir_fournisseur_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total, variant_id, unit_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [avoirId, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total, variant_id || null, unit_id || null]);
    }

    // Stock (nouvelle règle): AvoirFournisseur => retire du stock dès la création (inverse de commande)
    // Sauf si créé directement en "Annulé".
    if (st !== 'Annulé') {
      const deltas = buildStockDeltaMaps(items, -1);
      await applyStockDeltas(connection, deltas, req.user?.id ?? null);
    }

  await connection.commit();
  res.status(201).json({ message: 'Avoir fournisseur créé avec succès', id: avoirId, numero: finalNumero });
  } catch (error) {
    await connection.rollback();
    console.error('POST /avoirs_fournisseur:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

/* ==== PUT /:id (mise à jour) ==== */
router.put('/:id', verifyToken, async (req, res) => {
  const userRole = req.user?.role;
  const isChefChauffeur = userRole === 'ChefChauffeur';
  if (!canManageBon('AvoirFournisseur', userRole) && !isChefChauffeur) {
    return res.status(403).json({ message: 'Accès refusé' });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    let {
      date_creation,
      fournisseur_id,
      montant_total,
      statut,
      items = [],
      lieu_chargement: lieuSnake,
      lieuChargement: lieuCamel,
      adresse_livraison: adresseLivSnake,
      adresseLivraison: adresseLivCamel
  } = req.body || {};
    let phone = req.body?.phone ?? null;
    let isNotCalculated = req.body?.isNotCalculated === true ? true : null;

    const [exists] = await connection.execute('SELECT date_creation, fournisseur_id, phone, lieu_chargement, adresse_livraison, montant_total, statut, isNotCalculated FROM avoirs_fournisseur WHERE id = ? FOR UPDATE', [id]);
    if (!Array.isArray(exists) || exists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Avoir fournisseur non trouvé' });
    }
    const oldBon = exists[0];
    const oldStatut = oldBon.statut;

    if (isChefChauffeur && (String(oldStatut) === 'Validé' || String(oldStatut) === 'Annulé')) {
      await connection.rollback();
      return res.status(403).json({ message: 'Accès refusé: modification interdite sur un avoir validé/annulé' });
    }

    const [oldItemsStock] = await connection.execute(
      'SELECT product_id, variant_id, unit_id, quantite, prix_unitaire, remise_pourcentage, remise_montant FROM avoir_fournisseur_items WHERE avoir_fournisseur_id = ? ORDER BY id ASC',
      [id]
    );

    if (isChefChauffeur) {
      const incomingItems = Array.isArray(items) ? items : [];
      if (!Array.isArray(oldItemsStock) || oldItemsStock.length === 0) {
        await connection.rollback();
        return res.status(400).json({ message: 'Avoir invalide: aucun item existant' });
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
      fournisseur_id = oldBon.fournisseur_id;
      phone = oldBon.phone;
      statut = oldStatut;
      isNotCalculated = oldBon.isNotCalculated;
      // lock address fields
      lieuSnake = oldBon.lieu_chargement;
      lieuCamel = undefined;
      adresseLivSnake = oldBon.adresse_livraison;
      adresseLivCamel = undefined;
    }

    const fId  = fournisseur_id ?? null;
    const st   = statut ?? null;
    let lieu = null;
    if (typeof lieuSnake === 'string' && lieuSnake.trim() !== '') {
      lieu = lieuSnake.trim();
    } else if (typeof lieuCamel === 'string' && lieuCamel.trim() !== '') {
      lieu = lieuCamel.trim();
    }

    let adresseLiv = null;
    if (typeof adresseLivSnake === 'string' && adresseLivSnake.trim() !== '') {
      adresseLiv = adresseLivSnake.trim();
    } else if (typeof adresseLivCamel === 'string' && adresseLivCamel.trim() !== '') {
      adresseLiv = adresseLivCamel.trim();
    }

    await connection.execute(`
      UPDATE avoirs_fournisseur SET
        date_creation = ?, fournisseur_id = ?, phone = ?, lieu_chargement = ?, adresse_livraison = ?, montant_total = ?, statut = ?, isNotCalculated = ?
      WHERE id = ?
    `, [date_creation, fId, phone, lieu, adresseLiv, montant_total, st, isNotCalculated, id]);

    await connection.execute('DELETE FROM avoir_fournisseur_items WHERE avoir_fournisseur_id = ?', [id]);

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
        INSERT INTO avoir_fournisseur_items (
          avoir_fournisseur_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total, variant_id, unit_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total, variant_id || null, unit_id || null]);
    }

    // Stock: annuler l'effet des anciens items (si pas Annulé), puis appliquer les nouveaux (si pas Annulé)
    // AvoirFournisseur => effet = -quantite au stock
    const deltas = buildStockDeltaMaps([], 1);
    if (oldStatut !== 'Annulé') {
      // On remet le stock (inverse de l'effet appliqué)
      mergeStockDeltaMaps(deltas, buildStockDeltaMaps(oldItemsStock, +1));
    }
    if (st !== 'Annulé') {
      // On retire le stock selon les nouveaux items
      mergeStockDeltaMaps(deltas, buildStockDeltaMaps(items, -1));
    }
    await applyStockDeltas(connection, deltas, req.user?.id ?? null);

    await connection.commit();
    res.json({ message: 'Avoir fournisseur mis à jour avec succès' });
  } catch (error) {
    await connection.rollback();
    console.error('PUT /avoirs_fournisseur/:id:', error);
    const status = error?.statusCode && Number.isFinite(Number(error.statusCode)) ? Number(error.statusCode) : 500;
    const msg = status === 500 ? 'Erreur du serveur' : (error?.message || 'Erreur');
    res.status(status).json({ message: msg, error: status === 500 ? (error?.sqlMessage || error?.message) : undefined });
  } finally {
    connection.release();
  }
});

/* == PATCH /:id/statut (changer) == */
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

    const valides = ['En attente', 'Validé', 'Appliqué', 'Annulé'];
    if (!valides.includes(statut)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Statut invalide' });
    }

    const userRole = req.user?.role;
    const isChefChauffeur = userRole === 'ChefChauffeur';

    const [oldRows] = await connection.execute(
      'SELECT statut FROM avoirs_fournisseur WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!Array.isArray(oldRows) || oldRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Avoir fournisseur non trouvé' });
    }
    const oldStatut = oldRows[0].statut;

    if (isChefChauffeur) {
      const allowed = new Set(['En attente', 'Annulé']);
      if (String(oldStatut) === 'Validé') {
        await connection.rollback();
        return res.status(403).json({ message: 'Accès refusé: avoir déjà validé' });
      }
      if (!allowed.has(statut)) {
        await connection.rollback();
        return res.status(403).json({ message: 'Accès refusé: Chef Chauffeur peut فقط En attente / Annulé' });
      }
    }

    const lower = String(statut).toLowerCase();
    if (!isChefChauffeur && (lower === 'validé' || lower === 'valid') && !canValidate('AvoirFournisseur', userRole)) {
      await connection.rollback();
      return res.status(403).json({ message: 'Rôle Manager ou PDG requis pour valider' });
    }
    if (!isChefChauffeur && !canManageBon('AvoirFournisseur', userRole)) {
      await connection.rollback();
      return res.status(403).json({ message: 'Accès refusé' });
    }
    if (oldStatut === statut) {
      await connection.rollback();
      return res.status(200).json({ success: true, message: 'Aucun changement de statut', data: { id: Number(id), statut } });
    }

    await connection.execute(
      'UPDATE avoirs_fournisseur SET statut = ?, updated_at = NOW() WHERE id = ?',
      [statut, id]
    );

    // Stock: AvoirFournisseur => appliqué quand statut != Annulé (effet = -quantite)
    // En Annulé => on restaure (+quantite)
    const enteringCancelled = oldStatut !== 'Annulé' && statut === 'Annulé';
    const leavingCancelled = oldStatut === 'Annulé' && statut !== 'Annulé';
    if (enteringCancelled || leavingCancelled) {
      const [itemsStock] = await connection.execute(
        'SELECT product_id, variant_id, quantite FROM avoir_fournisseur_items WHERE avoir_fournisseur_id = ?',
        [id]
      );
      const deltas = buildStockDeltaMaps(itemsStock, enteringCancelled ? +1 : -1);
      await applyStockDeltas(connection, deltas, req.user?.id ?? null);
    }

    const [rows] = await connection.execute(`
      SELECT af.*, f.nom_complet AS fournisseur_nom
      FROM avoirs_fournisseur af
      LEFT JOIN contacts f ON f.id = af.fournisseur_id
      WHERE af.id = ?
    `, [id]);

    await connection.commit();
    res.json({ success: true, message: `Statut mis à jour: ${statut}`, data: rows[0] });
  } catch (error) {
    await connection.rollback();
    console.error('PATCH /avoirs_fournisseur/:id/statut:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

/* ====== DELETE /:id ====== */
router.delete('/:id', verifyToken, async (req, res) => {
  if (!canManageBon('AvoirFournisseur', req.user?.role)) {
    return res.status(403).json({ message: 'Accès refusé' });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    const [exists] = await connection.execute('SELECT statut FROM avoirs_fournisseur WHERE id = ? FOR UPDATE', [id]);
    if (!Array.isArray(exists) || exists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Avoir fournisseur non trouvé' });
    }

    const oldStatut = exists[0].statut;
    if (oldStatut !== 'Annulé') {
      const [itemsStock] = await connection.execute(
        'SELECT product_id, variant_id, quantite FROM avoir_fournisseur_items WHERE avoir_fournisseur_id = ?',
        [id]
      );
      // Reverse: avoir creation removed stock, so delete must add it back
      const deltas = buildStockDeltaMaps(itemsStock, +1);
      await applyStockDeltas(connection, deltas, req.user?.id ?? null);
    }

    await connection.execute('DELETE FROM avoir_fournisseur_items WHERE avoir_fournisseur_id = ?', [id]);
    await connection.execute('DELETE FROM avoirs_fournisseur WHERE id = ?', [id]);

    await connection.commit();
    res.json({ success: true, id: Number(id) });
  } catch (error) {
    await connection.rollback();
    console.error('DELETE /avoirs_fournisseur/:id:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

export default router;
