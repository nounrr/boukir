import express from 'express';
import pool from '../db/pool.js';
import { verifyToken } from '../middleware/auth.js';
import { canManageBon, canValidate } from '../utils/permissions.js';

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
      `SELECT ci.*, p.designation, p.kg AS product_kg
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
        kg: it.product_kg, // pour calcul poids côté frontend
      });
      byCommande.set(it.bon_commande_id, arr);
    }

    const idsLiv = rows.map(r => r.id);
    let byBonId = new Map();
    if (idsLiv.length) {
      const [livs] = await pool.query(
        `SELECT l.*, v.nom AS vehicule_nom, e.nom_complet AS chauffeur_nom
           FROM livraisons l
           LEFT JOIN vehicules v ON v.id = l.vehicule_id
           LEFT JOIN employees e ON e.id = l.user_id
          WHERE l.bon_type = 'Commande' AND l.bon_id IN (?)`,
        [idsLiv]
      );
      byBonId = livs.reduce((acc, r) => {
        const arr = acc.get(r.bon_id) || [];
        arr.push(r);
        acc.set(r.bon_id, arr);
        return acc;
      }, new Map());
    }
    const data = rows.map((r) => ({
      ...r,
      type: 'Commande',
      numero: `CMD${String(r.id).padStart(2, '0')}`,
      items: byCommande.get(r.id) || [],
      livraisons: byBonId.get(r.id) || []
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
      `SELECT ci.*, p.designation, p.kg AS product_kg
         FROM commande_items ci
         LEFT JOIN products p ON p.id = ci.product_id
        WHERE ci.bon_commande_id = ?`,
      [id]
    );

    const [livs] = await pool.query(
      `SELECT l.*, v.nom AS vehicule_nom, e.nom_complet AS chauffeur_nom
         FROM livraisons l
         LEFT JOIN vehicules v ON v.id = l.vehicule_id
         LEFT JOIN employees e ON e.id = l.user_id
        WHERE l.bon_type = 'Commande' AND l.bon_id = ?`,
      [id]
    );
    const data = {
      ...rows[0],
      type: 'Commande',
      numero: `CMD${String(rows[0].id).padStart(2, '0')}`,
      items: items.map((it) => ({
        id: it.id,
        product_id: it.product_id,
        designation: it.designation,
        quantite: it.quantite,
        prix_unitaire: it.prix_unitaire,
        remise_pourcentage: it.remise_pourcentage,
        remise_montant: it.remise_montant,
        total: it.total,
        kg: it.product_kg,
      })),
      livraisons: livs
    };

    res.json(data);
  } catch (error) {
    console.error('Erreur GET /commandes/:id:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});



// POST /commandes - Créer un nouveau bon de commande
router.post('/', verifyToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Permissions: Manager & PDG peuvent créer des commandes
    if (!canManageBon('Commande', req.user?.role)) {
      await connection.rollback();
      return res.status(403).json({ message: 'Accès refusé' });
    }

  const {
      date_creation,
      fournisseur_id,
      vehicule_id,
      lieu_chargement,
  adresse_livraison,
      montant_total,
      statut = 'Brouillon',
      items = [],
    created_by,
    livraisons
    } = req.body || {}; // 👈 évite le crash si req.body est undefined
    const phone = req.body?.phone ?? null;
    const isNotCalculated = req.body?.isNotCalculated === true ? true : null;

    // Validation des champs requis (détaillée)
    const missing = [];
    if (!date_creation) missing.push('date_creation');
    if (!(typeof montant_total === 'number' ? montant_total > 0 : !!montant_total)) missing.push('montant_total');
    if (!created_by) missing.push('created_by');
    if (missing.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'Champs requis manquants', missing });
    }

    // 👇 convertir undefined -> NULL
    const fId = fournisseur_id ?? null;
    const vId = vehicule_id ?? null;
    const lieu = lieu_chargement ?? null;
    const st  = statut ?? 'Brouillon';

    const [commandeResult] = await connection.execute(`
      INSERT INTO bons_commande (
        date_creation, fournisseur_id, phone, vehicule_id,
        lieu_chargement, adresse_livraison, montant_total, statut, created_by, isNotCalculated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [date_creation, fId, phone, vId, lieu, adresse_livraison ?? null, montant_total, st, created_by, isNotCalculated]);

    const commandeId = commandeResult.insertId;

    // Optional livraisons
    if (Array.isArray(livraisons) && livraisons.length) {
      for (const l of livraisons) {
        const vehiculeId2 = Number(l?.vehicule_id);
        const userId2 = l?.user_id != null ? Number(l.user_id) : null;
        if (!vehiculeId2) continue;
        await connection.execute(
          `INSERT INTO livraisons (bon_type, bon_id, vehicule_id, user_id) VALUES ('Commande', ?, ?, ?)`,
          [commandeId, vehiculeId2, userId2]
        );
      }
    }

    // Items (facultatifs)
    for (const item of items) {
      const {
        product_id,
        quantite,
        prix_unitaire, // pour Commande = prix d'achat saisi
        remise_pourcentage = 0,
        remise_montant = 0,
        total,
        variant_id,
        unit_id
      } = item || {};

      // Validation item
      if (!product_id || quantite == null || prix_unitaire == null || total == null) {
        await connection.rollback();
        return res.status(400).json({ message: 'Item invalide: champs requis manquants' });
      }

      await connection.execute(`
        INSERT INTO commande_items (
          bon_commande_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total, variant_id, unit_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [commandeId, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total, variant_id || null, unit_id || null]);

  // (Suppression de la collecte des nouveaux prix d'achat)
    }

  // Désactivé: on ne met plus à jour automatiquement le prix_achat produit (conservation des anciens prix)

  await connection.commit();
  const numero = `CMD${String(commandeId).padStart(2, '0')}`;
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

    const valides = ['Brouillon', 'En attente', 'Validé', 'Livré', 'Facturé', 'Annulé'];
    if (!valides.includes(statut)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Statut invalide' });
    }

    const userRole = req.user?.role;
    const lower = String(statut).toLowerCase();
    if ((lower === 'validé' || lower === 'valid') && !canValidate('Commande', userRole)) {
      await connection.rollback();
      return res.status(403).json({ message: 'Rôle Manager ou PDG requis pour valider' });
    }

    // General modification rights check
    if (!canManageBon('Commande', userRole)) {
      await connection.rollback();
      return res.status(403).json({ message: 'Accès refusé' });
    }

    // Charger ancien statut pour savoir si transition
    const [oldRows] = await connection.execute(`SELECT statut FROM bons_commande WHERE id = ? FOR UPDATE`, [id]);
    if (!Array.isArray(oldRows) || oldRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Commande non trouvée' });
    }
    const oldStatut = oldRows[0].statut;
    if (oldStatut === statut) {
      await connection.rollback();
      return res.status(200).json({ success: true, message: 'Aucun changement de statut', data: { id, statut } });
    }

    // Mettre à jour le statut
    await connection.execute(`UPDATE bons_commande SET statut = ?, updated_at = NOW() WHERE id = ?`, [statut, id]);

    const enteringValidation = oldStatut !== 'Validé' && statut === 'Validé';
    const leavingValidation = oldStatut === 'Validé' && statut !== 'Validé';

    if (enteringValidation || leavingValidation) {
      // Récupérer items + produits
      const [items] = await connection.execute(`
        SELECT ci.id AS ci_id, ci.product_id, ci.prix_unitaire, ci.old_prix_achat, ci.price_applied,
               p.prix_achat AS prod_prix_achat,
               p.cout_revient_pourcentage, p.prix_gros_pourcentage, p.prix_vente_pourcentage,
               p.cout_revient, p.prix_gros, p.prix_vente
          FROM commande_items ci
          JOIN products p ON p.id = ci.product_id
         WHERE ci.bon_commande_id = ?
      `, [id]);

      for (const row of items) {
        const {
          ci_id, product_id, prix_unitaire, old_prix_achat, price_applied,
          prod_prix_achat,
          cout_revient_pourcentage, prix_gros_pourcentage, prix_vente_pourcentage
        } = row;

        if (enteringValidation) {
          if (prix_unitaire > 0 && Number(prix_unitaire) !== Number(prod_prix_achat)) {
            const newPrixAchat = Number(prix_unitaire);
            const oldPrix = Number(prod_prix_achat);
            const newCoutRevient = cout_revient_pourcentage != null ? newPrixAchat * (1 + cout_revient_pourcentage / 100) : row.cout_revient;
            const newPrixGros = prix_gros_pourcentage != null ? newPrixAchat * (1 + prix_gros_pourcentage / 100) : row.prix_gros;
            const newPrixVente = prix_vente_pourcentage != null ? newPrixAchat * (1 + prix_vente_pourcentage / 100) : row.prix_vente;

            // Sauvegarde old prix dans commande_items et marque applied
            await connection.execute(`UPDATE commande_items SET old_prix_achat = ?, price_applied = 1 WHERE id = ?`, [oldPrix, ci_id]);
            // Appliquer au produit
            await connection.execute(`
              UPDATE products
                 SET prix_achat = ?,
                     cout_revient = ?,
                     prix_gros = ?,
                     prix_vente = ?
               WHERE id = ?
            `, [newPrixAchat, newCoutRevient, newPrixGros, newPrixVente, product_id]);
          }
        } else if (leavingValidation) {
          // Revert seulement si on avait appliqué et si le prix produit correspond toujours au prix_unitaire (sécurité)
          if (price_applied === 1 && old_prix_achat != null) {
            // Vérifier prix produit courant
            if (Number(prod_prix_achat) === Number(prix_unitaire)) {
              const revertPrix = Number(old_prix_achat);
              const newCoutRevient = cout_revient_pourcentage != null ? revertPrix * (1 + cout_revient_pourcentage / 100) : row.cout_revient;
              const newPrixGros = prix_gros_pourcentage != null ? revertPrix * (1 + prix_gros_pourcentage / 100) : row.prix_gros;
              const newPrixVente = prix_vente_pourcentage != null ? revertPrix * (1 + prix_vente_pourcentage / 100) : row.prix_vente;

              await connection.execute(`UPDATE products SET prix_achat = ?, cout_revient = ?, prix_gros = ?, prix_vente = ? WHERE id = ?`, [revertPrix, newCoutRevient, newPrixGros, newPrixVente, product_id]);
            }
            // Dans tous les cas on remet le flag (on ne peut revert qu'une fois)
            await connection.execute(`UPDATE commande_items SET price_applied = 0 WHERE id = ?`, [ci_id]);
          }
        }
      }
    }

    // Charger la version enrichie pour réponse
    const [rows] = await connection.execute(`
      SELECT bc.*, f.nom_complet AS fournisseur_nom, v.nom AS vehicule_nom
        FROM bons_commande bc
        LEFT JOIN contacts f ON f.id = bc.fournisseur_id
        LEFT JOIN vehicules v ON v.id = bc.vehicule_id
       WHERE bc.id = ?
    `, [id]);

    await connection.commit();
    res.json({ success: true, message: `Statut mis à jour: ${statut}`, data: rows[0] });
  } catch (error) {
    await connection.rollback();
    console.error('PATCH /commandes/:id/statut', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

// PUT /commandes/:id - Mettre à jour un bon de commande
// PUT /commandes/:id - Mettre à jour un bon de commande
router.put('/:id', verifyToken, async (req, res) => {
    if (!canManageBon('Commande', req.user?.role)) {
      return res.status(403).json({ message: 'Accès refusé' });
    }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
  const {
      date_creation,
      fournisseur_id,
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

    // validations minimales (détaillées)
    const missingPut = [];
    if (!date_creation) missingPut.push('date_creation');
    if (!(typeof montant_total === 'number' ? true : montant_total != null)) missingPut.push('montant_total');
    if (!statut) missingPut.push('statut');
    if (missingPut.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'Champs requis manquants', missing: missingPut });
    }

    // Normalisation: undefined -> null
    const fId = fournisseur_id ?? null;
    const vId = vehicule_id ?? null;
    const lieu = lieu_chargement ?? null;
    const st  = statut ?? 'Brouillon';

  await connection.execute(`
      UPDATE bons_commande
     SET date_creation = ?, fournisseur_id = ?, phone = ?, vehicule_id = ?,
       lieu_chargement = ?, adresse_livraison = ?, montant_total = ?, statut = ?, isNotCalculated = ?, updated_at = NOW()
       WHERE id = ?
  `, [date_creation, fId, phone, vId, lieu, adresse_livraison ?? null, montant_total, st, isNotCalculated, id]);

    // On remplace tous les items
    await connection.execute('DELETE FROM commande_items WHERE bon_commande_id = ?', [id]);
    if (Array.isArray(livraisons)) {
      await connection.execute('DELETE FROM livraisons WHERE bon_type = \"Commande\" AND bon_id = ?', [id]);
      for (const l of livraisons) {
        const vehiculeId2 = Number(l?.vehicule_id);
        const userId2 = l?.user_id != null ? Number(l.user_id) : null;
        if (!vehiculeId2) continue;
        await connection.execute(
          `INSERT INTO livraisons (bon_type, bon_id, vehicule_id, user_id) VALUES ('Commande', ?, ?, ?)`,
          [Number(id), vehiculeId2, userId2]
        );
      }
    }

    for (const item of items) {
      const {
        product_id,
        quantite,
        prix_unitaire,
        remise_pourcentage = 0,
        remise_montant = 0,
        total,
        variant_id,
        unit_id
      } = item || {};

      if (!product_id || quantite == null || prix_unitaire == null || total == null) {
        await connection.rollback();
        return res.status(400).json({ message: 'Item invalide: product_id, quantite, prix_unitaire, total requis' });
      }

      await connection.execute(`
        INSERT INTO commande_items (
          bon_commande_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total, variant_id, unit_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total, variant_id || null, unit_id || null]);
    }

  // Désactivé: pas de synchronisation automatique des prix d'achat lors d'un PUT.

    await connection.commit();
    res.json({ message: 'Bon de commande mis à jour avec succès' });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur lors de la mise à jour du bon de commande:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});


// DELETE /commandes/:id - Supprimer un bon de commande
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!canManageBon('Commande', req.user?.role)) {
      return res.status(403).json({ message: 'Accès refusé' });
    }
    
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

export default router;
