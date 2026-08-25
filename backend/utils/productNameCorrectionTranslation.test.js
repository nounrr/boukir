import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProductNameCorrectionTranslationMessages,
  getProductNameCorrectionTranslationContext,
  normalizeProductNameCorrectionTranslationResult,
  normalizeProductNameTranslationRequest,
} from './productNameCorrectionTranslation.js';

test('normalise et borne la sélection de traduction', () => {
  assert.deepEqual(normalizeProductNameTranslationRequest({
    ids: ['3', 3, 7, -1, 'x'], target: 'both', mode: 'professional_transliteration',
  }), { ids: [3, 7], target: 'both', mode: 'professional_transliteration' });
  assert.throws(() => normalizeProductNameTranslationRequest({ ids: [], target: 'both', mode: 'professional' }), /Sélectionnez/);
  assert.throws(() => normalizeProductNameTranslationRequest({ ids: [1], target: 'en', mode: 'professional' }), /Langue cible/);
});

test('le contexte produit considère le nom actuel, ancien, FR Pro et AR Pro', () => {
  const context = getProductNameCorrectionTranslationContext({
    reference: 'P-9', product_designation: 'Robini inox', ancienne_designation: 'Krifo inox',
    designation_fr_pro: 'Robinet inox', designation_ar_pro: 'روبيني إينوكس',
  });
  assert.equal(context.entityType, 'product');
  assert.deepEqual(context.candidates, {
    current_name: 'Robini inox', current_ar_name: null, imported_old_name: 'Krifo inox',
    existing_fr_pro: 'Robinet inox', existing_ar_pro: 'روبيني إينوكس', parent_product_name: null,
  });
});

test('le prompt impose Darija, termes professionnels et translittération arabe sans invention', () => {
  const context = getProductNameCorrectionTranslationContext({ variante_originale: 'silicone blanc', product_designation: 'Cartouche' });
  const messages = buildProductNameCorrectionTranslationMessages({
    context, target: 'ar', mode: 'professional_transliteration',
    darija: { isDarija: true, script: 'latin' }, protectedTokens: ['300ML'], darijaGlossary: 'سيليكون = Silicone',
  });
  const prompt = messages.map(({ content }) => content).join('\n');
  assert.match(prompt, /Moroccan Darija/);
  assert.match(prompt, /transliterate its pronunciation into Arabic letters/);
  assert.match(prompt, /300ML/);
  assert.match(prompt, /fr_pro=false/);
  assert.match(prompt, /ar_pro=true/);
});

test('la réponse exige exactement les langues demandées et borne la confiance', () => {
  assert.deepEqual(normalizeProductNameCorrectionTranslationResult({
    fr_pro: 'Robinet en inox', ar_pro: 'صنبور من الستانلس', darija_detected: true,
    notes: 'normalisé', confidence: 2,
  }, 'both'), {
    fr_pro: 'Robinet en inox', ar_pro: 'صنبور من الستانلس', darija_detected: true,
    notes: 'normalisé', confidence: 1,
  });
  assert.throws(() => normalizeProductNameCorrectionTranslationResult({ fr_pro: 'Robinet' }, 'both'), /AR Pro/);
});
