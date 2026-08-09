import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAdminTransitionMaalemStatus,
  canEditMaalemDraft,
  isArtisanAccount,
  normalizeMaalemProfileRow,
  validateMaalemAdminStatusInput,
  validateMaalemDraftInput,
  validateMaalemProfessionalData,
  validateMaalemSubmission,
} from './maalemProfile.js';
import { computeOrderEarnedRemiseAmount } from './ensureRemiseSchema.js';

test('un Maalem reste éligible par son compte Artisan existant, quel que soit son statut Maalem', () => {
  for (const maalemStatus of ['draft', 'approved', 'rejected', 'suspended']) {
    assert.equal(isArtisanAccount({
      type_compte: 'Artisan/Promoteur',
      maalem_profile: { status: maalemStatus },
    }), true);
  }
  assert.equal(isArtisanAccount({ type_compte: 'Client', artisan_approuve: 1 }), true);
  assert.equal(isArtisanAccount({ type_compte: 'Client', artisan_approuve: 0 }), false);
  assert.equal(isArtisanAccount({ type_compte: 'Maalem' }), false);
});

test('un brouillon accepte une catégorie vide mais refuse un identifiant ambigu', () => {
  assert.deepEqual(validateMaalemDraftInput({ category_id: null }), { valid: true, category_id: null });
  assert.deepEqual(validateMaalemDraftInput({ category_id: 12 }), { valid: true, category_id: 12 });
  assert.equal(validateMaalemDraftInput({}).valid, false);
  assert.equal(validateMaalemDraftInput({ category_id: '12' }).valid, false);
  assert.equal(validateMaalemDraftInput({ category_id: 0 }).valid, false);
});

test('normalise le dossier professionnel et borne les champs', () => {
  const validation = validateMaalemProfessionalData({
    skills: [' Plomberie ', 'Plomberie', 'Soudure'],
    contact_phone: '+212 6 12 34 56 78',
    city: ' Casablanca ',
    intervention_areas: ['Maarif', 'Anfa'],
    experience_years: 8,
    professional_summary: ' Intervention soignée ',
    experiences: 'Chantiers résidentiels',
    availability: 'on_request',
    other_information: '',
  });
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.data.skills, ['Plomberie', 'Soudure']);
  assert.equal(validation.data.city, 'Casablanca');
  assert.equal(validation.data.other_information, null);
  assert.equal(validateMaalemProfessionalData({ skills: 'Plomberie' }).valid, false);
  assert.equal(validateMaalemProfessionalData({ experience_years: 71 }).valid, false);
  assert.equal(validateMaalemProfessionalData({ availability: 'approved' }).valid, false);
});

test('la soumission exige une catégorie active, un dossier complet et un contact', () => {
  const profile = {
    status: 'draft',
    category_id: 4,
    professional_data: {
      skills: ['Dépannage'],
      city: 'Casablanca',
      intervention_areas: ['Maarif'],
      experience_years: 5,
      professional_summary: 'Artisan expérimenté et disponible pour les travaux résidentiels.',
      experiences: 'Cinq années de chantiers résidentiels.',
      availability: 'weekdays',
    },
  };
  assert.equal(validateMaalemSubmission(profile, { is_active: 1, deleted_at: null }, '0612345678').valid, true);
  assert.equal(validateMaalemSubmission({ status: 'draft', category_id: null }, null).valid, false);
  assert.equal(validateMaalemSubmission(profile, { is_active: 0, deleted_at: null }).valid, false);
  assert.equal(validateMaalemSubmission(profile, { is_active: 1, deleted_at: '2026-08-08' }).valid, false);
  assert.equal(validateMaalemSubmission({ ...profile, professional_data: {} }, { is_active: 1, deleted_at: null }).valid, false);
});

test('les transitions Maalem sont indépendantes et explicites', () => {
  assert.equal(canEditMaalemDraft('draft'), true);
  assert.equal(canEditMaalemDraft('rejected'), true);
  assert.equal(canEditMaalemDraft('approved'), false);
  assert.equal(canAdminTransitionMaalemStatus('submitted', 'under_review'), true);
  assert.equal(canAdminTransitionMaalemStatus('under_review', 'approved'), true);
  assert.equal(canAdminTransitionMaalemStatus('approved', 'suspended'), true);
  assert.equal(canAdminTransitionMaalemStatus('suspended', 'approved'), true);
  assert.equal(canAdminTransitionMaalemStatus('approved', 'rejected'), false);
});

test('un refus ou une suspension exige un motif', () => {
  assert.equal(validateMaalemAdminStatusInput({ status: 'rejected' }).valid, false);
  assert.equal(validateMaalemAdminStatusInput({ status: 'suspended', reason: '  ' }).valid, false);
  assert.deepEqual(validateMaalemAdminStatusInput({ status: 'rejected', reason: 'Dossier incomplet' }), {
    valid: true,
    status: 'rejected',
    reason: 'Dossier incomplet',
  });
  assert.equal(validateMaalemAdminStatusInput({ status: 'draft' }).valid, false);
});

test('normalise le profil sans transformer le rôle e-commerce', () => {
  const profile = normalizeMaalemProfileRow({
    id: 8,
    contact_id: 42,
    category_id: 3,
    status: 'suspended',
    professional_data: '{"experience":5}',
    category_nom: 'Plombier',
    category_nom_ar: 'سباك',
    category_is_active: 0,
    contact_nom_complet: 'Artisan Exemple',
    contact_email: 'artisan@example.test',
    contact_telephone: null,
    contact_type_compte: 'Artisan/Promoteur',
  });
  assert.equal(profile.user.type_compte, 'Artisan/Promoteur');
  assert.equal(profile.status, 'suspended');
  assert.equal(profile.category.is_active, false);
  assert.deepEqual(profile.professional_data, { experience: 5 });
});

test('les remises restent pilotées par le type Artisan existant, pas par un rôle Maalem', async () => {
  const calls = [];
  const db = {
    async execute(_sql, params) {
      calls.push(params);
      return [[{ earned: 25 }]];
    },
  };
  assert.equal(await computeOrderEarnedRemiseAmount(db, 91, 'Artisan/Promoteur'), 25);
  assert.deepEqual(calls[0], [1, 91]);
  assert.equal(await computeOrderEarnedRemiseAmount(db, 92, 'Client'), 25);
  assert.deepEqual(calls[1], [0, 92]);
});
