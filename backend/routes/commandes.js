import express from 'express';
import pool from '../db/pool.js';

const router = express.Router();

// GET /commandes - Obtenir tous les bons de commande
// GET /commandes - liste
router.get('/', async (_req, res) => {
  try {
    // 1) Charger les commandes sans fonctions JSON (compat MySQL)
    const [rows] = await pool.query(
      `SELECT bc.*, f.nom_complet AS fournisseur_nom, v.nom AS vehicule_nom
         FROM bons_commande bc
         LEFT JOIN contacts  f ON f.id = bc.fournisseur_id
         LEFT JOIN vehicules v ON v.id = bc.vehicule_id
        ORDER BY bc.created_at DESC`
    );

    if (!rows?.length) return res.json([]);

    // 2) Charger tous les items liés en une requête
    const ids = rows.map((r) => r.id);
    const [items] = await pool.query(
      `SELECT ci.*, p.designation
         FROM commande_items ci
         LEFT JOIN products p ON p.id = ci.product_id
        WHERE ci.bon_commande_id IN (?)`,
      [ids]
    );

    const byCommande = new Map();
    for (const it of items) {
      const arr = byCommande.get(it.bon_commande_id) || [];
      arr.push({
        id: it.id,
        product_id: it.product_id,
        designation: it.designation,
        quantite: it.quantite,
        prix_unitaire: it.prix_unitaire,
        remise_pourcentage: it.remise_pourcentage,
        remise_montant: it.remise_montant,
        total: it.total,
      });
      byCommande.set(it.bon_commande_id, arr);
    }

    const data = rows.map((r) => ({
      ...r,
      type: 'Commande',
      items: byCommande.get(r.id) || [],
    }));

    res.json(data);
  } catch (error) {
    console.error('Erreur GET /commandes:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

// GET /commandes/:id - détail
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 1) Charger la commande
    const [rows] = await pool.query(
      `SELECT bc.*, f.nom_complet AS fournisseur_nom, v.nom AS vehicule_nom
         FROM bons_commande bc
         LEFT JOIN contacts  f ON f.id = bc.fournisseur_id
         LEFT JOIN vehicules v ON v.id = bc.vehicule_id
        WHERE bc.id = ?
        LIMIT 1`,
      [id]
    );

    if (!rows.length) return res.status(404).json({ message: 'Commande non trouvée' });

    // 2) Items de la commande
    const [items] = await pool.query(
      `SELECT ci.*, p.designation
         FROM commande_items ci
         LEFT JOIN products p ON p.id = ci.product_id
        WHERE ci.bon_commande_id = ?`,
      [id]
    );

    const data = {
      ...rows[0],
      type: 'Commande',
      items: items.map((it) => ({
        id: it.id,
        product_id: it.product_id,
        designation: it.designation,
        quantite: it.quantite,
        prix_unitaire: it.prix_unitaire,
        remise_pourcentage: it.remise_pourcentage,
        remise_montant: it.remise_montant,
        total: it.total,
      })),
    };

    res.json(data);
  } catch (error) {
    console.error('Erreur GET /commandes/:id:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});



// POST /commandes - Créer un nouveau bon de commande
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    console.log('Données reçues:', req.body);

    const {
      numero,
      date_creation,
      fournisseur_id,
      vehicule_id,
      lieu_chargement,
      montant_total,
      statut = 'Brouillon',
      items = [],
      created_by
    } = req.body || {}; // 👈 évite le crash si req.body est undefined

    // Validation des champs requis
    if (!numero || !date_creation || !montant_total || !created_by) {
      await connection.rollback();
      return res.status(400).json({ message: 'Champs requis manquants' });
    }

    // 👇 convertir undefined -> NULL
    const fId = fournisseur_id ?? null;
    const vId = vehicule_id ?? null;
    const lieu = lieu_chargement ?? null;
    const st  = statut ?? 'Brouillon';

    const [commandeResult] = await connection.execute(`
      INSERT INTO bons_commande (
        numero, date_creation, fournisseur_id, vehicule_id,
        lieu_chargement, montant_total, statut, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [numero, date_creation, fId, vId, lieu, montant_total, st, created_by]);

    const commandeId = commandeResult.insertId;

    // Items (facultatifs)
    for (const item of items) {
      const {
        product_id,
        quantite,
        prix_unitaire,
        remise_pourcentage = 0,
        remise_montant = 0,
        total
      } = item;

      // petite validation utile
      if (!product_id || quantite == null || prix_unitaire == null || total == null) {
        await connection.rollback();
        return res.status(400).json({ message: 'Item invalide: champs requis manquants' });
      }

      await connection.execute(`
        INSERT INTO commande_items (
          bon_commande_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [commandeId, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total]);
    }

    await connection.commit();
    res.status(201).json({ message: 'Bon de commande créé avec succès', id: commandeId, numero });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur lors de la création du bon de commande:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message || String(error) });
  } finally {
    connection.release();
  }
});

// PATCH /commandes/:id/statut
router.patch('/:id/statut', async (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;

    if (!statut) return res.status(400).json({ message: 'Statut requis' });

    // Statuts valides pour bons_commande
    const valides = ['Brouillon', 'En attente', 'Validé', 'Livré', 'Facturé', 'Annulé'];
    if (!valides.includes(statut)) {
      return res.status(400).json({ message: 'Statut invalide' });
    }

    const [result] = await pool.execute(
      'UPDATE bons_commande SET statut = ?, updated_at = NOW() WHERE id = ?',
      [statut, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Commande non trouvée' });

    // renvoyer l’objet mis à jour (avec noms utiles)
    const [rows] = await pool.execute(`
      SELECT bc.*, f.nom_complet AS fournisseur_nom, v.nom AS vehicule_nom
      FROM bons_commande bc
      LEFT JOIN contacts f ON f.id = bc.fournisseur_id
      LEFT JOIN vehicules v ON v.id = bc.vehicule_id
      WHERE bc.id = ?
    `, [id]);

    res.json({ success: true, message: `Statut mis à jour: ${statut}`, data: rows[0] });
  } catch (error) {
    console.error('PATCH /commandes/:id/statut', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

// PUT /commandes/:id - Mettre à jour un bon de commande
router.put('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    const {
      numero,
      date_creation,
      fournisseur_id,
      vehicule_id,
      lieu_chargement,
      montant_total,
      statut,
      items = []
    } = req.body;

    // Mettre à jour le bon de commande
    await connection.execute(`
      UPDATE bons_commande SET
        numero = ?, date_creation = ?, fournisseur_id = ?,
        vehicule_id = ?, lieu_chargement = ?, montant_total = ?, statut = ?
      WHERE id = ?
    `, [
      numero, date_creation, fournisseur_id,
      vehicule_id, lieu_chargement, montant_total, statut, id
    ]);

    // Supprimer les anciens items
    await connection.execute('DELETE FROM commande_items WHERE bon_commande_id = ?', [id]);

    // Recréer les items
    for (const item of items) {
      const {
        product_id,
        quantite,
        prix_unitaire,
        remise_pourcentage = 0,
        remise_montant = 0,
        total
      } = item;

      await connection.execute(`
        INSERT INTO commande_items (
          bon_commande_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        id, product_id, quantite, prix_unitaire,
        remise_pourcentage, remise_montant, total
      ]);
    }

    await connection.commit();

    res.json({ message: 'Bon de commande mis à jour avec succès' });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur lors de la mise à jour du bon de commande:', error);
    res.status(500).json({ message: 'Erreur du serveur' });
  } finally {
    connection.release();
  }
});

// DELETE /commandes/:id - Supprimer un bon de commande
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [result] = await pool.execute('DELETE FROM bons_commande WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Commande non trouvée' });
    }
    
    res.json({ message: 'Bon de commande supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression du bon de commande:', error);
    res.status(500).json({ message: 'Erreur du serveur' });
  }
});

// PATCH /commandes/:id/statut - Mettre à jour le statut d'une commande
router.patch('/:id/statut', async (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;

    if (!statut) {
      return res.status(400).json({ message: 'Statut requis' });
    }

    // Vérifier que le statut est valide
    const statutsValides = ['Brouillon', 'En attente', 'Validé', 'Livré', 'Annulé'];
    if (!statutsValides.includes(statut)) {
      return res.status(400).json({ message: 'Statut invalide' });
    }

    const [result] = await pool.execute(`
      UPDATE bons_commande 
      SET statut = ?, updated_at = NOW() 
      WHERE id = ?
    `, [statut, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Commande non trouvée' });
    }

    // Récupérer le bon mis à jour
    const [rows] = await pool.execute(`
      SELECT bc.*, f.nom_complet AS fournisseur_nom
      FROM bons_commande bc
      LEFT JOIN contacts f ON f.id = bc.fournisseur_id
      WHERE bc.id = ?
    `, [id]);

    res.json({
      success: true,
      message: `Statut mis à jour vers: ${statut}`,
      data: rows[0]
    });
  } catch (error) {
    console.error('Erreur PATCH /commandes/:id/statut:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

export default router;
