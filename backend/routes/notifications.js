import express from 'express';
import { sendWhatsAppMessage, isTwilioConfigured } from '../utils/twilioWhatsApp.js';

const router = express.Router();

// POST /api/notifications/whatsapp/send
// Body: { to: string (phone or whatsapp:), body: string, mediaUrls?: string[] }
router.post('/whatsapp/send', async (req, res) => {
  try {
    if (!isTwilioConfigured()) {
      return res.status(400).json({ ok: false, message: 'Twilio WhatsApp is not configured.' });
    }
    const { to, body, mediaUrls } = req.body || {};
    if (!to || !body) {
      return res.status(400).json({ ok: false, message: 'Missing required fields: to, body' });
    }
    const result = await sendWhatsAppMessage({ to, body, mediaUrls });
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, message: err?.message || 'Failed to send WhatsApp message' });
  }
});

export default router;