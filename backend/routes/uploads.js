import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'uploads');
const bonsPdfDir = path.join(uploadsDir, 'bons_pdf');

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

ensureDir(uploadsDir);
ensureDir(bonsPdfDir);

const sanitizeSegment = (value, fallback = 'generic') => {
  if (!value) return fallback;
  const str = String(value).trim().toLowerCase();
  const cleaned = str.replace(/[^a-z0-9_-]/g, '-');
  return cleaned || fallback;
};

const sanitizeBaseName = (value, fallback = 'document') => {
  if (!value) return fallback;
  const str = String(value).trim();
  const cleaned = str.replace(/[^a-zA-Z0-9_-]/g, '_');
  return cleaned || fallback;
};

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const bonTypeParam = Array.isArray(req?.query?.bonType)
      ? req.query.bonType[0]
      : req?.query?.bonType;
    const folderSegment = sanitizeSegment(bonTypeParam);
    const targetDir = folderSegment === 'generic'
      ? bonsPdfDir
      : path.join(bonsPdfDir, folderSegment);
    ensureDir(targetDir);
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    const bonIdParam = Array.isArray(req?.query?.bonId)
      ? req.query.bonId[0]
      : req?.query?.bonId;
    const bonTypeParam = Array.isArray(req?.query?.bonType)
      ? req.query.bonType[0]
      : req?.query?.bonType;
    const baseName = sanitizeBaseName(path.parse(file.originalname).name);
    const parts = [baseName];
    if (bonTypeParam) {
      parts.push(sanitizeSegment(bonTypeParam, ''));
    }
    if (bonIdParam) {
      parts.push(sanitizeSegment(bonIdParam, ''));
    }
    const ts = Date.now();
    parts.push(String(ts));
    cb(null, `${parts.filter(Boolean).join('-')}.pdf`);
  }
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new Error('Seuls les fichiers PDF sont acceptés'));
    } else {
      cb(null, true);
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB
});

// POST /api/uploads/pdf - accept multipart PDF upload and return public URL
router.post('/pdf', upload.single('pdf'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Aucun fichier reçu' });
  }
  const bonTypeParam = Array.isArray(req?.query?.bonType)
    ? req.query.bonType[0]
    : req?.query?.bonType;
  const folderSegment = sanitizeSegment(bonTypeParam);
  const relPath = folderSegment === 'generic'
    ? path.posix.join('/uploads/bons_pdf', req.file.filename)
    : path.posix.join('/uploads/bons_pdf', folderSegment, req.file.filename);
  const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const absoluteUrl = `${baseUrl.replace(/\/$/, '')}${relPath.startsWith('/') ? '' : '/'}${relPath}`;

  return res.json({
    url: relPath,
    absoluteUrl,
    fileName: req.file.filename,
  });
});

export default router;
