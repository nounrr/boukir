import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const uploadsRoot = path.join(__dirname, '..', 'uploads');
const paymentsDir = path.join(uploadsRoot, 'payments');

// Ensure directories exist
for (const dir of [uploadsRoot, paymentsDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, paymentsDir);
  },
  filename: function (_req, file, cb) {
    const unique = `payment-${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}`;
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowed.includes(file.mimetype)) return cb(new Error('Type de fichier non supporté'));
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// POST /api/upload/payment-image - field name: image
router.post('/payment-image', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Aucun fichier reçu' });
  const rel = `/uploads/payments/${req.file.filename}`;
  res.status(201).json({ success: true, imageUrl: rel, filename: req.file.filename, message: 'Image uploadée' });
});

// DELETE /api/upload/payment-image/:filename
router.delete('/payment-image/:filename', (req, res) => {
  const { filename } = req.params;
  const fp = path.join(paymentsDir, filename);
  if (!filename || filename.includes('..')) return res.status(400).json({ success: false, message: 'Nom de fichier invalide' });
  try {
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    return res.json({ success: true, message: 'Image supprimée' });
  } catch (err) {
    console.error('Error deleting file', err);
    return res.status(500).json({ success: false, message: 'Erreur suppression image' });
  }
});

export default router;
