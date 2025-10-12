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
  const trimmed = String(raw).trim();
  if (trimmed.startsWith('whatsapp:')) {
    return trimmed;
  }
  const digits = trimmed.startsWith('+') ? trimmed : `+${trimmed.replace(/[^0-9]/g, '')}`;
  return `whatsapp:${digits}`;
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

export const sendWhatsAppMessage = async ({ to, body, mediaUrls, from } = {}) => {
  if (!body) {
    throw new Error('Message body is required.');
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
  const messagePayload = {
    to: normalizeWhatsAppAddress(to),
    body,
  };

  const { TWILIO_MESSAGING_SERVICE_SID, TWILIO_WHATSAPP_FROM } = process.env;
  if (TWILIO_MESSAGING_SERVICE_SID) {
    messagePayload.messagingServiceSid = TWILIO_MESSAGING_SERVICE_SID;
  } else {
    messagePayload.from = normalizeWhatsAppAddress(from || TWILIO_WHATSAPP_FROM);
  }

  if (Array.isArray(mediaUrls) && mediaUrls.length > 0) {
    messagePayload.mediaUrl = mediaUrls;
  }

  try {
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
