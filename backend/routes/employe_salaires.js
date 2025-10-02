import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

// List salary entries for an employee, optional month filter (YYYY-MM)
router.get('/employees/:id/salaires', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { month } = req.query; // format YYYY-MM
    let sql = 'SELECT id, employe_id, montant, note, statut, created_at, updated_at FROM employe_salaire WHERE employe_id = ?';
    const params = [id];
    if (typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)) {
      sql += ' AND DATE_FORMAT(created_at, "%Y-%m") = ?';
      params.push(month);
    }
    sql += ' ORDER BY created_at DESC, id DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// Create salary entry for an employee
router.post('/employees/:id/salaires', async (req, res, next) => {
  try {
    const employe_id = Number(req.params.id);
    const { montant, note, statut, created_by } = req.body;
    if (montant === undefined || isNaN(Number(montant))) {
      return res.status(400).json({ message: 'Montant invalide' });
    }
    // Default status to "En attente" if not provided
    const finalStatut = statut || 'En attente';
    const now = new Date();
    const [result] = await pool.query(
      'INSERT INTO employe_salaire (employe_id, montant, note, statut, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ',
      [employe_id, Number(montant), note ?? null, finalStatut, created_by ?? null, created_by ?? null, now, now]
    );
    const [rows] = await pool.query('SELECT id, employe_id, montant, note, statut, created_at, updated_at FROM employe_salaire WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// Monthly summary: total amount per employee for a given month
router.get('/salaires/summary', async (req, res, next) => {
  try {
    const { month } = req.query; // YYYY-MM
    if (!month || typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: 'Paramètre month (YYYY-MM) requis' });
    }
    const [rows] = await pool.query(
      `SELECT employe_id, SUM(montant) AS total
       FROM employe_salaire
       WHERE DATE_FORMAT(created_at, "%Y-%m") = ?
       GROUP BY employe_id`
      , [month]
    );
    // return as array; frontend can map to dict if needed
    res.json(rows);
  } catch (err) { next(err); }
});

// Update salary entry
router.put('/employees/:id/salaires/:salaireId', async (req, res, next) => {
  try {
    const employe_id = Number(req.params.id);
    const salaireId = Number(req.params.salaireId);
    const { montant, note, statut, updated_by } = req.body;

    // Verify the salary entry exists and belongs to the employee
    const [existing] = await pool.query(
      'SELECT id FROM employe_salaire WHERE id = ? AND employe_id = ?',
      [salaireId, employe_id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Entrée de salaire introuvable' });
    }

    if (montant !== undefined && isNaN(Number(montant))) {
      return res.status(400).json({ message: 'Montant invalide' });
    }

    const now = new Date();
    const updates = [];
    const params = [];

    if (montant !== undefined) {
      updates.push('montant = ?');
      params.push(Number(montant));
    }
    if (note !== undefined) {
      updates.push('note = ?');
      params.push(note);
    }
    if (statut !== undefined) {
      updates.push('statut = ?');
      params.push(statut);
    }
    if (updated_by !== undefined) {
      updates.push('updated_by = ?');
      params.push(updated_by);
    }
    
    updates.push('updated_at = ?');
    params.push(now);
    params.push(salaireId);

    if (updates.length > 1) { // more than just updated_at
      await pool.query(
        `UPDATE employe_salaire SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
    }

    const [rows] = await pool.query('SELECT id, employe_id, montant, note, statut, created_at, updated_at FROM employe_salaire WHERE id = ?', [salaireId]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Delete salary entry
router.delete('/employees/:id/salaires/:salaireId', async (req, res, next) => {
  try {
    const employe_id = Number(req.params.id);
    const salaireId = Number(req.params.salaireId);

    // Verify the salary entry exists and belongs to the employee
    const [existing] = await pool.query(
      'SELECT id FROM employe_salaire WHERE id = ? AND employe_id = ?',
      [salaireId, employe_id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Entrée de salaire introuvable' });
    }

    await pool.query('DELETE FROM employe_salaire WHERE id = ?', [salaireId]);
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
