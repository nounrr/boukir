import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

// Document Types
router.get('/types', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, nom, description FROM document_types ORDER BY nom ASC');
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/types', async (req, res, next) => {
  try {
    const { nom, description } = req.body;
    if (!nom || !String(nom).trim()) return res.status(400).json({ message: 'Nom requis' });
    const [result] = await pool.query('INSERT INTO document_types (nom, description) VALUES (?, ?)', [String(nom).trim(), description || null]);
    const id = result.insertId;
    const [rows] = await pool.query('SELECT id, nom, description FROM document_types WHERE id = ?', [id]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/types/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { nom, description } = req.body;
    const fields = [];
    const values = [];
    if (nom !== undefined) { fields.push('nom = ?'); values.push(String(nom).trim()); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description || null); }
    if (fields.length === 0) return res.status(400).json({ message: 'Aucun champ à mettre à jour' });
    const sql = `UPDATE document_types SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);
    await pool.query(sql, values);
    const [rows] = await pool.query('SELECT id, nom, description FROM document_types WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/types/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await pool.query('DELETE FROM document_types WHERE id = ?', [id]);
    res.status(204).send();
  } catch (err) { next(err); }
});

// Employee Documents
router.get('/employees/:employe_id', async (req, res, next) => {
  try {
    const employe_id = Number(req.params.employe_id);
    const [rows] = await pool.query(
      `SELECT d.id, d.employe_id, d.type_doc_id, t.nom as type_nom, d.path, d.created_at
       FROM employe_doc d
       LEFT JOIN document_types t ON t.id = d.type_doc_id
       WHERE d.employe_id = ?
       ORDER BY d.id DESC`,
      [employe_id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/employees/:employe_id', async (req, res, next) => {
  try {
    const employe_id = Number(req.params.employe_id);
    const { path, type_doc_id } = req.body;
    if (!path || !String(path).trim()) return res.status(400).json({ message: 'Path requis' });
    const [result] = await pool.query(
      'INSERT INTO employe_doc (employe_id, type_doc_id, path) VALUES (?, ?, ?)',
      [employe_id, type_doc_id || null, String(path).trim()]
    );
    const id = result.insertId;
    const [rows] = await pool.query(
      `SELECT d.id, d.employe_id, d.type_doc_id, t.nom as type_nom, d.path, d.created_at
       FROM employe_doc d
       LEFT JOIN document_types t ON t.id = d.type_doc_id
       WHERE d.id = ?`,
      [id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/employees/:employe_id/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await pool.query('DELETE FROM employe_doc WHERE id = ?', [id]);
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
