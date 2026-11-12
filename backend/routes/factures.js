import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import pool from '../db/pool.js';
import { verifyToken } from '../middleware/auth.js';
import { canAccessFactures, parseFacture, factureFileType } from '../utils/factures.js';

const directory = fileURLToPath(new URL('../private_uploads/factures/', import.meta.url));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 10, fieldSize: 20000 } }).single('fichier');
const router = express.Router();
router.use(verifyToken);
router.use(async (req, res, next) => {
  try {
    if (!req.user?.role || req.user.type_compte != null) return res.status(403).json({ message: 'Accès réservé aux employés autorisés.' });
    const [rows] = await pool.query('SELECT role, acces_factures FROM employees WHERE id = ? AND deleted_at IS NULL', [req.user.id]);
    req.factureAllowed = canAccessFactures(rows[0]);
    res.set('Cache-Control', 'no-store');
    if (req.path === '/access' && req.method === 'GET') return res.json({ allowed: req.factureAllowed });
    if (!req.factureAllowed) return res.status(403).json({ message: 'Accès à la page Factures non autorisé.' });
    next();
  } catch (error) { next(error); }
});

router.get('/clients', async (req, res, next) => {
  try {
    const q = `%${String(req.query.q || '').slice(0, 100)}%`;
    const [rows] = await pool.query("SELECT id, nom_complet, societe FROM contacts WHERE deleted_at IS NULL AND archived_at IS NULL AND type = 'Client' AND COALESCE(is_charge, 0) = 0 AND (nom_complet LIKE ? OR societe LIKE ?) ORDER BY nom_complet LIMIT 50", [q, q]);
    res.json(rows);
  } catch (error) { next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
    const where = [], values = [];
    if (req.query.mois) { where.push('f.mois = ?'); values.push(String(req.query.mois)); }
    if (req.query.q) { where.push('(f.numero LIKE ? OR c.nom_complet LIKE ? OR c.societe LIKE ?)'); values.push(...Array(3).fill(`%${String(req.query.q).slice(0, 100)}%`)); }
    const from = `FROM factures_clients f JOIN contacts c ON c.id = f.client_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
    const [count] = await pool.query(`SELECT COUNT(*) AS total, COALESCE(SUM(f.montant), 0) AS montant ${from}`, values);
    const [rows] = await pool.query(`SELECT f.id, f.client_id, f.numero, f.mois, f.date_facture, f.date_echeance, f.montant, f.notes, f.nom_fichier, f.created_at, c.nom_complet AS client_nom, c.societe AS client_societe ${from} ORDER BY f.id DESC LIMIT 30 OFFSET ?`, [...values, (Math.floor(page) - 1) * 30]);
    res.json({ rows, total: Number(count[0].total), montant: Number(count[0].montant) });
  } catch (error) { next(error); }
});

router.get('/:id/fichier', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT fichier, nom_fichier, mime_type FROM factures_clients WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Facture introuvable.' });
    const row = rows[0];
    res.type(row.mime_type);
    res.download(path.join(directory, path.basename(row.fichier)), row.nom_fichier, error => { if (error && !res.headersSent) next(error); });
  } catch (error) { next(error); }
});

async function save(req, res, next) {
  let savedPath;
  try {
    const data = parseFacture(req.body);
    const [clients] = await pool.query("SELECT id FROM contacts WHERE id = ? AND deleted_at IS NULL AND type = 'Client' AND COALESCE(is_charge, 0) = 0", [data.client_id]);
    if (!clients.length) return res.status(400).json({ message: 'Client introuvable.' });
    let previous;
    if (req.params.id) {
      const [rows] = await pool.query('SELECT fichier FROM factures_clients WHERE id = ?', [req.params.id]);
      previous = rows[0];
      if (!previous) return res.status(404).json({ message: 'Facture introuvable.' });
    }
    if (!previous && !req.file) return res.status(400).json({ message: 'Joignez le fichier de la facture.' });
    if (req.file) {
      const type = factureFileType(req.file.buffer);
      data.fichier = randomUUID() + type.extension;
      data.nom_fichier = path.basename(req.file.originalname).replace(/[\x00-\x1f]/g, '').slice(0, 240) || `facture${type.extension}`;
      data.mime_type = type.mime;
      await mkdir(directory, { recursive: true });
      savedPath = path.join(directory, data.fichier);
      await writeFile(savedPath, req.file.buffer, { flag: 'wx' });
    }
    if (previous) {
      await pool.query('UPDATE factures_clients SET ?, updated_by = ? WHERE id = ?', [data, req.user.id, req.params.id]);
      if (req.file) await unlink(path.join(directory, path.basename(previous.fichier))).catch(() => {});
      return res.json({ id: Number(req.params.id) });
    }
    const [result] = await pool.query('INSERT INTO factures_clients SET ?', { ...data, created_by: req.user.id });
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    if (savedPath) await unlink(savedPath).catch(() => {});
    next(error);
  }
}
router.post('/', upload, save);
router.put('/:id', upload, save);
router.use((error, _req, res, _next) => {
  const status = error instanceof multer.MulterError || error.status === 400 ? 400 : 500;
  if (status === 500) console.error('Factures:', error);
  res.status(status).json({ message: error.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux : maximum 10 Mo.' : status === 400 ? error.message : 'Impossible de traiter la facture.' });
});
export default router;
