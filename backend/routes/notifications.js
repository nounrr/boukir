import express from 'express';
import { isMetaConfigured, sendMetaTemplateMessage, sendMetaTextMessage } from '../utils/metaWhatsApp.js';

const router = express.Router();

// Utilitaire interne pour appeler le whtsp-service
async function callWhtspService(path, payload) {
  const base = String(process.env.WHTSP_SERVICE_BASE_URL || '').replace(/\/$/, '');
  if (!base) {
    throw new Error('WHTSP_SERVICE_BASE_URL is not configured');
  }
  const apiKey = process.env.WHTSP_SERVICE_API_KEY || '';
  // Debug log to trace outbound WhatsApp service calls
  if (process.env.DEBUG_WHATSAPP === 'true') {
    console.log('[whatsapp][debug] calling whtsp-service:', {
      base,
      path,
      full: base + path,
      hasApiKey: Boolean(apiKey),
    });
  }
  const resp = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
    },
    body: JSON.stringify(payload || {}),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    if (process.env.DEBUG_WHATSAPP === 'true') {
      console.warn('[whatsapp][debug] non-ok response from whtsp-service', resp.status, t?.slice(0, 180));
    }
    throw new Error(`whtsp-service error ${resp.status}: ${t}`);
  }
  return resp.json();
}

// POST /api/notifications/whatsapp/send
// Body: { to: string, body?: string, mediaUrls?: string[], templateSid?: string, templateParams?: object }
router.post('/whatsapp/send', async (req, res) => {
  try {
    let { to, body, mediaUrls, templateSid, templateParams, templateName, languageCode } = req.body || {};
    if (!to) {
      return res.status(400).json({ ok: false, message: 'Missing required field: to' });
    }

    // 1) Prefer local whtsp-service if configured
    if (process.env.WHTSP_SERVICE_BASE_URL) {

      // If body is not provided, try to build it from templateParams (1: name/societe, 2: numero, 3: montant, 4: pdf path)
      if (!body) {
        const p = templateParams || {};
        const name = p['1'] || p[1] || '';
        const numero = p['2'] || p[2] || '';
        const montant = p['3'] || p[3] || '';
        const p4 = p['4'] || p[4];
        let pdfUrl = '';
        if (p4 && typeof p4 === 'string') {
          const pub = process.env.PUBLIC_BASE_URL ? String(process.env.PUBLIC_BASE_URL).replace(/\/$/, '') : '';
          pdfUrl = /^https?:\/\//i.test(p4) ? p4 : (pub ? `${pub}/uploads/bons_pdf/${p4}.pdf` : `/uploads/bons_pdf/${p4}.pdf`);
        }
        body = [
          name ? `Bonjour ${name}` : 'Bonjour',
          numero ? `Bon: ${numero}` : '',
          montant ? `Montant: ${montant}` : '',
          pdfUrl ? `PDF: ${pdfUrl}` : ''
        ].filter(Boolean).join('\n');
      }

      if (!body) {
        return res.status(400).json({ ok: false, message: 'Missing required field: body' });
      }

      try {
        const data = await callWhtspService('/send-text', { phone: to, text: body });
        return res.json({ ok: true, result: data });
      } catch (e) {
        return res.status(502).json({ ok: false, message: e?.message || 'whtsp-service error' });
      }
    }

    // 2) Prefer Meta (Facebook) Cloud API if configured, else fallback to Twilio
    if (isMetaConfigured()) {
      // If we got template params, send a template via Meta
      if (templateParams || templateName) {
        const metaTemplateName = templateName || process.env.META_WHATSAPP_TEMPLATE_NAME;
        if (!metaTemplateName) {
          return res.status(400).json({ ok: false, message: 'Meta templateName missing (provide in request or set META_WHATSAPP_TEMPLATE_NAME)' });
        }

        // Map templateParams object {"1":"...","2":"..."} to ordered array
        const bodyParams = [];
        if (templateParams && typeof templateParams === 'object') {
          const keys = Object.keys(templateParams).sort((a,b) => Number(a) - Number(b));
          for (const k of keys) bodyParams.push(templateParams[k]);
        }

        // Build absolute document URL if param 4 looks like relative PDF path
        let headerDocumentLink;
        const base = process.env.PUBLIC_BASE_URL ? String(process.env.PUBLIC_BASE_URL).replace(/\/$/, '') : '';
        const p4 = templateParams && (templateParams['4'] || templateParams[4]);
        if (p4 && typeof p4 === 'string') {
          // If looks like relative path like "sortie/FILE_ID"
          if (!/^https?:\/\//i.test(p4)) {
            const rel = `/uploads/bons_pdf/${p4}.pdf`;
            headerDocumentLink = base ? `${base}${rel}` : rel; // may be relative if base missing
          } else {
            headerDocumentLink = p4;
          }
        }

        // Optionally use header document or URL button depending on env flags
        const useHeaderDoc = String(process.env.META_TEMPLATE_USE_HEADER_DOC || 'true') === 'true';
        const useButtonUrl = String(process.env.META_TEMPLATE_USE_BUTTON_URL || 'false') === 'true';
        const buttonUrl = useButtonUrl ? headerDocumentLink : undefined;

        const metaResp = await sendMetaTemplateMessage({
          to,
          templateName: metaTemplateName,
          languageCode,
          bodyParams,
          headerDocumentLink: useHeaderDoc ? headerDocumentLink : undefined,
          buttonUrl,
          documentFileName: req.body?.documentFileName || undefined,
        });
        return res.json({ ok: true, result: metaResp });
      }

      // Fallback to session text message via Meta
      if (!body) {
        return res.status(400).json({ ok: false, message: 'Missing required field: body' });
      }
      const metaResp = await sendMetaTextMessage({ to, body });
      return res.json({ ok: true, result: metaResp });
    }

    // 3) If neither whtsp-service nor Meta is configured
    return res.status(400).json({ ok: false, message: 'WhatsApp sending is not configured (whtsp-service or Meta required).' });
  } catch (err) {
    res.status(500).json({ ok: false, message: err?.message || 'Failed to send WhatsApp message' });
  }
});

// POST /api/notifications/whatsapp/bon
// Body attendu : { to: string, pdfUrl: string, numero: string, total: number|string, devise?: string }
// Envoie un message WhatsApp avec texte "Bon N° {numero} - Total: {total} {devise}" + PDF en pièce jointe
// Notes d'utilisation:
//  - Nécessite que le service whtsp-service soit accessible via WHTSP_SERVICE_BASE_URL
//  - WHTSP_SERVICE_API_KEY doit correspondre à WA_API_KEY dans le whtsp-service
//  - pdfUrl peut être une URL absolue (https://...) ou relative; si relative, construire côté frontend une URL publique servie par le backend /uploads
//  - Pour tests sans authentification JWT utiliser /whatsapp/bon-test et ajouter cette route dans PUBLIC_PATHS
router.post('/whatsapp/bon', async (req, res) => {
  try {
    const { to, pdfUrl, numero, total, devise } = req.body || {};

    if (!to) {
      return res.status(400).json({ ok: false, message: 'Missing required field: to' });
    }
    if (!pdfUrl) {
      return res.status(400).json({ ok: false, message: 'Missing required field: pdfUrl' });
    }

    const numStr = numero || '';
    const totalStr =
      total !== undefined && total !== null && total !== ''
        ? String(total)
        : '';
    const currency = devise || process.env.DEFAULT_CURRENCY || 'DH';

    const parts = [];
    if (numStr) parts.push(`Bon N° ${numStr}`);
    if (totalStr) parts.push(`Total: ${totalStr} ${currency}`);
    const caption = parts.join(' - ') || 'Bon en pièce jointe';

    if (!process.env.WHTSP_SERVICE_BASE_URL) {
      return res.status(400).json({
        ok: false,
        message: 'WHTSP_SERVICE_BASE_URL is not configured; whtsp-service required for /whatsapp/bon.',
      });
    }

    let filename = `bon-${numStr || 'document'}.pdf`;
    try {
      const urlObj = new URL(pdfUrl);
      const last = urlObj.pathname.split('/').pop();
      if (last && /\.pdf$/i.test(last)) {
        filename = last;
      }
    } catch (_) {
      // ignore URL parse errors, keep default filename
    }

    // Tentative d'encodage base64 côté backend pour contourner blocages réseau.
    const forceBase64 = String(process.env.WHATSAPP_FORCE_BASE64 || 'false') === 'true';
    let sendPayload;
    let didBase64 = false;
    if (forceBase64) {
      try {
        const resp = await fetch(pdfUrl);
        if (resp.ok) {
          const buff = Buffer.from(await resp.arrayBuffer());
          sendPayload = {
            phone: to,
            caption,
            base64: buff.toString('base64'),
            mimetype: 'application/pdf',
            filename
          };
          didBase64 = true;
        }
      } catch (_) {}
    }
    if (!sendPayload) {
      try {
        const resp = await fetch(pdfUrl);
        if (resp.ok && resp.headers.get('content-type')?.includes('pdf')) {
          const buff = Buffer.from(await resp.arrayBuffer());
          sendPayload = {
            phone: to,
            caption,
            base64: buff.toString('base64'),
            mimetype: 'application/pdf',
            filename
          };
          didBase64 = true;
        }
      } catch (_) {}
    }
    if (!sendPayload) {
      sendPayload = {
        phone: to,
        caption,
        mediaUrl: pdfUrl,
        filename,
        mimetype: 'application/pdf'
      };
    }
    if (process.env.DEBUG_WHATSAPP === 'true') {
      console.log('[whatsapp][debug] /whatsapp/bon payload mode:', didBase64 ? 'base64' : 'mediaUrl');
    }
    try {
      const data = await callWhtspService('/send-media', sendPayload);
      return res.json({ ok: true, result: data, mode: didBase64 ? 'base64' : 'mediaUrl' });
    } catch (err) {
      const msg = err?.message || '';
      const fallbackText = [caption, pdfUrl ? `PDF: ${pdfUrl}` : ''].filter(Boolean).join('\n');
      try {
        const data = await callWhtspService('/send-text', { phone: to, text: fallbackText });
        return res.json({ ok: true, result: data, fallback: 'send-text', originalError: msg });
      } catch (err2) {
        return res.status(502).json({ ok: false, message: err2?.message || msg });
      }
    }
  } catch (err) {
    return res.status(500).json({ ok: false, message: err?.message || 'Failed to send WhatsApp bon' });
  }
});

// Route de TEST SANS AUTH (à exposer en PUBLIC_PATHS si besoin)
// POST /api/notifications/whatsapp/bon-test
// Même body que /whatsapp/bon mais sans passer par verifyToken
// A n'utiliser qu'en phase de test; retirer de PUBLIC_PATHS en production.
router.post('/whatsapp/bon-test', async (req, res) => {
  try {
    const { to, pdfUrl, numero, total, devise } = req.body || {};

    if (!to) {
      return res.status(400).json({ ok: false, message: 'Missing required field: to' });
    }
    if (!pdfUrl) {
      return res.status(400).json({ ok: false, message: 'Missing required field: pdfUrl' });
    }

    const numStr = numero || '';
    const totalStr =
      total !== undefined && total !== null && total !== ''
        ? String(total)
        : '';
    const currency = devise || process.env.DEFAULT_CURRENCY || 'DH';

    const parts = [];
    if (numStr) parts.push(`Bon N° ${numStr}`);
    if (totalStr) parts.push(`Total: ${totalStr} ${currency}`);
    const caption = parts.join(' - ') || 'Bon en pièce jointe';

    if (!process.env.WHTSP_SERVICE_BASE_URL) {
      return res.status(400).json({
        ok: false,
        message: 'WHTSP_SERVICE_BASE_URL is not configured; whtsp-service required for /whatsapp/bon-test.',
      });
    }

    let filename = `bon-${numStr || 'document'}.pdf`;
    try {
      const urlObj = new URL(pdfUrl);
      const last = urlObj.pathname.split('/').pop();
      if (last && /\.pdf$/i.test(last)) {
        filename = last;
      }
    } catch (_) {}

    let sendPayload;
    let didBase64 = false;
    try {
      const resp = await fetch(pdfUrl);
      if (resp.ok && resp.headers.get('content-type')?.includes('pdf')) {
        const buff = Buffer.from(await resp.arrayBuffer());
        sendPayload = {
          phone: to,
          caption,
          base64: buff.toString('base64'),
          mimetype: 'application/pdf',
          filename
        };
        didBase64 = true;
      }
    } catch (_) {}
    if (!sendPayload) {
      sendPayload = {
        phone: to,
        caption,
        mediaUrl: pdfUrl,
        filename,
        mimetype: 'application/pdf'
      };
    }
    if (process.env.DEBUG_WHATSAPP === 'true') {
      console.log('[whatsapp][debug] /whatsapp/bon-test payload mode:', didBase64 ? 'base64' : 'mediaUrl');
    }
    try {
      const data = await callWhtspService('/send-media', sendPayload);
      return res.json({ ok: true, result: data, mode: didBase64 ? 'base64' : 'mediaUrl' });
    } catch (err) {
      const msg = err?.message || '';
      const fallbackText = [caption, pdfUrl ? `PDF: ${pdfUrl}` : ''].filter(Boolean).join('\n');
      try {
        const data = await callWhtspService('/send-text', { phone: to, text: fallbackText });
        return res.json({ ok: true, result: data, fallback: 'send-text', originalError: msg });
      } catch (err2) {
        return res.status(502).json({ ok: false, message: err2?.message || msg });
      }
    }
  } catch (err) {
    return res.status(500).json({ ok: false, message: err?.message || 'Failed to send WhatsApp bon-test' });
  }
});

export default router;
