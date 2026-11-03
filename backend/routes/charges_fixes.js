import express from 'express';
import pool from '../db/pool.js';
import { requireRoles } from '../middleware/auth.js';
import { FIXED_CHARGES_SELECT, parseFixedCharge } from '../utils/fixedCharges.js';

const router = express.Router();
const canManage = requireRoles('PDG', 'ManagerPlus', 'Manager');
const handleError = (res, error) => {
  if (error.statusCode === 400) return res.status(400).json({ message: error.message });
  console.error('Charges fixes:', error);
  return res.status(500).json({ message: 'Impossible de traiter les charges fixes.' });
};
router.get('/', async (_req, res) => {
  try { const [rows] = await pool.query(`${FIXED_CHARGES_SELECT} ORDER BY libelle, id`); res.json(rows); }
  catch (error) { handleError(res, error); }
});
router.post('/', canManage, async (req, res) => {
  try {
    const charge = parseFixedCharge(req.body || {});
    const [result] = await pool.execute(`INSERT INTO charges_fixes (libelle, montant_mensuel, date_debut, date_fin, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)`,
      [charge.libelle, charge.montant_mensuel, charge.date_debut, charge.date_fin, req.user.id, req.user.id]);
    res.status(201).json({ ...charge, id: result.insertId });
  } catch (error) { handleError(res, error); }
});
router.put('/:id', canManage, async (req, res) => {
  try {
    if (!/^[1-9]\d*$/.test(req.params.id)) return res.status(400).json({ message: 'Identifiant invalide.' });
    const charge = parseFixedCharge(req.body || {});
    const [result] = await pool.execute(`UPDATE charges_fixes SET libelle = ?, montant_mensuel = ?, date_debut = ?, date_fin = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`,
      [charge.libelle, charge.montant_mensuel, charge.date_debut, charge.date_fin, req.user.id, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Charge fixe introuvable.' });
    res.json({ ...charge, id: Number(req.params.id) });
  } catch (error) { handleError(res, error); }
});
router.delete('/:id', canManage, async (req, res) => {
  try {
    if (!/^[1-9]\d*$/.test(req.params.id)) return res.status(400).json({ message: 'Identifiant invalide.' });
    const [result] = await pool.execute('UPDATE charges_fixes SET deleted_at = NOW(), updated_by = ? WHERE id = ? AND deleted_at IS NULL', [req.user.id, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Charge fixe introuvable.' });
    res.json({ success: true });
  } catch (error) { handleError(res, error); }
});
export default router;
