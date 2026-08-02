import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pool from '../db/pool.js';
import { assertUploadedFileKind } from '../utils/uploadValidation.js';
import {
  PAYMENT_CAPTURE_TTL_MS,
  captureAvailability,
  generateCaptureToken,
  hashCaptureToken,
  isValidCaptureToken,
} from '../utils/paymentPhoneCapture.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const paymentsDir = path.join(__dirname, '..', 'uploads', 'payments');
fs.mkdirSync(paymentsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, paymentsDir),
    filename: (_req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `payment-phone-${Date.now()}-${generateCaptureToken().slice(0, 12)}${extension}`);
    },
  }),
  fileFilter: (_req, file, callback) => {
    const allowedMimes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedMimes.has(file.mimetype) || !allowedExtensions.has(extension)) {
      const error = new Error('Format non pris en charge. Utilisez JPEG, PNG ou WebP.');
      error.status = 400;
      return callback(error);
    }
    callback(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 5 },
});

function publicError(res, availability) {
  const responses = {
    not_found: [404, 'Lien de capture introuvable.'],
    expired: [410, 'Ce lien de capture a expiré.'],
    used: [409, 'Une photo a déjà été envoyée avec ce lien.'],
    cancelled: [410, 'Cette capture a été annulée depuis la caisse.'],
  };
  const [status, message] = responses[availability.reason] || responses.not_found;
  return res.status(status).json({ success: false, state: availability.reason, message });
}

function publicInternalError(res, error) {
  console.error('Payment phone capture public error:', error);
  return res.status(500).json({
    success: false,
    state: 'error',
    message: 'Le service de capture est momentanément indisponible.',
  });
}

async function findByToken(token) {
  if (!isValidCaptureToken(token)) return null;
  const [rows] = await pool.query(
    'SELECT id, status, image_url, expires_at FROM payment_phone_captures WHERE token_hash = ? LIMIT 1',
    [hashCaptureToken(token)]
  );
  return rows[0] || null;
}

router.post('/', async (req, res, next) => {
  try {
    const creatorId = Number(req.user?.id);
    if (!Number.isInteger(creatorId) || creatorId <= 0) {
      return res.status(401).json({ success: false, message: 'Utilisateur non identifié.' });
    }
    const token = generateCaptureToken();
    const expiresAt = new Date(Date.now() + PAYMENT_CAPTURE_TTL_MS);
    const [result] = await pool.query(
      `INSERT INTO payment_phone_captures (token_hash, created_by, status, expires_at)
       VALUES (?, ?, 'pending', ?)`,
      [hashCaptureToken(token), creatorId, expiresAt]
    );
    return res.status(201).json({
      success: true,
      id: Number(result.insertId),
      token,
      status: 'pending',
      expires_at: expiresAt.toISOString(),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, status, image_url, expires_at
       FROM payment_phone_captures WHERE id = ? AND created_by = ? LIMIT 1`,
      [req.params.id, req.user?.id]
    );
    const session = rows[0];
    if (!session) return res.status(404).json({ success: false, message: 'Session introuvable.' });
    const availability = captureAvailability(session);
    return res.json({
      success: true,
      id: Number(session.id),
      status: availability.reason === 'expired' ? 'expired' : session.status,
      image_url: session.image_url,
      expires_at: new Date(session.expires_at).toISOString(),
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const [result] = await pool.query(
      `UPDATE payment_phone_captures SET status = 'cancelled'
       WHERE id = ? AND created_by = ? AND status = 'pending'`,
      [req.params.id, req.user?.id]
    );
    if (result.affectedRows === 0) {
      const [rows] = await pool.query(
        'SELECT status FROM payment_phone_captures WHERE id = ? AND created_by = ? LIMIT 1',
        [req.params.id, req.user?.id]
      );
      if (!rows[0]) return res.status(404).json({ success: false, message: 'Session introuvable.' });
    }
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/public/:token', async (req, res) => {
  try {
    const session = await findByToken(req.params.token);
    const availability = captureAvailability(session);
    if (!availability.available) return publicError(res, availability);
    return res.json({
      success: true,
      state: 'pending',
      expires_at: new Date(session.expires_at).toISOString(),
      max_bytes: 10 * 1024 * 1024,
      accepted_types: ['image/jpeg', 'image/png', 'image/webp'],
    });
  } catch (error) {
    return publicInternalError(res, error);
  }
});

router.post('/public/:token/image', async (req, res) => {
  let session;
  try {
    session = await findByToken(req.params.token);
    const availability = captureAvailability(session);
    if (!availability.available) return publicError(res, availability);
  } catch (error) {
    return publicInternalError(res, error);
  }

  upload.single('image')(req, res, async (uploadError) => {
    if (uploadError) {
      console.error('Payment phone capture upload rejected:', uploadError);
      const tooLarge = uploadError?.code === 'LIMIT_FILE_SIZE';
      return res.status(tooLarge ? 413 : 400).json({
        success: false,
        state: 'invalid_file',
        message: tooLarge
          ? 'La photo dépasse la taille maximale autorisée.'
          : 'La photo envoyée n’est pas valide.',
      });
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'Aucune photo reçue.' });
    try {
      await assertUploadedFileKind(req.file, ['jpeg', 'png', 'webp']);
      const imageUrl = `/uploads/payments/${req.file.filename}`;
      const [result] = await pool.query(
        `UPDATE payment_phone_captures
         SET status = 'uploaded', image_url = ?
         WHERE id = ? AND status = 'pending' AND expires_at > NOW()`,
        [imageUrl, session.id]
      );
      if (result.affectedRows !== 1) {
        await fsPromises.unlink(req.file.path).catch(() => {});
        const latest = await findByToken(req.params.token);
        return publicError(res, captureAvailability(latest));
      }
      return res.status(201).json({ success: true, state: 'uploaded', message: 'Photo envoyée à la caisse.' });
    } catch (error) {
      if (req.file?.path) await fsPromises.unlink(req.file.path).catch(() => {});
      if (error?.status === 400) {
        console.error('Payment phone capture file validation failed:', error);
        return res.status(400).json({
          success: false,
          state: 'invalid_file',
          message: 'La photo envoyée n’est pas valide.',
        });
      }
      return publicInternalError(res, error);
    }
  });
});

export default router;
