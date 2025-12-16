import { Router } from 'express';
import pool from '../db/pool.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configure Multer for brand images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'brands');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Ensure brands table exists (basic check)
async function ensureBrandsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS brands (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nom VARCHAR(255) NOT NULL,
      description TEXT,
      image_url VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

router.get('/', async (_req, res, next) => {
  try {
    await ensureBrandsTable();
    const [rows] = await pool.query('SELECT * FROM brands ORDER BY id DESC');
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    await ensureBrandsTable();
    const id = Number(req.params.id);
    const [rows] = await pool.query('SELECT * FROM brands WHERE id = ?', [id]);
    const brand = rows[0];
    if (!brand) return res.status(404).json({ message: 'Marque introuvable' });
    res.json(brand);
  } catch (err) { next(err); }
});

router.post('/', upload.single('image'), async (req, res, next) => {
  try {
    await ensureBrandsTable();
    const { nom, description } = req.body;
    const image_url = req.file ? `/uploads/brands/${req.file.filename}` : null;

    if (!nom || !nom.trim()) return res.status(400).json({ message: 'Nom requis' });
    
    const now = new Date();
    const [result] = await pool.query(
      'INSERT INTO brands (nom, description, image_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [nom.trim(), description?.trim() || null, image_url, now, now]
    );
    const id = result.insertId;
    const [rows] = await pool.query('SELECT * FROM brands WHERE id = ?', [id]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', upload.single('image'), async (req, res, next) => {
  try {
    await ensureBrandsTable();
    const id = Number(req.params.id);
    const { nom, description } = req.body;
    const [exists] = await pool.query('SELECT id FROM brands WHERE id = ?', [id]);
    if (exists.length === 0) return res.status(404).json({ message: 'Marque introuvable' });

    const image_url = req.file ? `/uploads/brands/${req.file.filename}` : undefined;
    const now = new Date();
    
    const fields = [];
    const values = [];
    
    if (nom !== undefined) { fields.push('nom = ?'); values.push(nom ? nom.trim() : null); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description ? description.trim() : null); }
    if (image_url !== undefined) { fields.push('image_url = ?'); values.push(image_url); }
    
    fields.push('updated_at = ?'); values.push(now);
    
    const sql = `UPDATE brands SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);
    
    await pool.query(sql, values);
    const [rows] = await pool.query('SELECT * FROM brands WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await ensureBrandsTable();
    const id = Number(req.params.id);
    
    // Check if any products use this brand
    // First check if brand_id column exists in products to avoid error if migration hasn't run
    try {
      const [products] = await pool.query('SELECT id FROM products WHERE brand_id = ? LIMIT 1', [id]);
      if (products.length > 0) {
        return res.status(400).json({ message: 'Impossible de supprimer cette marque car elle est utilisée par des produits.' });
      }
    } catch (e) {
      // Ignore error if column doesn't exist yet
    }

    await pool.query('DELETE FROM brands WHERE id = ?', [id]);
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
