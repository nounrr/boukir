import assert from 'node:assert/strict';
import test from 'node:test';
import { whatsappTemplateBody, whatsappTextBody } from './otpDelivery.js';

const env = { WHATSAPP_TEMPLATE: 'boukir_code', WHATSAPP_TEMPLATE_LANG: 'fr' };

test('WhatsApp: the authentication template carries the code in its text and its copy button', () => {
  const body = whatsappTemplateBody('06 12 34 56 78', '482913', env);
  assert.equal(body.to, '212612345678');
  assert.equal(body.template.name, 'boukir_code');
  assert.equal(body.template.language.code, 'fr');
  assert.deepEqual(body.template.components, [
    { type: 'body', parameters: [{ type: 'text', text: '482913' }] },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '482913' }] },
  ]);
});

test('WhatsApp: a template without a button gets only the text', () => {
  const body = whatsappTemplateBody('0612345678', '111222', { ...env, WHATSAPP_TEMPLATE_BUTTON: '0' });
  assert.equal(body.template.components.length, 1);
});

test('WhatsApp: without a template, the code goes as plain text', () => {
  const body = whatsappTextBody('0612345678', 'Boukir Diamond : votre code est 111222');
  assert.equal(body.type, 'text');
  assert.equal(body.to, '212612345678');
  assert.match(body.text.body, /111222/);
});
