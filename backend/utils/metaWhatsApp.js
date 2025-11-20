// Meta (Facebook) WhatsApp Cloud API utilities
// Uses Graph API to send WhatsApp messages directly without Twilio

const GRAPH_BASE = process.env.META_GRAPH_BASE || 'https://graph.facebook.com';
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v18.0';

const ensureFetch = () => {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is not available in this Node version. Please use Node.js >= 18 or add a fetch polyfill.');
  }
};

export const isMetaConfigured = () => {
  const { FACEBOOK_WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = process.env;
  return Boolean(FACEBOOK_WHATSAPP_TOKEN && WHATSAPP_PHONE_NUMBER_ID);
};

// Normalize MSISDN to WhatsApp international format without prefixes
export const normalizePhoneInternational = (raw) => {
  if (!raw) throw new Error('Phone number is required');
  const country = (process.env.META_DEFAULT_COUNTRY_CODE || '').replace(/\D+/g, '') || '';
  let s = String(raw).trim();
  // remove whatsapp: prefix if present
  s = s.replace(/^whatsapp:/i, '');
  // keep + and digits only
  s = s.replace(/(?!^)[^0-9]/g, '');
  if (s.startsWith('+')) return s.slice(1);
  if (s.startsWith('00')) return s.slice(2);
  if (country && s.startsWith('0')) return country + s.slice(1);
  // assume already includes country code
  return s;
};

// Send a WhatsApp template message via Meta Cloud API
// options: { to, templateName, languageCode, bodyParams (array), headerDocumentLink?, buttonUrl? }
export async function sendMetaTemplateMessage(options = {}) {
  ensureFetch();
  const { FACEBOOK_WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = process.env;
  if (!FACEBOOK_WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error('Meta WhatsApp credentials missing (FACEBOOK_WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID).');
  }

  const {
    to,
    templateName,
    languageCode = process.env.META_WHATSAPP_TEMPLATE_LANG || 'fr',
    bodyParams = [],
    headerDocumentLink,
    buttonUrl,
  } = options;

  if (!to) throw new Error('Missing field: to');
  if (!templateName) throw new Error('Missing field: templateName');

  const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const components = [];

  if (headerDocumentLink) {
    components.push({
      type: 'header',
      parameters: [
        {
          type: 'document',
          document: {
            link: headerDocumentLink,
            filename: options.documentFileName || 'document.pdf',
          },
        },
      ],
    });
  }

  if (Array.isArray(bodyParams) && bodyParams.length > 0) {
    components.push({
      type: 'body',
      parameters: bodyParams.map((text) => ({ type: 'text', text: String(text ?? '') })),
    });
  }

  if (buttonUrl) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: 0,
      parameters: [{ type: 'text', text: buttonUrl }],
    });
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: normalizePhoneInternational(to),
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components,
    },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${FACEBOOK_WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Meta WhatsApp send failed: ${resp.status} ${text}`);
  }
  return resp.json();
}

// Send a plain text message (session message)
export async function sendMetaTextMessage({ to, body }) {
  ensureFetch();
  const { FACEBOOK_WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = process.env;
  if (!FACEBOOK_WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error('Meta WhatsApp credentials missing (FACEBOOK_WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID).');
  }
  if (!to || !body) throw new Error('Missing to or body');

  const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to: normalizePhoneInternational(to),
    type: 'text',
    text: { body },
  };
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${FACEBOOK_WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Meta WhatsApp text send failed: ${resp.status} ${text}`);
  }
  return resp.json();
}
