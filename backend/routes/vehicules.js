import express from 'express';
import pool from '../db/pool.js';

const router = express.Router();

// GET /vehicules - Obtenir tous les véhicules
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT * FROM vehicules 
      ORDER BY nom ASC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des véhicules:', error);
    res.status(500).json({ message: 'Erreur du serveur' });
  }
});

// GET /vehicules/disponibles - Obtenir tous les véhicules disponibles
router.get('/disponibles', async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT * FROM vehicules 
      WHERE statut = 'Disponible'
      ORDER BY nom ASC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des véhicules disponibles:', error);
    res.status(500).json({ message: 'Erreur du serveur' });
  }
});

// GET /vehicules/:id - Obtenir un véhicule par ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT * FROM vehicules WHERE id = ?', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Véhicule non trouvé' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Erreur lors de la récupération du véhicule:', error);
    res.status(500).json({ message: 'Erreur du serveur' });
  }
});

// POST /vehicules - Créer un nouveau véhicule
router.post('/', async (req, res) => {
  try {
    const {
      nom,
      marque,
      modele,
      immatriculation,
      annee,
      type_vehicule = 'Camion',
      capacite_charge,
      statut = 'Disponible',
      created_by
    } = req.body;

    // Validation des champs requis
    if (!nom || !immatriculation || !created_by) {
      return res.status(400).json({ message: 'Nom, immatriculation et created_by sont requis' });
    }

    const [result] = await pool.execute(`
      INSERT INTO vehicules (
        nom, marque, modele, immatriculation, annee, type_vehicule, 
        capacite_charge, statut, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      nom, marque, modele, immatriculation, annee, type_vehicule,
      capacite_charge, statut, created_by
    ]);

    // Récupérer le véhicule créé
    const [newVehicule] = await pool.execute('SELECT * FROM vehicules WHERE id = ?', [result.insertId]);
    
    res.status(201).json(newVehicule[0]);
  } catch (error) {
    console.error('Erreur lors de la création du véhicule:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ message: 'Cette immatriculation existe déjà' });
    } else {
      res.status(500).json({ message: 'Erreur du serveur' });
    }
  }
});

// PUT /vehicules/:id - Mettre à jour un véhicule
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nom,
      marque,
      modele,
      immatriculation,
      annee,
      type_vehicule,
      capacite_charge,
      statut,
      updated_by
    } = req.body;

    // Vérifier si le véhicule existe
    const [existingVehicule] = await pool.execute('SELECT * FROM vehicules WHERE id = ?', [id]);
    if (existingVehicule.length === 0) {
      return res.status(404).json({ message: 'Véhicule non trouvé' });
    }

    // Construire la requête de mise à jour dynamiquement
    const updateFields = [];
    const updateValues = [];
    
    const fieldsToUpdate = {
      nom, marque, modele, immatriculation, annee, type_vehicule,
      capacite_charge, statut, updated_by
    };

    Object.entries(fieldsToUpdate).forEach(([key, value]) => {
      if (value !== undefined) {
        updateFields.push(`${key} = ?`);
        updateValues.push(value);
      }
    });

    if (updateFields.length > 0) {
      updateValues.push(id);
      await pool.execute(
        `UPDATE vehicules SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
    }

    // Récupérer le véhicule mis à jour
    const [updatedVehicule] = await pool.execute('SELECT * FROM vehicules WHERE id = ?', [id]);
    res.json(updatedVehicule[0]);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du véhicule:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ message: 'Cette immatriculation existe déjà' });
    } else {
      res.status(500).json({ message: 'Erreur du serveur' });
    }
  }
});

// DELETE /vehicules/:id - Supprimer un véhicule
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Vérifier si le véhicule est utilisé dans des bons
    const [usedInBons] = await pool.execute('SELECT COUNT(*) as count FROM bons WHERE vehicule_id = ?', [id]);
    if (usedInBons[0].count > 0) {
      return res.status(409).json({ 
        message: 'Impossible de supprimer ce véhicule car il est utilisé dans des bons' 
      });
    }

    // Vérifier si le véhicule existe
    const [existingVehicule] = await pool.execute('SELECT * FROM vehicules WHERE id = ?', [id]);
    if (existingVehicule.length === 0) {
      return res.status(404).json({ message: 'Véhicule non trouvé' });
    }

    // Supprimer le véhicule
    await pool.execute('DELETE FROM vehicules WHERE id = ?', [id]);
    res.json({ success: true, id: parseInt(id) });
  } catch (error) {
    console.error('Erreur lors de la suppression du véhicule:', error);
    res.status(500).json({ message: 'Erreur du serveur' });
  }
});

export default router;
