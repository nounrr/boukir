import express from 'express';
import pool from '../db/pool.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

/* ========== GET /devis (liste) ========== */
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        d.*,
        COALESCE(d.client_nom, c.nom_complet) AS client_nom,
        COALESCE((
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', di.id,
              'product_id', di.product_id,
              'designation', p.designation,
              'quantite', di.quantite,
              'prix_unitaire', di.prix_unitaire,
              'remise_pourcentage', di.remise_pourcentage,
              'remise_montant', di.remise_montant,
              'total', di.total
            )
          )
          FROM devis_items di
          LEFT JOIN products p ON p.id = di.product_id
          WHERE di.devis_id = d.id
        ), JSON_ARRAY()) AS items
      FROM devis d
      LEFT JOIN contacts c ON c.id = d.client_id
      ORDER BY d.created_at DESC
    `);

    const data = rows.map(r => ({
      ...r,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || [])
    }));

    res.json(data);
  } catch (error) {
    console.error('Erreur GET /devis:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

/* ========== GET /devis/:id (détail) ========== */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(`
      SELECT
        d.*,
        COALESCE(d.client_nom, c.nom_complet) AS client_nom,
        COALESCE((
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', di.id,
              'product_id', di.product_id,
              'designation', p.designation,
              'quantite', di.quantite,
              'prix_unitaire', di.prix_unitaire,
              'remise_pourcentage', di.remise_pourcentage,
              'remise_montant', di.remise_montant,
              'total', di.total
            )
          )
          FROM devis_items di
          LEFT JOIN products p ON p.id = di.product_id
          WHERE di.devis_id = d.id
        ), JSON_ARRAY()) AS items
      FROM devis d
      LEFT JOIN contacts c ON c.id = d.client_id
      WHERE d.id = ?
      LIMIT 1
    `, [id]);

    if (rows.length === 0) return res.status(404).json({ message: 'Devis non trouvé' });

    const r = rows[0];
    const data = {
      ...r,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || [])
    };

    res.json(data);
  } catch (error) {
    console.error('Erreur GET /devis/:id:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

/* ========== POST /devis (création) ========== */
/* numero auto: dev{ID} */
// --- POST /devis ---
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      date_creation,
      client_id,
      client_nom,
      montant_total,
      statut = 'Brouillon',
  items = [],
  adresse_livraison,
      created_by
    } = req.body || {};
    const phone = req.body?.phone ?? null;
    const isNotCalculated = req.body?.isNotCalculated === true ? true : null;

    // normaliser le lieu
    const lieuBody = req.body?.lieu_chargement;
    const lieu = (typeof lieuBody === 'string' && lieuBody.trim() !== '') ? lieuBody.trim() : null;

    if (!date_creation || !montant_total || !created_by) {
      const missing = [];
      if (!date_creation) missing.push('date_creation');
      if (!(typeof montant_total === 'number' ? montant_total > 0 : !!montant_total)) missing.push('montant_total');
      if (!created_by) missing.push('created_by');
      await connection.rollback();
      return res.status(400).json({ message: 'Champs requis manquants', missing });
    }

    // Validation: il faut soit client_id soit client_nom
    if (!client_id && !client_nom) {
      await connection.rollback();
      return res.status(400).json({ message: 'Il faut spécifier soit un client_id soit un client_nom' });
    }

    const cId = client_id ?? null;
    const cNom = client_nom ? client_nom.trim() : null;
    const st  = statut ?? 'Brouillon';

    const tmpNumero = `tmp-${Date.now()}-${Math.floor(Math.random()*1e6)}`;

    console.log('📦 POST devis payload:', { date_creation, client_id: cId, client_nom: cNom, montant_total, st, lieu });

    const [devisResult] = await connection.execute(`
      INSERT INTO devis (
        numero, date_creation, client_id, client_nom, phone, montant_total, statut, created_by, lieu_chargement, adresse_livraison, isNotCalculated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [tmpNumero, date_creation, cId, cNom, phone, montant_total, st, created_by, lieu, adresse_livraison ?? null, isNotCalculated]);

    const devisId = devisResult.insertId;

    const finalNumero = `dev${devisId}`;
    await connection.execute('UPDATE devis SET numero = ? WHERE id = ?', [finalNumero, devisId]);

    // items...
    for (const it of items) {
      const { product_id, quantite, prix_unitaire, remise_pourcentage = 0, remise_montant = 0, total, variant_id, unit_id } = it;
      if (!product_id || quantite == null || prix_unitaire == null || total == null) {
        await connection.rollback();
        return res.status(400).json({ message: 'Item invalide: champs requis manquants' });
      }
      await connection.execute(`
        INSERT INTO devis_items (
          devis_id, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total, variant_id, unit_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [devisId, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total, variant_id || null, unit_id || null]);
    }

    await connection.commit();
    res.status(201).json({ message: 'Devis créé avec succès', id: devisId, numero: finalNumero });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur POST /devis:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});


/* ========== PUT /devis/:id (mise à jour) ========== */
// --- PUT /devis/:id ---
router.put('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      date_creation,
      client_id,
      client_nom,
      montant_total,
      statut,
      adresse_livraison,
      items = []
    } = req.body || {};
    const phone = req.body?.phone ?? null;
    const isNotCalculated = req.body?.isNotCalculated === true ? true : null;

    // normaliser le lieu
    const lieuBody = req.body?.lieu_chargement;
    const lieu = (typeof lieuBody === 'string' && lieuBody.trim() !== '') ? lieuBody.trim() : null;

    const [exists] = await connection.execute('SELECT id FROM devis WHERE id = ?', [id]);
    if (exists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Devis non trouvé' });
    }

    const cId = client_id ?? null;
    const cNom = client_nom ? client_nom.trim() : null;
    const st  = statut ?? null;

    console.log('🛠️ PUT devis payload:', { id, date_creation, client_id: cId, client_nom: cNom, montant_total, st, lieu });

    await connection.execute(`
      UPDATE devis SET
        date_creation = ?, client_id = ?, client_nom = ?, phone = ?, montant_total = ?, statut = ?, lieu_chargement = ?, adresse_livraison = ?, isNotCalculated = ?
      WHERE id = ?
    `, [date_creation, cId, cNom, phone, montant_total, st, lieu, adresse_livraison ?? null, isNotCalculated, id]);

    await connection.execute('DELETE FROM devis_items WHERE devis_id = ?', [id]);

    for (const it of items) {
      const { product_id, quantite, prix_unitaire, remise_pourcentage = 0, remise_montant = 0, total, variant_id, unit_id } = it;
      if (!product_id || quantite == null || prix_unitaire == null || total == null) {
        await connection.rollback();
        return res.status(400).json({ message: 'Item invalide: champs requis manquants' });
      }
      await connection.execute(`
        INSERT INTO devis_items (
          devis_id, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total, variant_id, unit_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total, variant_id || null, unit_id || null]);
    }

    await connection.commit();
    res.json({ message: 'Devis mis à jour avec succès' });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur PUT /devis/:id:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});


/* ========== PATCH /devis/:id/statut ========== */
router.patch('/:id/statut', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;

    if (!statut) return res.status(400).json({ message: 'Statut requis' });

    // Aligne avec l’ENUM du schéma: ('Brouillon','Envoyé','Accepté','Refusé','Expiré')
    const valides = ['Brouillon', 'Envoyé', 'Accepté', 'Refusé', 'Expiré'];
    if (!valides.includes(statut)) {
      return res.status(400).json({ message: 'Statut invalide' });
    }

    // PDG and ManagerPlus only for validation
    const userRole = req.user?.role;
    const lower = String(statut).toLowerCase();
    if ((lower === 'validé' || lower === 'valid') && userRole !== 'PDG' && userRole !== 'ManagerPlus') {
      return res.status(403).json({ message: 'Rôle PDG ou ManagerPlus requis pour valider' });
    }

    const [result] = await pool.execute(
      'UPDATE devis SET statut = ?, updated_at = NOW() WHERE id = ?',
      [statut, id]
    );

    if (result.affectedRows === 0) return res.status(404).json({ message: 'Devis non trouvé' });

    const [rows] = await pool.execute(`
      SELECT d.*, c.nom_complet AS client_nom
      FROM devis d
      LEFT JOIN contacts c ON c.id = d.client_id
      WHERE d.id = ?
    `, [id]);

    res.json({ success: true, message: `Statut mis à jour: ${statut}`, data: rows[0] });
  } catch (error) {
    console.error('Erreur PATCH /devis/:id/statut:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});


// --- DELETE /devis/:id ---
router.delete('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // existe ?
    const [exists] = await connection.execute('SELECT id FROM devis WHERE id = ?', [id]);
    if (exists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Devis non trouvé' });
    }

    // Si tu n'as PAS ON DELETE CASCADE, garde cette suppression :
    await connection.execute('DELETE FROM devis_items WHERE devis_id = ?', [id]);

    // Supprimer le devis
    await connection.execute('DELETE FROM devis WHERE id = ?', [id]);

    await connection.commit();
    res.json({ success: true, id: Number(id) });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur DELETE /devis/:id:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

/* ========== POST /devis/:id/transform (→ bon de sortie) ========== */
// POST /api/devis/:id/transform
router.post('/:id/transform', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      created_by,
      // legacy name 'target' and new 'target_type' both supported
      target: bodyTarget,
      target_type: bodyTargetType,
      client_id: rawClientId,
      fournisseur_id: rawFournisseurId,
      vehicule_id = null,
      lieu_chargement: rawLieu = null
    } = req.body || {};

    if (!created_by) {
      await connection.rollback();
      return res.status(400).json({ message: 'created_by requis' });
    }

    // 1) Récup devis
    const [devisRows] = await connection.execute('SELECT * FROM devis WHERE id = ?', [id]);
    if (devisRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Devis non trouvé' });
    }
    const devis = devisRows[0];

    // Normaliser le lieu (string non-vide sinon NULL)
    const lieu = (typeof rawLieu === 'string' && rawLieu.trim() !== '') ? rawLieu.trim() : null;

    // 2) Selon la cible
    const today = new Date().toISOString().split('T')[0];
    // Normalize target/casing
    const targetRaw = (bodyTarget ?? bodyTargetType ?? 'sortie');
    const target = (typeof targetRaw === 'string' ? targetRaw.toLowerCase() : 'sortie');
    const client_id = rawClientId != null && rawClientId !== '' ? Number(rawClientId) : null;
    const fournisseur_id = rawFournisseurId != null && rawFournisseurId !== '' ? Number(rawFournisseurId) : null;

    if (target === 'sortie') {
      // client: fourni dans le payload sinon on reuse celui du devis
      const clientId = (client_id ?? devis.client_id);
      if (!clientId) {
        await connection.rollback();
        return res.status(400).json({ message: 'client_id requis pour une transformation en bon de sortie' });
      }

      // Insert en "En attente"
      const [ins] = await connection.execute(`
        INSERT INTO bons_sortie (
          date_creation, client_id, vehicule_id, lieu_chargement,
          montant_total, statut, created_by
        ) VALUES (?, ?, ?, ?, ?, 'En attente', ?)
      `, [today, clientId, vehicule_id, lieu, devis.montant_total, created_by]);

  const sortieId = ins.insertId;
  // Numero non stocké, calculé pour l'affichage uniquement (2 chiffres)
  const numero = `SOR${String(sortieId).padStart(2, '0')}`;

      // Copier les items
      const [items] = await connection.execute('SELECT * FROM devis_items WHERE devis_id = ?', [id]);
      for (const it of items) {
        await connection.execute(`
          INSERT INTO sortie_items (
            bon_sortie_id, product_id, quantite, prix_unitaire,
            remise_pourcentage, remise_montant, total
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [sortieId, it.product_id, it.quantite, it.prix_unitaire, it.remise_pourcentage, it.remise_montant, it.total]);
      }

      // Marquer le devis comme Accepté (si tu veux le forcer ici)
      await connection.execute('UPDATE devis SET statut = "Accepté" WHERE id = ?', [id]);

      await connection.commit();
      return res.json({
        message: 'Devis transformé en bon de sortie',
        type: 'Sortie',
        id: sortieId,
        numero,
        // compat héritage
        sortie_id: sortieId,
        sortie_numero: numero,
      });
    }

  if (target === 'commande') {
      // fournisseur obligatoire
      if (!fournisseur_id) {
        await connection.rollback();
        return res.status(400).json({ message: 'fournisseur_id requis pour une transformation en bon de commande' });
      }

      // Insert en "En attente"
      const [ins] = await connection.execute(`
        INSERT INTO bons_commande (
          date_creation, fournisseur_id, vehicule_id, lieu_chargement,
          montant_total, statut, created_by
        ) VALUES (?, ?, ?, ?, ?, 'En attente', ?)
      `, [today, fournisseur_id, vehicule_id, lieu, devis.montant_total, created_by]);

  const bcId = ins.insertId;
  // Numero non stocké, calculé pour l'affichage uniquement (2 chiffres)
  const numero = `CMD${String(bcId).padStart(2, '0')}`;

      // Copier les items
      const [items] = await connection.execute('SELECT * FROM devis_items WHERE devis_id = ?', [id]);
      for (const it of items) {
        await connection.execute(`
          INSERT INTO commande_items (
            bon_commande_id, product_id, quantite, prix_unitaire,
            remise_pourcentage, remise_montant, total
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [bcId, it.product_id, it.quantite, it.prix_unitaire, it.remise_pourcentage, it.remise_montant, it.total]);
      }

      // Marquer le devis comme Accepté (si tu veux)
      await connection.execute('UPDATE devis SET statut = "Accepté" WHERE id = ?', [id]);

      await connection.commit();
      return res.json({
        message: 'Devis transformé en bon de commande',
        type: 'Commande',
        id: bcId,
        numero,
        // compat héritage
        commande_id: bcId,
        commande_numero: numero,
      });
    }

    // Nouveau: transformation en bon comptant (client optionnel)
    if (target === 'comptant') {
      const [ins] = await connection.execute(`
        INSERT INTO bons_comptant (
          date_creation, client_id, vehicule_id, lieu_chargement,
          montant_total, statut, created_by
        ) VALUES (?, ?, ?, ?, ?, 'En attente', ?)
      `, [today, client_id, vehicule_id, lieu, devis.montant_total, created_by]);

  const bctId = ins.insertId;
  // Numero non stocké, calculé pour l'affichage uniquement (2 chiffres)
  const numero = `COM${String(bctId).padStart(2, '0')}`;

      // Copier les items
      const [items] = await connection.execute('SELECT * FROM devis_items WHERE devis_id = ?', [id]);
      for (const it of items) {
        await connection.execute(`
          INSERT INTO comptant_items (
            bon_comptant_id, product_id, quantite, prix_unitaire,
            remise_pourcentage, remise_montant, total
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [bctId, it.product_id, it.quantite, it.prix_unitaire, it.remise_pourcentage, it.remise_montant, it.total]);
      }

      // Marquer le devis comme Accepté si souhaité
      await connection.execute('UPDATE devis SET statut = "Accepté" WHERE id = ?', [id]);

      await connection.commit();
      return res.json({
        message: 'Devis transformé en bon comptant',
        type: 'Comptant',
        id: bctId,
        numero,
        comptant_id: bctId,
        comptant_numero: numero,
      });
    }

    await connection.rollback();
    return res.status(400).json({ message: 'target invalide (attendu: "sortie", "commande" ou "comptant")' });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur POST /devis/:id/transform:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});


export default router;
