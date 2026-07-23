import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { requireRole } from '../middleware/auth.js';
import { assertUploadedFileKind } from '../utils/uploadValidation.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const uploadsRoot = path.join(__dirname, '..', 'uploads');
const paymentsDir = path.join(uploadsRoot, 'payments');
const employeeDocsDir = path.join(uploadsRoot, 'employee_docs');

for (const dir of [uploadsRoot, paymentsDir, employeeDocsDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    cb(null, req.path.includes('/employee-doc') ? employeeDocsDir : paymentsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const prefix = req.path.includes('/employee-doc') ? 'empdoc' : 'payment';
    cb(null, `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
    if (!allowedMimes.includes(file.mimetype) || !allowedExtensions.includes(extension)) {
      return cb(new Error('Type de fichier non supporte'));
    }
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 20 },
});

router.post('/payment-image', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Aucun fichier recu' });
    await assertUploadedFileKind(req.file, ['jpeg', 'png', 'webp']);
    const rel = `/uploads/payments/${req.file.filename}`;
    return res.status(201).json({ success: true, imageUrl: rel, filename: req.file.filename, message: 'Image uploadee' });
  } catch (err) { return next(err); }
});

router.post('/employee-doc', requireRole('PDG'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Aucun fichier recu' });
    await assertUploadedFileKind(req.file, ['jpeg', 'png', 'webp', 'pdf']);
    const rel = `/uploads/employee_docs/${req.file.filename}`;
    return res.status(201).json({ success: true, fileUrl: rel, filename: req.file.filename, message: 'Document uploade' });
  } catch (err) { return next(err); }
});

router.delete('/payment-image/:filename', (req, res) => {
  const { filename } = req.params;
  if (!filename || filename.includes('..') || path.basename(filename) !== filename) {
    return res.status(400).json({ success: false, message: 'Nom de fichier invalide' });
  }
  const fp = path.join(paymentsDir, filename);
  try {
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    return res.json({ success: true, message: 'Image supprimee' });
  } catch (err) {
    console.error('Error deleting file', err);
    return res.status(500).json({ success: false, message: 'Erreur suppression image' });
  }
});

export default router;
