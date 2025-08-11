import express from 'express';
import pool from '../db/pool.js';

const router = express.Router();

// GET /bons - Obtenir tous les bons
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT b.*, 
             c.nom_complet as client_name, 
             f.nom_complet as fournisseur_name,
             JSON_ARRAYAGG(
               JSON_OBJECT(
                 'id', bi.id,
                 'product_id', bi.product_id,
                 'designation', p.designation,
                 'quantite', bi.quantite,
                 'prix_unitaire', bi.prix_unitaire,
                 'remise_pourcentage', bi.remise_pourcentage,
                 'remise_montant', bi.remise_montant,
                 'total', bi.total
               )
             ) as items
      FROM bons b
      LEFT JOIN contacts c ON b.client_id = c.id
      LEFT JOIN contacts f ON b.fournisseur_id = f.id  
      LEFT JOIN bon_items bi ON b.id = bi.bon_id
      LEFT JOIN products p ON bi.product_id = p.id
      GROUP BY b.id, c.nom_complet, f.nom_complet
      ORDER BY b.created_at DESC
    `);
    
    // Parse JSON strings dans les résultats
    const bonsWithItems = rows.map(bon => ({
      ...bon,
      items: bon.items ? JSON.parse(bon.items).filter(item => item.id !== null) : []
    }));
    
    res.json(bonsWithItems);
  } catch (error) {
    console.error('Erreur lors de la récupération des bons:', error);
    res.status(500).json({ message: 'Erreur du serveur' });
  }
});

// GET /bons/type/:type - Obtenir tous les bons d'un type spécifique
router.get('/type/:type', async (req, res) => {
  try {
    const { type } = req.params;
    
    const [rows] = await pool.execute(`
      SELECT b.*, 
             c.nom_complet as client_name, 
             f.nom_complet as fournisseur_name,
             JSON_ARRAYAGG(
               JSON_OBJECT(
                 'id', bi.id,
                 'product_id', bi.product_id,
                 'designation', p.designation,
                 'quantite', bi.quantite,
                 'prix_unitaire', bi.prix_unitaire,
                 'remise_pourcentage', bi.remise_pourcentage,
                 'remise_montant', bi.remise_montant,
                 'total', bi.total
               )
             ) as items
      FROM bons b
      LEFT JOIN contacts c ON b.client_id = c.id
      LEFT JOIN contacts f ON b.fournisseur_id = f.id
      LEFT JOIN bon_items bi ON b.id = bi.bon_id
      LEFT JOIN products p ON bi.product_id = p.id
      WHERE b.type = ?
      GROUP BY b.id, c.nom_complet, f.nom_complet
      ORDER BY b.created_at DESC
    `, [type]);
    
    // Parse JSON strings dans les résultats
    const bonsWithItems = rows.map(bon => ({
      ...bon,
      items: bon.items ? JSON.parse(bon.items).filter(item => item.id !== null) : []
    }));
    
    res.json(bonsWithItems);
  } catch (error) {
    console.error('Erreur lors de la récupération des bons par type:', error);
    res.status(500).json({ message: 'Erreur du serveur' });
  }
});

// GET /bons/:id - Obtenir un bon par ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [rows] = await pool.execute(`
      SELECT b.*, 
             c.nom_complet as client_name, 
             f.nom_complet as fournisseur_name,
             JSON_ARRAYAGG(
               JSON_OBJECT(
                 'id', bi.id,
                 'product_id', bi.product_id,
                 'designation', p.designation,
                 'quantite', bi.quantite,
                 'prix_unitaire', bi.prix_unitaire,
                 'remise_pourcentage', bi.remise_pourcentage,
                 'remise_montant', bi.remise_montant,
                 'total', bi.total
               )
             ) as items
      FROM bons b
      LEFT JOIN contacts c ON b.client_id = c.id
      LEFT JOIN contacts f ON b.fournisseur_id = f.id
      LEFT JOIN bon_items bi ON b.id = bi.bon_id
      LEFT JOIN products p ON bi.product_id = p.id
      WHERE b.id = ?
      GROUP BY b.id, c.nom_complet, f.nom_complet
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Bon non trouvé' });
    }
    
    const bon = {
      ...rows[0],
      items: rows[0].items ? JSON.parse(rows[0].items).filter(item => item.id !== null) : []
    };
    
    res.json(bon);
  } catch (error) {
    console.error('Erreur lors de la récupération du bon:', error);
    res.status(500).json({ message: 'Erreur du serveur' });
  }
});

// POST /bons - Créer un nouveau bon
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const {
      numero,
      type,
      date_creation,
      date_echeance,
      client_id,
      fournisseur_id,
      montant_total,
      statut = 'Brouillon',
      vehicule,
      lieu_chargement,
      bon_origine_id,
      items = [],
      created_by
    } = req.body;

    // Validation des champs requis
    if (!numero || !type || !date_creation || !montant_total || !created_by) {
      await connection.rollback();
      return res.status(400).json({ message: 'Champs requis manquants' });
    }

    // Créer le bon
    const [bonResult] = await connection.execute(`
      INSERT INTO bons (
        numero, type, date_creation, date_echeance, client_id, fournisseur_id, 
        montant_total, statut, vehicule, lieu_chargement, bon_origine_id, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      numero, type, date_creation, date_echeance, client_id, fournisseur_id,
      montant_total, statut, vehicule, lieu_chargement, bon_origine_id, created_by
    ]);

    const bonId = bonResult.insertId;

    // Créer les items du bon
    for (const item of items) {
      await connection.execute(`
        INSERT INTO bon_items (
          bon_id, product_id, designation, quantite, prix_unitaire, 
          remise_pourcentage, remise_montant, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        bonId, item.product_id, item.designation, item.quantite, item.prix_unitaire,
        item.remise_pourcentage || 0, item.remise_montant || 0, item.total
      ]);

      // Mettre à jour le stock pour les sorties et ventes
      if (['Sortie', 'Comptant'].includes(type) && item.product_id) {
        await connection.execute(`
          UPDATE products 
          SET quantite = GREATEST(0, quantite - ?) 
          WHERE id = ?
        `, [item.quantite, item.product_id]);
      }
    }

    await connection.commit();

    // Récupérer le bon créé avec ses items
    const [newBon] = await pool.execute(`
      SELECT b.*, 
             c.nom_complet as client_name, 
             f.nom_complet as fournisseur_name,
             JSON_ARRAYAGG(
               JSON_OBJECT(
                 'id', bi.id,
                 'product_id', bi.product_id,
                 'designation', p.designation,
                 'quantite', bi.quantite,
                 'prix_unitaire', bi.prix_unitaire,
                 'remise_pourcentage', bi.remise_pourcentage,
                 'remise_montant', bi.remise_montant,
                 'total', bi.total
               )
             ) as items
      FROM bons b
      LEFT JOIN contacts c ON b.client_id = c.id
      LEFT JOIN contacts f ON b.fournisseur_id = f.id
      LEFT JOIN bon_items bi ON b.id = bi.bon_id
      LEFT JOIN products p ON bi.product_id = p.id
      WHERE b.id = ?
      GROUP BY b.id, c.nom_complet, f.nom_complet
    `, [bonId]);

    const createdBon = {
      ...newBon[0],
      items: newBon[0].items ? JSON.parse(newBon[0].items).filter(item => item.id !== null) : []
    };

    res.status(201).json(createdBon);
  } catch (error) {
    await connection.rollback();
    console.error('Erreur lors de la création du bon:', error);
    res.status(500).json({ message: 'Erreur du serveur' });
  } finally {
    connection.release();
  }
});

// PATCH /bons/:id - Mettre à jour un bon
router.patch('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    const {
      numero,
      type,
      date_creation,
      date_echeance,
      client_id,
      fournisseur_id,
      montant_total,
      statut,
      vehicule,
      lieu_chargement,
      items = [],
      updated_by
    } = req.body;

    // Validation de l'existence du bon
    const [existingBon] = await connection.execute('SELECT * FROM bons WHERE id = ?', [id]);
    if (existingBon.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bon non trouvé' });
    }

    // Construire la requête de mise à jour dynamiquement
    const updateFields = [];
    const updateValues = [];
    
    const fieldsToUpdate = {
      numero, type, date_creation, date_echeance, client_id, fournisseur_id,
      montant_total, statut, vehicule, lieu_chargement, updated_by
    };

    Object.entries(fieldsToUpdate).forEach(([key, value]) => {
      if (value !== undefined) {
        updateFields.push(`${key} = ?`);
        updateValues.push(value);
      }
    });

    if (updateFields.length > 0) {
      updateValues.push(id);
      await connection.execute(
        `UPDATE bons SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
    }

    // Mettre à jour les items si fournis
    if (items.length > 0) {
      // Supprimer les anciens items
      await connection.execute('DELETE FROM bon_items WHERE bon_id = ?', [id]);
      
      // Créer les nouveaux items
      for (const item of items) {
        await connection.execute(`
          INSERT INTO bon_items (
            bon_id, product_id, designation, quantite, prix_unitaire, 
            remise_pourcentage, remise_montant, total
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          id, item.product_id, item.designation, item.quantite, item.prix_unitaire,
          item.remise_pourcentage || 0, item.remise_montant || 0, item.total
        ]);
      }
    }

    await connection.commit();

    // Récupérer le bon mis à jour
    const [updatedBon] = await pool.execute(`
      SELECT b.*, 
             c.nom_complet as client_name, 
             f.nom_complet as fournisseur_name,
             JSON_ARRAYAGG(
               JSON_OBJECT(
                 'id', bi.id,
                 'product_id', bi.product_id,
                 'designation', p.designation,
                 'quantite', bi.quantite,
                 'prix_unitaire', bi.prix_unitaire,
                 'remise_pourcentage', bi.remise_pourcentage,
                 'remise_montant', bi.remise_montant,
                 'total', bi.total
               )
             ) as items
      FROM bons b
      LEFT JOIN contacts c ON b.client_id = c.id
      LEFT JOIN contacts f ON b.fournisseur_id = f.id
      LEFT JOIN bon_items bi ON b.id = bi.bon_id
      LEFT JOIN products p ON bi.product_id = p.id
      WHERE b.id = ?
      GROUP BY b.id, c.nom_complet, f.nom_complet
    `, [id]);

    const bon = {
      ...updatedBon[0],
      items: updatedBon[0].items ? JSON.parse(updatedBon[0].items).filter(item => item.id !== null) : []
    };

    res.json(bon);
  } catch (error) {
    await connection.rollback();
    console.error('Erreur lors de la mise à jour du bon:', error);
    res.status(500).json({ message: 'Erreur du serveur' });
  } finally {
    connection.release();
  }
});

// DELETE /bons/:id - Supprimer un bon
router.delete('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;

    // Vérifier si le bon existe
    const [existingBon] = await connection.execute('SELECT * FROM bons WHERE id = ?', [id]);
    if (existingBon.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bon non trouvé' });
    }

    // Supprimer les items du bon
    await connection.execute('DELETE FROM bon_items WHERE bon_id = ?', [id]);
    
    // Supprimer le bon
    await connection.execute('DELETE FROM bons WHERE id = ?', [id]);

    await connection.commit();
    res.json({ success: true, id: parseInt(id) });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur lors de la suppression du bon:', error);
    res.status(500).json({ message: 'Erreur du serveur' });
  } finally {
    connection.release();
  }
});

export default router;
