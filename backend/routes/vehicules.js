import express from 'express';
import pool from '../db/pool.js';

const router = express.Router();

async function hasColumn(tableName, columnName) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS c
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

async function tableExists(tableName) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS c
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?`,
    [tableName]
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

// GET /vehicules - Obtenir tous les véhicules
router.get('/', async (req, res) => {
  try {
    const supportsSoftDelete = await hasColumn('vehicules', 'deleted_at');
    const [rows] = await pool.execute(
      supportsSoftDelete
        ? `SELECT * FROM vehicules WHERE deleted_at IS NULL ORDER BY nom ASC`
        : `SELECT * FROM vehicules ORDER BY nom ASC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des véhicules:', error);
    res.status(500).json({ message: 'Erreur du serveur' });
  }
});

// GET /vehicules/disponibles - Obtenir tous les véhicules disponibles
router.get('/disponibles', async (req, res) => {
  try {
    const supportsSoftDelete = await hasColumn('vehicules', 'deleted_at');
    const [rows] = await pool.execute(
      supportsSoftDelete
        ? `SELECT * FROM vehicules WHERE statut = 'Disponible' AND deleted_at IS NULL ORDER BY nom ASC`
        : `SELECT * FROM vehicules WHERE statut = 'Disponible' ORDER BY nom ASC`
    );
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
    const supportsSoftDelete = await hasColumn('vehicules', 'deleted_at');
    const [rows] = await pool.execute(
      supportsSoftDelete
        ? 'SELECT * FROM vehicules WHERE id = ? AND deleted_at IS NULL'
        : 'SELECT * FROM vehicules WHERE id = ?',
      [id]
    );
    
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
    if (!nom || !immatriculation) {
      return res.status(400).json({ message: 'Nom et immatriculation sont requis' });
    }

    // Déterminer dynamiquement les colonnes disponibles pour éviter les erreurs sur anciens schémas
    const [cols] = await pool.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicules'`
    );
    const colSet = new Set(cols.map((r) => r.COLUMN_NAME));

    const desired = [
      ['nom', nom],
      ['marque', marque],
      ['modele', modele],
      ['immatriculation', immatriculation],
      ['annee', annee],
      ['type_vehicule', type_vehicule],
      ['capacite_charge', capacite_charge],
      ['statut', statut],
      ['created_by', created_by],
    ];
    const insertPairs = desired.filter(([k, v]) => colSet.has(k) && v !== undefined);
    const columns = insertPairs.map(([k]) => k).join(', ');
    const placeholders = insertPairs.map(() => '?').join(', ');
    const values = insertPairs.map(([, v]) => v);

    if (!columns.includes('nom') || !columns.includes('immatriculation')) {
      return res.status(500).json({ message: "Schéma 'vehicules' invalide: colonnes 'nom' et 'immatriculation' manquantes" });
    }

    const [result] = await pool.execute(
      `INSERT INTO vehicules (${columns}) VALUES (${placeholders})`,
      values
    );

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

    // Construire la requête de mise à jour dynamiquement selon les colonnes existantes
    const [cols] = await pool.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicules'`
    );
    const colSet = new Set(cols.map((r) => r.COLUMN_NAME));
    const candidate = {
      nom, marque, modele, immatriculation, annee, type_vehicule,
      capacite_charge, statut, updated_by,
    };
    const updateFields = [];
    const updateValues = [];
    Object.entries(candidate).forEach(([k, v]) => {
      if (v !== undefined && colSet.has(k)) {
        updateFields.push(`${k} = ?`);
        updateValues.push(v);
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

    const supportsSoftDelete = await hasColumn('vehicules', 'deleted_at');

    // Vérifier si le véhicule existe
    const [existingVehicule] = await pool.execute('SELECT * FROM vehicules WHERE id = ?', [id]);
    if (existingVehicule.length === 0) {
      return res.status(404).json({ message: 'Véhicule non trouvé' });
    }

    // If already soft-deleted, consider it gone
    if (supportsSoftDelete && existingVehicule[0]?.deleted_at) {
      return res.json({ success: true, id: parseInt(id) });
    }

    // Check if vehicule is referenced in any existing tables (legacy + new schema)
    const refTables = [
      { table: 'bons', label: 'bons' },
      { table: 'bons_commande', label: 'bons_commande' },
      { table: 'bons_comptant', label: 'bons_comptant' },
      { table: 'bons_sortie', label: 'bons_sortie' },
      { table: 'bons_vehicule', label: 'bons_vehicule' },
      { table: 'devis', label: 'devis' },
      { table: 'livraisons', label: 'livraisons' },
    ];

    let usageCount = 0;
    for (const { table } of refTables) {
      if (!(await tableExists(table))) continue;
      if (!(await hasColumn(table, 'vehicule_id'))) continue;
      const [rows] = await pool.execute(`SELECT COUNT(*) AS c FROM ${table} WHERE vehicule_id = ?`, [id]);
      usageCount += Number(rows?.[0]?.c || 0);
    }

    // If referenced anywhere, do soft delete (prevents FK errors and keeps history)
    if (usageCount > 0) {
      if (!supportsSoftDelete) {
        return res.status(409).json({
          message: "Ce véhicule est utilisé dans des bons. Pour le supprimer, activez le soft delete (colonne 'deleted_at' manquante).",
        });
      }

      await pool.execute('UPDATE vehicules SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [id]);
      return res.json({ success: true, id: parseInt(id), softDeleted: true });
    }

    // Not referenced: soft delete if supported, else hard delete
    if (supportsSoftDelete) {
      await pool.execute('UPDATE vehicules SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [id]);
      return res.json({ success: true, id: parseInt(id), softDeleted: true });
    }

    await pool.execute('DELETE FROM vehicules WHERE id = ?', [id]);
    return res.json({ success: true, id: parseInt(id) });
  } catch (error) {
    console.error('Erreur lors de la suppression du véhicule:', error);
    res.status(500).json({ message: 'Erreur du serveur' });
  }
});

export default router;
