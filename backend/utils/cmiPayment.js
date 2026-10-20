import crypto from 'node:crypto';

// Chaabi Payment (plateforme CMI) - mode "3D Pay Hosting" (kit d'intégration CMI V2.0).
// Le client saisit sa carte sur la page sécurisée CMI : aucune donnée carte ne transite par nos serveurs.
// Flux :
//   1. buildCmiPaymentForm() -> champs signés que le navigateur POST vers CMI_GATEWAY_URL
//   2. CMI appelle callbackUrl (serveur à serveur) -> on vérifie le HASH, l'oid et le montant,
//      on marque la commande payée et on répond ACTION=POSTAUTH / APPROVED / FAILURE
//   3. CMI renvoie le navigateur vers okUrl / failUrl -> on redirige vers la page résultat de l'ecom

export const CMI_TEST_GATEWAY_URL = 'https://test-chaabipayment.cmi.co.ma/fim/est3dgate';

const SUPPORTED_LANGS = new Set(['fr', 'ar', 'en']);

export function normalizeCmiLang(locale) {
  return SUPPORTED_LANGS.has(String(locale)) ? String(locale) : 'fr';
}

function trimSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function getCmiConfig(env = process.env) {
  return {
    gatewayUrl: String(env.CMI_GATEWAY_URL || CMI_TEST_GATEWAY_URL).trim(),
    clientId: String(env.CMI_CLIENT_ID || '').trim(),
    storeKey: String(env.CMI_STORE_KEY || ''),
    currency: String(env.CMI_CURRENCY || '504').trim(),
    // URL publique du backend (joignable depuis Internet par CMI, même en test), ex: https://api.boukirdiamond.com
    backendPublicUrl: trimSlash(env.CMI_BACKEND_PUBLIC_URL),
    // URL publique du site ecom, ex: https://boukirdiamond.com
    shopPublicUrl: trimSlash(env.CMI_SHOP_URL),
    // ACTION=POSTAUTH = débit automatique. Mettre "false" pour confirmer manuellement depuis le Merchant Center.
    autoCapture: String(env.CMI_AUTO_CAPTURE ?? 'true').trim().toLowerCase() !== 'false',
  };
}

export function isCmiConfigured(config = getCmiConfig()) {
  return Boolean(config.clientId && config.storeKey && config.backendPublicUrl && config.shopPublicUrl);
}

// Équivalent de strnatcasecmp (PHP), utilisé par natcasesort dans les scripts officiels CMI.
export function naturalCaseCompare(a, b) {
  const x = String(a).toLowerCase();
  const y = String(b).toLowerCase();
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    const cx = x[i];
    const cy = y[j];
    const dx = cx >= '0' && cx <= '9';
    const dy = cy >= '0' && cy <= '9';
    if (dx && dy) {
      let ei = i;
      let ej = j;
      while (ei < x.length && x[ei] >= '0' && x[ei] <= '9') ei += 1;
      while (ej < y.length && y[ej] >= '0' && y[ej] <= '9') ej += 1;
      const nx = x.slice(i, ei).replace(/^0+/, '') || '0';
      const ny = y.slice(j, ej).replace(/^0+/, '') || '0';
      if (nx.length !== ny.length) return nx.length - ny.length;
      if (nx !== ny) return nx < ny ? -1 : 1;
      i = ei;
      j = ej;
      continue;
    }
    if (cx !== cy) return cx < cy ? -1 : 1;
    i += 1;
    j += 1;
  }
  return (x.length - i) - (y.length - j);
}

const HTML_ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', '#039': "'", '#39': "'" };

function decodeHtmlEntities(value) {
  return value.replace(/&(amp|quot|apos|lt|gt|#0?39);/g, (_, name) => HTML_ENTITIES[name] ?? _);
}

function escapeHashValue(value) {
  return String(value ?? '')
    // Le pare-feu CMI remplace le caractère qui suit "document" par "." (doc CMI V2.0 §4.1.2).
    .replace(/document[\s\S]/gi, (match) => `${match.slice(0, 8)}.`)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|');
}

// Hash "ver3" : valeurs triées par nom de paramètre (hors hash/encoding), séparées par "|",
// suivies de la clé du magasin, puis base64(SHA-512 binaire).
export function buildCmiHashPlaintext(params, storeKey, { normalizeValue = (v) => String(v ?? '').trim() } = {}) {
  const keys = Object.keys(params)
    .filter((key) => {
      const lower = key.toLowerCase();
      return lower !== 'hash' && lower !== 'encoding';
    })
    .sort(naturalCaseCompare);

  return keys.map((key) => `${escapeHashValue(normalizeValue(params[key]))}|`).join('')
    + escapeHashValue(storeKey);
}

export function computeCmiHash(params, storeKey, options) {
  const plain = buildCmiHashPlaintext(params, storeKey, options);
  return crypto.createHash('sha512').update(plain, 'utf8').digest('base64');
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Vérifie le HASH d'une réponse CMI (callback, okUrl, failUrl).
// Les scripts officiels n'appliquent pas la même normalisation partout (callback : sans trim,
// ok/fail : avec trim), on accepte donc les deux variantes.
export function verifyCmiHash(params, storeKey) {
  const received = params?.HASH ?? params?.hash;
  if (!received || !storeKey || typeof received !== 'string') return false;

  const variants = [
    (v) => decodeHtmlEntities(String(v ?? '').replace(/\n$/, '')),
    (v) => decodeHtmlEntities(String(v ?? '')).trim(),
  ];
  return variants.some((normalizeValue) => safeEqual(received, computeCmiHash(params, storeKey, { normalizeValue })));
}

export function formatCmiAmount(amount) {
  return (Math.round(Number(amount || 0) * 100) / 100).toFixed(2);
}

export function cmiAmountsMatch(received, expected) {
  const value = Number(String(received ?? '').replace(',', '.'));
  return Number.isFinite(value) && Math.abs(value - Number(expected || 0)) < 0.005;
}

export function isCmiPaymentApproved(params) {
  return String(params?.ProcReturnCode ?? '').trim() === '00';
}

// Champs BillTo* : on retire accents et caractères spéciaux comme le script officiel 2.SendData.php
// (test de certification "caractères spéciaux").
export function sanitizeCmiText(value, maxLength) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[œŒ]/g, 'oe')
    .replace(/[^a-zA-Z0-9_ -]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function cleanText(value, maxLength) {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, maxLength);
}

export function buildCmiPaymentForm({
  oid,
  amount,
  locale,
  customerName,
  customerEmail,
  customerPhone,
  address,
  city,
  postalCode,
  shopUrl,
}, config = getCmiConfig()) {
  if (!isCmiConfigured(config)) {
    const error = new Error('Paiement par carte (CMI) non configuré');
    error.code = 'CMI_NOT_CONFIGURED';
    throw error;
  }

  const lang = normalizeCmiLang(locale);
  const gatewayBase = `${config.backendPublicUrl}/api/ecommerce/payments/cmi`;

  const fields = {
    clientid: config.clientId,
    storetype: '3D_PAY_HOSTING',
    TranType: 'PreAuth',
    amount: formatCmiAmount(amount),
    currency: config.currency,
    oid: String(oid),
    okUrl: `${gatewayBase}/ok`,
    failUrl: `${gatewayBase}/fail`,
    callbackUrl: `${gatewayBase}/callback`,
    // URL du bouton "Annuler" de la page de paiement CMI.
    shopurl: shopUrl || `${config.shopPublicUrl}/${lang}/checkout`,
    lang,
    rnd: crypto.randomBytes(10).toString('hex'),
    hashAlgorithm: 'ver3',
    refreshtime: '5',
    AutoRedirect: 'true',
    encoding: 'UTF-8',
    // BillToName et email sont obligatoires ; les noms en arabe deviennent vides après nettoyage.
    BillToName: sanitizeCmiText(customerName, 255) || 'Client',
    email: cleanText(customerEmail, 64),
    tel: cleanText(customerPhone, 32).replace(/[^0-9+]/g, ''),
    BillToStreet1: sanitizeCmiText(address, 255),
    BillToCity: sanitizeCmiText(city, 64),
    BillToPostalCode: sanitizeCmiText(postalCode, 32),
    BillToCountry: '504',
  };

  fields.HASH = computeCmiHash(fields, config.storeKey);

  return { url: config.gatewayUrl, fields };
}

// Réponse texte attendue par CMI sur la callbackUrl.
export function cmiCallbackResponse({ hashValid, orderFound, amountValid, approved, autoCapture }) {
  if (!hashValid || !orderFound || !amountValid) return 'FAILURE';
  if (!approved) return 'APPROVED';
  return autoCapture ? 'ACTION=POSTAUTH' : 'APPROVED';
}
