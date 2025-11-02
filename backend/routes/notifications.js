import express from 'express';
import { sendWhatsAppMessage, isTwilioConfigured } from '../utils/twilioWhatsApp.js';

const router = express.Router();

// POST /api/notifications/whatsapp/send
// Body: { to: string, body?: string, mediaUrls?: string[], templateSid?: string, templateParams?: object }
router.post('/whatsapp/send', async (req, res) => {
  try {
    if (!isTwilioConfigured()) {
      return res.status(400).json({ ok: false, message: 'Twilio WhatsApp is not configured.' });
    }
    const { to, body, mediaUrls, templateSid, templateParams } = req.body || {};
    if (!to) {
      return res.status(400).json({ ok: false, message: 'Missing required field: to' });
    }
    // Soit body (texte libre), soit templateSid (template approuvé)
    if (!body && !templateSid) {
      return res.status(400).json({ ok: false, message: 'Missing required field: body or templateSid' });
    }
    const result = await sendWhatsAppMessage({ to, body, mediaUrls, templateSid, templateParams });
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, message: err?.message || 'Failed to send WhatsApp message' });
  }
});

export default router;