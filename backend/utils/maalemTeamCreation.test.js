import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import {
  buildMaalemActivationUrl,
  consumeMaalemActivationToken,
  createMaalemActivationToken,
  hashMaalemActivationToken,
  normalizeContactReference,
  normalizeMaalemIdentityEmail,
  normalizeMoroccanPhone,
  phoneIdentityCandidates,
  validateMaalemTeamCreateInput,
  validateMaalemTeamLookup,
  validateMaalemTeamLookupQuery,
} from './maalemTeamCreation.js';

test('normalise email et variantes du même téléphone marocain', () => {
  assert.equal(normalizeMaalemIdentityEmail('  MAALem@Example.COM '), 'maalem@example.com');
  assert.equal(normalizeMoroccanPhone('06 12 34 56 78'), '+212612345678');
  assert.equal(normalizeMoroccanPhone('212612345678'), '+212612345678');
  assert.deepEqual(phoneIdentityCandidates('+212 612-345-678'), ['+212612345678', '0612345678']);
  assert.equal(normalizeMoroccanPhone('123'), null);
});

test('exige une identité fiable et une catégorie pour la création équipe', () => {
  assert.equal(validateMaalemTeamLookup({}).valid, false);
  assert.equal(validateMaalemTeamLookup({ email: 'incorrect' }).valid, false);
  const valid = validateMaalemTeamCreateInput({
    prenom: ' Amal ',
    nom: ' Artisan ',
    email: 'AMAL@example.com',
    telephone: '0612345678',
    category_id: 4,
    professional_data: { skills: ['Plomberie'], city: 'Tanger' },
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.email, 'amal@example.com');
  assert.equal(valid.telephone, '+212612345678');
  assert.equal(valid.professional_data.contact_phone, '+212612345678');
  assert.equal(valid.professional_data.city, 'Tanger');
  assert.equal(validateMaalemTeamCreateInput({ ...valid, category_id: null }).valid, false);
});

test('la recherche anti-doublon accepte une référence sans affaiblir la création', () => {
  assert.equal(normalizeContactReference('42'), 42);
  assert.equal(normalizeContactReference(' #42 '), 42);
  assert.equal(normalizeContactReference('C42'), 42);
  assert.equal(normalizeContactReference('0'), null);
  assert.equal(normalizeContactReference('-3'), null);
  assert.equal(normalizeContactReference('abc'), null);

  // La référence prime et dispense d'email/téléphone pour la seule recherche.
  const byReference = validateMaalemTeamLookupQuery({ reference: '#42' });
  assert.equal(byReference.valid, true);
  assert.equal(byReference.contactId, 42);
  assert.equal(byReference.email, null);
  assert.equal(byReference.telephone, null);

  assert.equal(validateMaalemTeamLookupQuery({ reference: 'abc' }).valid, false);
  assert.equal(validateMaalemTeamLookupQuery({}).valid, false);

  // Sans référence, le comportement email/téléphone reste inchangé.
  const byEmail = validateMaalemTeamLookupQuery({ email: 'AMAL@example.com' });
  assert.equal(byEmail.valid, true);
  assert.equal(byEmail.email, 'amal@example.com');
  assert.equal(byEmail.contactId, null);

  // La création continue d'exiger un email et un téléphone : une référence ne suffit pas.
  assert.equal(validateMaalemTeamCreateInput({
    prenom: 'Amal', nom: 'Artisan', reference: '42', category_id: 4,
  }).valid, false);
});

test('génère un jeton 256 bits et ne construit le lien qu’avec le jeton brut', () => {
  const generated = createMaalemActivationToken();
  assert.match(generated.token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(generated.token_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(generated.token, generated.token_hash);
  assert.equal(hashMaalemActivationToken(generated.token), generated.token_hash);
  const url = buildMaalemActivationUrl(generated.token, 'fr');
  assert.match(url, /\/fr\/activate-account#token=/);
  assert.equal(url.includes(generated.token_hash), false);
});

test('consomme une invitation une seule fois et stocke uniquement un hash bcrypt', async () => {
  const generated = createMaalemActivationToken();
  let storedTokenHash = generated.token_hash;
  let storedPassword = null;
  const connection = {
    async query(sql, params) {
      if (sql.includes('SELECT id') && sql.includes('reset_token')) {
        return [[storedTokenHash === params[0] ? { id: 81 } : null].filter(Boolean)];
      }
      if (sql.includes('UPDATE contacts')) {
        if (storedTokenHash !== params[2]) return [{ affectedRows: 0 }];
        storedPassword = params[0];
        storedTokenHash = null;
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const contactId = await consumeMaalemActivationToken(connection, {
    token: generated.token,
    password: 'MotDePasseSolide!',
  });
  assert.equal(contactId, 81);
  assert.equal(await bcrypt.compare('MotDePasseSolide!', storedPassword), true);
  assert.equal(storedTokenHash, null);
  assert.equal(await consumeMaalemActivationToken(connection, {
    token: generated.token,
    password: 'AutreMotDePasse!',
  }), null);
});
