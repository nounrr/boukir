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
    let { to, body, mediaUrls, templateSid, templateParams } = req.body || {};
    if (!to) {
      return res.status(400).json({ ok: false, message: 'Missing required field: to' });
    }
    
    // Si templateSid est un nom de variable d'environnement, le résoudre
    if (templateSid && templateSid.startsWith('TWILIO_')) {
      const resolvedSid = process.env[templateSid];
      if (!resolvedSid) {
        return res.status(400).json({ 
          ok: false, 
          message: `Template environment variable ${templateSid} not found` 
        });
      }
      templateSid = resolvedSid;
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