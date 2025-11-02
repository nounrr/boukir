import twilio from 'twilio';

let twilioClient;

const getTwilioClient = () => {
  if (!twilioClient) {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      throw new Error('Twilio credentials are missing (check TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN).');
    }
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
};

const normalizeWhatsAppAddress = (raw) => {
  if (!raw) {
    throw new Error('A recipient phone number is required.');
  }
  // Remove sneaky unicode controls sometimes present when copying numbers
  const cleaned = String(raw)
    .replace(/[\u202A\u202C\u200E\u200F]/g, '') // LRE, PDF, LRM, RLM
    .trim();
  // Strip optional whatsapp: prefix then normalize digits
  let phone = cleaned.replace(/^whatsapp:/i, '').trim();
  // Keep only digits and leading +
  phone = phone.replace(/(?!^)[^0-9]/g, '');
  if (!phone.startsWith('+')) {
    phone = `+${phone}`;
  }
  return `whatsapp:${phone}`;
};

export const isTwilioConfigured = () => {
  const {
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_WHATSAPP_FROM,
    TWILIO_MESSAGING_SERVICE_SID,
  } = process.env;
  return Boolean((TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) && (TWILIO_WHATSAPP_FROM || TWILIO_MESSAGING_SERVICE_SID));
};

export const sendWhatsAppMessage = async ({ to, body, mediaUrls, from, templateSid, templateParams } = {}) => {
  // Pour les templates, body n'est pas requis (les params suffisent)
  if (!templateSid && !body) {
    throw new Error('Message body or templateSid is required.');
  }
  if (!isTwilioConfigured()) {
    const {
      TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN,
      TWILIO_WHATSAPP_FROM,
      TWILIO_MESSAGING_SERVICE_SID,
    } = process.env;
    const missing = [];
    if (!TWILIO_ACCOUNT_SID) missing.push('TWILIO_ACCOUNT_SID');
    if (!TWILIO_AUTH_TOKEN) missing.push('TWILIO_AUTH_TOKEN');
    if (!TWILIO_WHATSAPP_FROM && !TWILIO_MESSAGING_SERVICE_SID) missing.push('TWILIO_WHATSAPP_FROM or TWILIO_MESSAGING_SERVICE_SID');
    throw new Error(`Twilio WhatsApp configuration is incomplete. Missing: ${missing.join(', ')}`);
  }

  const client = getTwilioClient();

  // Normalize media URLs to be publicly reachable by Twilio
  const normalizeMedia = (urls) => {
    if (!Array.isArray(urls)) return [];
    const base = process.env.PUBLIC_BASE_URL ? String(process.env.PUBLIC_BASE_URL).replace(/\/$/, '') : '';
    return urls
      .filter(Boolean)
      .map((raw) => {
        try {
          const s = String(raw);
          // If relative URL like /uploads/..., prepend base if available
          if (s.startsWith('/')) {
            return base ? `${base}${s}` : s;
          }
          const u = new URL(s);
          // If pointing to localhost/127.0.0.1, replace origin with PUBLIC_BASE_URL if set
          if (base && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) {
            const baseUrl = new URL(base);
            u.protocol = baseUrl.protocol;
            u.host = baseUrl.host; // includes hostname:port
            return u.toString();
          }
          return u.toString();
        } catch {
          // Fallback: if base exists and raw looks like a path without scheme, join
          if (base) {
            const joined = `${base}/${String(raw).replace(/^\//, '')}`;
            return joined;
          }
          return String(raw);
        }
      });
  };

  const normalizedMediaUrls = normalizeMedia(mediaUrls);

  const messagePayload = {
    to: normalizeWhatsAppAddress(to),
  };

  // Si on utilise un template approuvé
  if (templateSid) {
    messagePayload.contentSid = templateSid;
    
    // ContentVariables pour les templates avec paramètres
    if (templateParams && Object.keys(templateParams).length > 0) {
      messagePayload.contentVariables = JSON.stringify(templateParams);
    }
    
    console.log('[WhatsApp] Sending with approved template:', templateSid, templateParams);
  } else {
    // Message texte libre (sandbox ou session dans les 24h)
    messagePayload.body = body;
  }

  const { TWILIO_MESSAGING_SERVICE_SID, TWILIO_WHATSAPP_FROM } = process.env;
  if (TWILIO_MESSAGING_SERVICE_SID) {
    messagePayload.messagingServiceSid = TWILIO_MESSAGING_SERVICE_SID;
  } else {
    messagePayload.from = normalizeWhatsAppAddress(from || TWILIO_WHATSAPP_FROM);
  }

  // Pour les templates, les mediaUrls sont passées via contentVariables, pas mediaUrl
  if (!templateSid && normalizedMediaUrls.length > 0) {
    messagePayload.mediaUrl = normalizedMediaUrls;
  }

  try {
    if (messagePayload.mediaUrl) {
      console.log('[WhatsApp] Sending with mediaUrl:', messagePayload.mediaUrl);
    }
    const result = await client.messages.create(messagePayload);
    return {
      sid: result.sid,
      status: result.status,
      to: result.to,
      dateCreated: result.dateCreated,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    err.message = `Failed to send WhatsApp message: ${err.message}`;
    throw err;
  }
};
