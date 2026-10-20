import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCmiHashPlaintext,
  buildCmiPaymentForm,
  cmiAmountsMatch,
  cmiCallbackResponse,
  computeCmiHash,
  getCmiConfig,
  isCmiPaymentApproved,
  sanitizeCmiText,
  verifyCmiHash,
} from './cmiPayment.js';

// Exemple de la doc "IntegrationPaiementEnLigneCMI V2.0" §4.1.2.
// Hash attendu calculé avec l'algorithme PHP officiel du kit (2.SendData.php).
const DOC_EXAMPLE = {
  clientId: '100200127',
  amount: '95.93',
  okurl: 'http://localhost:8080/SampleCodeJSPTest/GenericVer3ResponseHandler',
  failUrl: 'http://localhost:8080/SampleCodeJSPTest/GenericVer3ResponseHandler',
  TranType: 'PreAuth',
  email: '',
  callbackUrl: 'http://localhost:8080/SampleCodeJSPTest/GateResponseControl.jsp',
  currency: '504',
  rnd: '87954458746',
  storeType: '3d_pay_hosting',
  lang: 'en',
  hashAlgorithm: 'ver3',
  BillToName: 'name',
  BillTocompany: 'billToCompany',
  encoding: 'UTF-8',
};

const BS = '\\';

test('ordre des paramètres identique à la doc CMI', () => {
  assert.equal(
    buildCmiHashPlaintext(DOC_EXAMPLE, 'ABCD1234'),
    '95.93|billToCompany|name|http://localhost:8080/SampleCodeJSPTest/GateResponseControl.jsp|100200127|504||'
      + 'http://localhost:8080/SampleCodeJSPTest/GenericVer3ResponseHandler|ver3|en|'
      + 'http://localhost:8080/SampleCodeJSPTest/GenericVer3ResponseHandler|87954458746|3d_pay_hosting|PreAuth|ABCD1234'
  );
});

test('hash identique au script PHP officiel', () => {
  assert.equal(
    computeCmiHash(DOC_EXAMPLE, 'ABCD1234'),
    'dWwg8VGSfMk4lzQ+x62lh0AWl/sJdfGV6G/OEK6CmezXXrzNpsh78bZhDUkHXJoZnVPCAEqfc1raQ26VHyvRvg=='
  );

  const withEscapes = {
    oid: `ORDER-256712jbs${BS}j6b|`,
    BillToName: ' Hamid ',
    amount: '10.25',
    Desc1: 'Ciment é ç',
    desc10: 'x',
    desc2: 'y',
    'EXTRA.CARDBRAND': 'VISA',
    ProcReturnCode: '00',
    HASH: 'ignored',
    clientIp: '1.2.3.4',
    Response: 'Approved',
  };
  assert.equal(
    computeCmiHash(withEscapes, `Te|st${BS}Key`),
    '9Np7utXtyG+N/neC3yO8QVqxSem+WBNUzpClSD4fdT+8pENVg+IyKK9jAMJYaXcRGvaHW7bkqB1SR3Cc21wAMg=='
  );
});

test('le caractère qui suit "document" est remplacé par un point', () => {
  assert.equal(buildCmiHashPlaintext({ a: 'documentabc' }, 'k'), 'document.bc|k');
  assert.equal(buildCmiHashPlaintext({ a: 'document abc' }, 'k'), 'document.abc|k');
});

test('vérifie le HASH d\'une réponse CMI et rejette toute modification', () => {
  const response = { oid: 'ORD-1', amount: '150.00', ProcReturnCode: '00', Response: 'Approved', encoding: 'UTF-8' };
  response.HASH = computeCmiHash(response, 'SECRET');

  assert.equal(verifyCmiHash(response, 'SECRET'), true);
  assert.equal(verifyCmiHash(response, 'WRONG'), false);
  assert.equal(verifyCmiHash({ ...response, amount: '1.00' }, 'SECRET'), false);
  assert.equal(verifyCmiHash({ ...response, HASH: undefined }, 'SECRET'), false);
});

test('formulaire de paiement signé avec les champs obligatoires', () => {
  const config = getCmiConfig({
    CMI_CLIENT_ID: '820010076',
    CMI_STORE_KEY: 'SECRET',
    CMI_BACKEND_PUBLIC_URL: 'https://api.example.ma/',
    CMI_SHOP_URL: 'https://shop.example.ma',
  });
  const { url, fields } = buildCmiPaymentForm({
    oid: 'ORD-ABC',
    amount: 1234.5,
    locale: 'ar',
    customerName: 'Hélène Çaïd',
    customerEmail: 'client@example.ma',
    customerPhone: '06 12 34 56 78',
    city: 'Tanger',
  }, config);

  assert.equal(url, 'https://test-chaabipayment.cmi.co.ma/fim/est3dgate');
  assert.equal(fields.clientid, '820010076');
  assert.equal(fields.amount, '1234.50');
  assert.equal(fields.currency, '504');
  assert.equal(fields.TranType, 'PreAuth');
  assert.equal(fields.storetype, '3D_PAY_HOSTING');
  assert.equal(fields.hashAlgorithm, 'ver3');
  assert.equal(fields.lang, 'ar');
  assert.equal(fields.BillToName, 'Helene Caid');
  assert.equal(fields.tel, '0612345678');
  assert.equal(fields.callbackUrl, 'https://api.example.ma/api/ecommerce/payments/cmi/callback');
  assert.equal(fields.okUrl, 'https://api.example.ma/api/ecommerce/payments/cmi/ok');
  assert.equal(fields.HASH, computeCmiHash(fields, 'SECRET'));
});

test('refuse de construire le formulaire sans configuration', () => {
  assert.throws(
    () => buildCmiPaymentForm({ oid: 'X', amount: 1 }, getCmiConfig({})),
    (err) => err.code === 'CMI_NOT_CONFIGURED'
  );
});

test('nettoyage des noms (accents, arabe)', () => {
  assert.equal(sanitizeCmiText("  Jean-Noël d'Ouarzazate  ", 255), 'Jean-Noel dOuarzazate');
  assert.equal(sanitizeCmiText('محمد', 255), '');
});

test('montant et code retour', () => {
  assert.equal(cmiAmountsMatch('150.00', 150), true);
  assert.equal(cmiAmountsMatch('150,00', 150), true);
  assert.equal(cmiAmountsMatch('149.99', 150), false);
  assert.equal(isCmiPaymentApproved({ ProcReturnCode: '00' }), true);
  assert.equal(isCmiPaymentApproved({ ProcReturnCode: '99' }), false);
  assert.equal(isCmiPaymentApproved({}), false);
});

test('réponse au callback selon les règles CMI', () => {
  const ok = { hashValid: true, orderFound: true, amountValid: true, approved: true, autoCapture: true };
  assert.equal(cmiCallbackResponse(ok), 'ACTION=POSTAUTH');
  assert.equal(cmiCallbackResponse({ ...ok, autoCapture: false }), 'APPROVED');
  assert.equal(cmiCallbackResponse({ ...ok, approved: false }), 'APPROVED');
  assert.equal(cmiCallbackResponse({ ...ok, hashValid: false }), 'FAILURE');
  assert.equal(cmiCallbackResponse({ ...ok, amountValid: false }), 'FAILURE');
  assert.equal(cmiCallbackResponse({ ...ok, orderFound: false }), 'FAILURE');
});
