import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, nom, description, created_by, updated_by, created_at, updated_at FROM categories ORDER BY id DESC');
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query('SELECT id, nom, description, created_by, updated_by, created_at, updated_at FROM categories WHERE id = ?', [id]);
    const cat = rows[0];
    if (!cat) return res.status(404).json({ message: 'Catégorie introuvable' });
    res.json(cat);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { nom, description, created_by } = req.body;
    if (!nom || !nom.trim()) return res.status(400).json({ message: 'Nom requis' });
    const now = new Date();
    const [result] = await pool.query(
      'INSERT INTO categories (nom, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [nom.trim(), description?.trim() || null, created_by ?? null, now, now]
    );
    const id = result.insertId;
    const [rows] = await pool.query('SELECT id, nom, description, created_by, updated_by, created_at, updated_at FROM categories WHERE id = ?', [id]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { nom, description, updated_by } = req.body;
    const [exists] = await pool.query('SELECT id FROM categories WHERE id = ?', [id]);
    if (exists.length === 0) return res.status(404).json({ message: 'Catégorie introuvable' });
    const now = new Date();
    const fields = [];
    const values = [];
    if (nom !== undefined) { fields.push('nom = ?'); values.push(nom ? nom.trim() : null); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description ? description.trim() : null); }
    if (updated_by !== undefined) { fields.push('updated_by = ?'); values.push(updated_by); }
    fields.push('updated_at = ?'); values.push(now);
    const sql = `UPDATE categories SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);
    await pool.query(sql, values);
    const [rows] = await pool.query('SELECT id, nom, description, created_by, updated_by, created_at, updated_at FROM categories WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === 1) {
      return res.status(400).json({ message: "Impossible de supprimer la catégorie par défaut (UNCATEGORIZED)" });
    }
    // Ensure fallback category exists
    const [fallback] = await pool.query('SELECT id FROM categories WHERE id = 1');
    if (!fallback.length) {
      const now = new Date();
      await pool.query(
        'INSERT INTO categories (id, nom, description, created_at, updated_at) VALUES (1, \'UNCATEGORIZED\', \'Catégorie par défaut\', ?, ?)'
        , [now, now]
      );
    }
    // Reassign products from this category to 1
    await pool.query('UPDATE products SET categorie_id = 1 WHERE categorie_id = ?', [id]);
    // Delete the category
    await pool.query('DELETE FROM categories WHERE id = ?', [id]);
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
