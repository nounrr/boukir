import express from 'express';
import pool from '../db/pool.js';

const router = express.Router();

// Get all talons
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM talons ORDER BY nom ASC'
    );
    res.json(rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des talons:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get talon by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      'SELECT * FROM talons WHERE id = ?',
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Talon non trouvé' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Erreur lors de la récupération du talon:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Create new talon
router.post('/', async (req, res) => {
  try {
    const { nom, phone } = req.body;
    
    // Validation
    if (!nom || nom.trim() === '') {
      return res.status(400).json({ error: 'Le nom est requis' });
    }

    const [result] = await pool.execute(
      'INSERT INTO talons (nom, phone) VALUES (?, ?)',
      [nom.trim(), phone || null]
    );

    // Get the created talon
    const [rows] = await pool.execute(
      'SELECT * FROM talons WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Erreur lors de la création du talon:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Ce talon existe déjà' });
    } else {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
});

// Update talon
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, phone } = req.body;
    
    // Validation
    if (!nom || nom.trim() === '') {
      return res.status(400).json({ error: 'Le nom est requis' });
    }

    // Check if talon exists
    const [existing] = await pool.execute(
      'SELECT id FROM talons WHERE id = ?',
      [id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Talon non trouvé' });
    }

    await pool.execute(
      'UPDATE talons SET nom = ?, phone = ? WHERE id = ?',
      [nom.trim(), phone || null, id]
    );

    // Get the updated talon
    const [rows] = await pool.execute(
      'SELECT * FROM talons WHERE id = ?',
      [id]
    );

    res.json(rows[0]);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du talon:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Ce talon existe déjà' });
    } else {
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
});

// Delete talon
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if talon exists
    const [existing] = await pool.execute(
      'SELECT id FROM talons WHERE id = ?',
      [id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Talon non trouvé' });
    }

    await pool.execute('DELETE FROM talons WHERE id = ?', [id]);
    
    res.json({ message: 'Talon supprimé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression du talon:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
