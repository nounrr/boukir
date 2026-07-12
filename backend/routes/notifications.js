import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db/pool.js';
import { emitToPDG } from '../socket/socketServer.js';
import { getWhtspStatus, isWhtspServiceConfigured, sendWhtspMedia, sendWhtspText } from '../utils/whtspService.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, '..', 'uploads');

const getMediaPayloadFromUrl = async (rawUrl) => {
  if (!rawUrl) return null;
  const mediaUrl = String(rawUrl);

  let urlObj = null;
  try {
    urlObj = new URL(mediaUrl);
  } catch {
    try {
      urlObj = new URL(mediaUrl, 'http://local.invalid');
    } catch {
      urlObj = null;
    }
  }

  const pathname = urlObj?.pathname || '';
  const filename = pathname ? path.basename(decodeURIComponent(pathname)) || 'document.pdf' : 'document.pdf';

  if (pathname.startsWith('/uploads/')) {
    const relativeUploadPath = decodeURIComponent(pathname.replace(/^\/uploads\//, ''));
    const localPath = path.resolve(uploadsDir, relativeUploadPath);
    if (localPath === uploadsDir || !localPath.startsWith(`${uploadsDir}${path.sep}`)) {
      throw new Error('Chemin PDF invalide');
    }

    const buffer = await fs.readFile(localPath);
    return {
      base64: buffer.toString('base64'),
      filename,
      mimetype: 'application/pdf',
    };
  }

  const resp = await fetch(mediaUrl);
  if (!resp.ok) {
    const err = new Error(`fetch_media_failed_backend_${resp.status}`);
    err.status = 400;
    throw err;
  }
  const buffer = Buffer.from(await resp.arrayBuffer());
  return {
    base64: buffer.toString('base64'),
    filename,
    mimetype: resp.headers.get('content-type') || 'application/pdf',
  };
};

// GET /api/notifications/count - Get count of pending artisan requests (PDG only)
router.get('/count', async (req, res, next) => {
  try {
    const [result] = await pool.query(
      `SELECT COUNT(*) as count 
       FROM contacts 
       WHERE demande_artisan = TRUE 
         AND artisan_approuve = FALSE 
         AND deleted_at IS NULL`
    );

    res.json({
      pending_artisan_requests: result[0].count
    });
  } catch (err) {
    console.error('Error fetching notification count:', err);
    next(err);
  }
});

// GET /api/notifications/artisan-requests - Get recent pending requests (PDG only)
router.get('/artisan-requests', async (req, res, next) => {
  try {
    const { limit = 5 } = req.query;

    const [requests] = await pool.query(
      `SELECT 
        id, nom_complet, prenom, nom, email, telephone, avatar_url, created_at
       FROM contacts 
       WHERE demande_artisan = TRUE 
         AND artisan_approuve = FALSE 
         AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT ?`,
      [parseInt(limit)]
    );

    res.json(requests);
  } catch (err) {
    console.error('Error fetching artisan requests:', err);
    next(err);
  }
});

// POST /api/notifications/artisan-requests/:id/approve - Approve artisan request (PDG only)
router.post('/artisan-requests/:id/approve', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { note } = req.body;

    await connection.beginTransaction();

    const [contacts] = await connection.query(
      `SELECT id, nom_complet, email, demande_artisan, artisan_approuve 
       FROM contacts WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );

    if (contacts.length === 0) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    const contact = contacts[0];

    if (!contact.demande_artisan || contact.artisan_approuve) {
      return res.status(400).json({ message: 'Demande déjà traitée ou inexistante' });
    }

    await connection.query(
      `UPDATE contacts 
       SET artisan_approuve = TRUE,
           artisan_approuve_le = NOW(),
           artisan_note_admin = ?,
           type_compte = 'Artisan/Promoteur',
           updated_at = NOW()
       WHERE id = ?`,
      [note || null, id]
    );

    await connection.commit();

    // Emit socket event to PDG users
    emitToPDG('artisan-request:approved', {
      contact_id: parseInt(id),
      nom_complet: contact.nom_complet,
      email: contact.email,
      timestamp: new Date().toISOString()
    });

    res.json({
      message: 'Demande approuvée avec succès',
      contact_id: id
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error approving artisan request:', err);
    next(err);
  } finally {
    connection.release();
  }
});

// POST /api/notifications/artisan-requests/:id/reject - Reject artisan request (PDG only)
router.post('/artisan-requests/:id/reject', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { note } = req.body;

    await connection.beginTransaction();

    const [contacts] = await connection.query(
      `SELECT id, demande_artisan FROM contacts WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );

    if (contacts.length === 0) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    await connection.query(
      `UPDATE contacts 
       SET demande_artisan = FALSE,
           artisan_note_admin = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [note || 'Demande rejetée', id]
    );

    await connection.commit();

    // Emit socket event to PDG users
    emitToPDG('artisan-request:rejected', {
      contact_id: parseInt(id),
      timestamp: new Date().toISOString()
    });

    res.json({
      message: 'Demande rejetée',
      contact_id: id
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error rejecting artisan request:', err);
    next(err);
  } finally {
    connection.release();
  }
});

// ----------------------------
// WhatsApp notifications
// ----------------------------

// GET /api/notifications/whatsapp/bon-test (public; allowlisted in index.js)
router.get('/whatsapp/bon-test', requireRole('PDG'), async (_req, res) => {
  try {
    const configured = isWhtspServiceConfigured();
    const status = configured ? await getWhtspStatus().catch((e) => ({ ok: false, error: e?.message || 'status_failed' })) : null;
    res.json({
      ok: true,
      whtspConfigured: configured,
      whtspStatus: status,
      publicBaseUrl: process.env.PUBLIC_BASE_URL || null,
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e?.message || 'Erreur test WhatsApp' });
  }
});

// POST /api/notifications/whatsapp/bon
// Body (minimal): { to: string, pdfUrl?: string, message?: string, numero?: string, total?: string|number, devise?: string }
// Optional: { mediaUrls?: string[], templateSid?: string, templateParams?: Record<string,string> }
router.post('/whatsapp/bon', async (req, res) => {
  try {
    const {
      to,
      pdfUrl,
      mediaUrls,
      message,
      numero,
      total,
      devise,
    } = req.body || {};

    if (!to) {
      return res.status(400).json({ ok: false, message: 'Champ "to" requis (numéro destinataire).' });
    }

    if (!isWhtspServiceConfigured()) {
      return res.status(500).json({
        ok: false,
        message: 'WhatsApp service non configuré (WHTSP_SERVICE_BASE_URL / WHTSP_SERVICE_API_KEY).',
      });
    }

    const finalMediaUrls = Array.isArray(mediaUrls) && mediaUrls.length
      ? mediaUrls
      : (pdfUrl ? [pdfUrl] : []);

    const safeNumero = String(numero || '').trim();
    const safeDevise = String(devise || 'DH').trim() || 'DH';
    const safeTotal = total != null && String(total).trim() !== '' ? String(total).trim() : null;

    const defaultBody = [
      'Bonjour,',
      safeNumero ? `Veuillez trouver ci-joint votre bon ${safeNumero}.` : 'Veuillez trouver ci-joint votre document.',
      safeTotal ? `Total: ${safeTotal} ${safeDevise}` : null,
      'Merci.'
    ].filter(Boolean).join('\n');

    const caption = typeof message === 'string' && message.trim() ? message.trim() : defaultBody;

    // If we have a pdf/media URL, send as media with caption; else send plain text.
    let result;
    if (finalMediaUrls.length > 0) {
      // Prefer first URL (the frontend uploads exactly one PDF)
      const mediaPayload = await getMediaPayloadFromUrl(finalMediaUrls[0]);
      result = await sendWhtspMedia({
        phone: to,
        caption,
        base64: mediaPayload?.base64,
        filename: mediaPayload?.filename,
        mimetype: mediaPayload?.mimetype,
      });
    } else {
      result = await sendWhtspText({ phone: to, text: caption });
    }

    return res.json({ ok: true, provider: 'whtsp-service', result });
  } catch (err) {
    console.error('[WhatsApp] /api/notifications/whatsapp/bon error:', err);
    const status = err?.status && Number.isFinite(err.status) ? err.status : 500;
    return res.status(status).json({
      ok: false,
      message: err?.message || 'Erreur serveur WhatsApp',
      details: err?.payload,
    });
  }
});

export default router;
