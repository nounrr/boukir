import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePublicMaalem } from './publicMaalem.js';

function approvedRow(overrides = {}) {
  return {
    id: 9,
    status: 'approved',
    is_public: 1,
    category_id: 3,
    category_name: 'Plomberie',
    category_name_ar: 'سباكة',
    nom_complet: 'Maalem Public',
    avatar_url: '/uploads/avatars/maalem.webp',
    professional_data: JSON.stringify({
      city: 'Tanger',
      intervention_areas: ['Tanger', 'Tétouan'],
      skills: ['Diagnostic', 'Réparation'],
      experience_years: 8,
      professional_summary: 'Artisan expérimenté.',
    }),
    contact_is_active: 1,
    contact_is_blocked: 0,
    contact_deleted_at: null,
    deleted_at: null,
    telephone: '0600000000',
    email: 'private@example.test',
    ...overrides,
  };
}

test('le profil public approuvé est strictement whitelisté sans coordonnées privées', () => {
  const result = normalizePublicMaalem(approvedRow());
  assert.equal(result.id, 9);
  assert.equal(result.is_verified, true);
  assert.equal(result.city, 'Tanger');
  assert.deepEqual(result.intervention_areas, ['Tanger', 'Tétouan']);
  assert.equal('telephone' in result, false);
  assert.equal('email' in result, false);
  assert.equal('contact_id' in result, false);
  assert.equal(JSON.stringify(result).includes('0600000000'), false);
});

test('draft, rejected, suspended, supprimé, bloqué ou inactif ne sont jamais publiables', () => {
  const cases = [
    { status: 'draft' },
    { status: 'rejected' },
    { status: 'suspended' },
    { deleted_at: '2026-08-09' },
    { contact_deleted_at: '2026-08-09' },
    { contact_is_blocked: 1 },
    { contact_is_active: 0 },
    { is_public: 0 },
  ];
  for (const overrides of cases) assert.equal(normalizePublicMaalem(approvedRow(overrides)), null);
});
