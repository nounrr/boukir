import express from 'express';
import pool from '../db/pool.js';

const router = express.Router();

// GET /api/contacts - Get all contacts with optional type filter
router.get('/', async (req, res) => {
  try {
    const { type } = req.query;
    let query = 'SELECT * FROM contacts WHERE 1=1';
    const params = [];

    if (type && (type === 'Client' || type === 'Fournisseur')) {
      query += ' AND type = ?';
      params.push(type);
    }

    query += ' ORDER BY created_at DESC';

    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// GET /api/contacts/:id - Get contact by ID
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM contacts WHERE id = ?',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching contact:', error);
    res.status(500).json({ error: 'Failed to fetch contact' });
  }
});

// POST /api/contacts - Create new contact
router.post('/', async (req, res) => {
  try {
    const {
      nom_complet,
      type,
      telephone,
      email,
      adresse,
      rib,
      ice,
      solde = 0,
      plafond,
      created_by
    } = req.body;

    // Validation
    if (!nom_complet || !type) {
      return res.status(400).json({ error: 'nom_complet and type are required' });
    }

    if (!['Client', 'Fournisseur'].includes(type)) {
      return res.status(400).json({ error: 'type must be either Client or Fournisseur' });
    }

    const [result] = await pool.execute(
      `INSERT INTO contacts 
       (nom_complet, type, telephone, email, adresse, rib, ice, solde, plafond, created_by, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [nom_complet, type, telephone || null, email || null, adresse || null, rib || null, ice || null, solde, plafond || null, created_by]
    );

    // Fetch the created contact
    const [rows] = await pool.execute(
      'SELECT * FROM contacts WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// PUT /api/contacts/:id - Update contact
router.put('/:id', async (req, res) => {
  try {
    const {
      nom_complet,
      type,
      telephone,
      email,
      adresse,
      rib,
      ice,
      solde,
      plafond,
      updated_by
    } = req.body;

    // Check if contact exists
    const [existing] = await pool.execute(
      'SELECT id FROM contacts WHERE id = ?',
      [req.params.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Build update query dynamically based on provided fields
    const updates = [];
    const params = [];

    if (nom_complet !== undefined) { updates.push('nom_complet = ?'); params.push(nom_complet); }
    if (type !== undefined) { 
      if (!['Client', 'Fournisseur'].includes(type)) {
        return res.status(400).json({ error: 'type must be either Client or Fournisseur' });
      }
      updates.push('type = ?'); 
      params.push(type); 
    }
    if (telephone !== undefined) { updates.push('telephone = ?'); params.push(telephone); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    if (adresse !== undefined) { updates.push('adresse = ?'); params.push(adresse); }
    if (rib !== undefined) { updates.push('rib = ?'); params.push(rib); }
    if (ice !== undefined) { updates.push('ice = ?'); params.push(ice); }
    if (solde !== undefined) { updates.push('solde = ?'); params.push(Number(solde)); }
    if (plafond !== undefined) { updates.push('plafond = ?'); params.push(plafond ? Number(plafond) : null); }
    if (updated_by !== undefined) { updates.push('updated_by = ?'); params.push(updated_by); }

    updates.push('updated_at = NOW()');
    params.push(req.params.id);

    if (updates.length > 1) { // More than just updated_at
      await pool.execute(
        `UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
    }

    // Fetch updated contact
    const [rows] = await pool.execute(
      'SELECT * FROM contacts WHERE id = ?',
      [req.params.id]
    );

    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating contact:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// DELETE /api/contacts/:id - Delete contact
router.delete('/:id', async (req, res) => {
  try {
    const [existing] = await pool.execute(
      'SELECT id FROM contacts WHERE id = ?',
      [req.params.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    await pool.execute('DELETE FROM contacts WHERE id = ?', [req.params.id]);

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

export default router;
