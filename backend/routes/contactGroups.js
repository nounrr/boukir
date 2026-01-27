import express from 'express';
import pool from '../db/pool.js';

const router = express.Router();

// GET /api/contact-groups - list groups (with contacts count)
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT g.*, COUNT(c.id) AS contacts_count
       FROM contact_groups g
       LEFT JOIN contacts c ON c.group_id = g.id
       GROUP BY g.id
       ORDER BY g.name ASC`
    );

    res.json(
      (rows || []).map(r => ({
        ...r,
        contacts_count: Number(r.contacts_count || 0),
      }))
    );
  } catch (error) {
    console.error('Error fetching contact groups:', error);
    res.status(500).json({ error: 'Failed to fetch contact groups' });
  }
});

// POST /api/contact-groups - create group
router.post('/', async (req, res) => {
  try {
    const { name } = req.body || {};
    const cleanName = String(name || '').trim();

    if (!cleanName) {
      return res.status(400).json({ error: 'name is required' });
    }

    const [result] = await pool.execute(
      'INSERT INTO contact_groups (name, created_at, updated_at) VALUES (?, NOW(), NOW())',
      [cleanName]
    );

    const [rows] = await pool.execute('SELECT * FROM contact_groups WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    // Duplicate name
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Group name already exists' });
    }
    console.error('Error creating contact group:', error);
    res.status(500).json({ error: 'Failed to create contact group' });
  }
});

// PUT /api/contact-groups/:id - rename group
router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name } = req.body || {};
    const cleanName = String(name || '').trim();

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    if (!cleanName) {
      return res.status(400).json({ error: 'name is required' });
    }

    const [existing] = await pool.execute('SELECT id FROM contact_groups WHERE id = ?', [id]);
    if (!existing?.length) {
      return res.status(404).json({ error: 'Group not found' });
    }

    await pool.execute('UPDATE contact_groups SET name = ?, updated_at = NOW() WHERE id = ?', [cleanName, id]);
    const [rows] = await pool.execute('SELECT * FROM contact_groups WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Group name already exists' });
    }
    console.error('Error updating contact group:', error);
    res.status(500).json({ error: 'Failed to update contact group' });
  }
});

// DELETE /api/contact-groups/:id - delete group (contacts.group_id becomes NULL due to FK)
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const [existing] = await pool.execute('SELECT id FROM contact_groups WHERE id = ?', [id]);
    if (!existing?.length) {
      return res.status(404).json({ error: 'Group not found' });
    }

    await pool.execute('DELETE FROM contact_groups WHERE id = ?', [id]);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting contact group:', error);
    res.status(500).json({ error: 'Failed to delete contact group' });
  }
});

// PUT /api/contact-groups/unassign/contacts - bulk unassign contacts from any group
router.put('/unassign/contacts', async (req, res) => {
  try {
    const contactIds = Array.isArray(req.body?.contactIds) ? req.body.contactIds : [];
    const normalizedIds = [...new Set(contactIds.map(Number).filter(n => Number.isFinite(n) && n > 0))];

    if (normalizedIds.length === 0) {
      return res.status(400).json({ error: 'contactIds must be a non-empty array of ids' });
    }

    const placeholders = normalizedIds.map(() => '?').join(',');
    const [result] = await pool.query(
      `UPDATE contacts SET group_id = NULL WHERE id IN (${placeholders})`,
      [...normalizedIds]
    );

    res.json({ ok: true, affectedRows: Number(result?.affectedRows || 0) });
  } catch (error) {
    console.error('Error unassigning contacts from group:', error);
    res.status(500).json({ error: 'Failed to unassign contacts from group' });
  }
});

// PUT /api/contact-groups/:id/contacts - assign contacts to this group (bulk)
router.put('/:id/contacts', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const contactIds = Array.isArray(req.body?.contactIds) ? req.body.contactIds : [];
    const normalizedIds = [...new Set(contactIds.map(Number).filter(n => Number.isFinite(n) && n > 0))];

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    if (normalizedIds.length === 0) {
      return res.status(400).json({ error: 'contactIds must be a non-empty array of ids' });
    }

    const [existing] = await pool.execute('SELECT id FROM contact_groups WHERE id = ?', [id]);
    if (!existing?.length) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const placeholders = normalizedIds.map(() => '?').join(',');
    const [result] = await pool.query(
      `UPDATE contacts SET group_id = ? WHERE id IN (${placeholders})`,
      [id, ...normalizedIds]
    );

    res.json({ ok: true, affectedRows: Number(result?.affectedRows || 0) });
  } catch (error) {
    console.error('Error assigning contacts to group:', error);
    res.status(500).json({ error: 'Failed to assign contacts to group' });
  }
});

export default router;
