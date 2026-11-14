import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { hasPlafondAuthorization } from '../../frontend/src/utils/bonCreditAuthorization.ts';

const source = fs.readFileSync(new URL('../../frontend/src/components/BonFormModal.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('BonFormModal.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let declaration;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'checkClientCreditLimitRealTime') declaration = node;
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(declaration, 'test the actual form precheck used by product, quantity and price inputs');
const js = ts.transpileModule(`const ${declaration.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function preview({ latest = {}, cached = {}, balance = 3072, role = 'Employé', fail = false } = {}) {
  const errors = [];
  let reads = 0;
  const check = vm.runInNewContext(`${js};checkClientCreditLimitRealTime;`, {
    loadClientForExistingBon: async id => ({ id, nom_complet: 'Client test' }),
    getContactCreditLimit: () => ({ amount: 6000, label: 'plafond', details: 'Plafond : 6000 DH' }),
    getContactTotalCumule: () => balance,
    user: { id: 31, role },
    myBonAuthorizations: cached,
    refetchMyBonAuthorizations: () => ({ unwrap: async () => {
      reads++;
      if (fail) throw new Error('unavailable');
      return latest;
    } }),
    hasPlafondAuthorization,
    showError: message => errors.push(message),
    console: { warn() {} },
  });
  return { check, errors, reads: () => reads };
}
const values = { type: 'Sortie', client_id: '798', items: [{ quantite: 44444, prix_unitaire: 460 }] };

test('a client-specific quota permits the exact screenshot case with no global quota', async () => {
  const latest = { bon_plafond_autorisations: 0, plafond_par_client: { 798: 1 } };
  const form = preview({ latest });
  assert.equal(await form.check(values), true);
  assert.equal(form.reads(), 1);
  assert.deepEqual(form.errors, []);
  assert.equal(latest.plafond_par_client[798], 1, 'preview does not consume the permission');
});

test('global quotas and already-over-limit clients can also proceed to backend confirmation', async () => {
  const form = preview({ latest: { bon_plafond_autorisations: 1 }, balance: 7000 });
  assert.equal(await form.check(values), true);
  assert.deepEqual(form.errors, []);
});

test('a quota for another client must not allow this client', async () => {
  const form = preview({ latest: { bon_plafond_autorisations: 0, plafond_par_client: { 799: 1 } } });
  assert.equal(await form.check(values), false);
  assert.equal(form.errors.length, 1);
  assert.match(form.errors[0], /MODIFICATION BLOQUÉE/);
});

test('a fresh grant is recognised and a spent/revoked cached quota is refused', async () => {
  const grant = preview({ cached: { plafond_par_client: {} }, latest: { plafond_par_client: { 798: 1 } } });
  assert.equal(await grant.check(values), true);
  const spent = preview({ cached: { plafond_par_client: { 798: 1 } }, latest: { plafond_par_client: {} } });
  assert.equal(await spent.check(values), false);
});

test('a failed authorization lookup does not use a stale grant', async () => {
  const form = preview({ cached: { plafond_par_client: { 798: 1 } }, fail: true });
  assert.equal(await form.check(values), false);
  assert.match(form.errors[0], /Impossible de vérifier les autorisations/);
});

test('ordinary sales and PDG do not require a quota lookup; cash inputs use the same check', async () => {
  const ordinary = preview();
  assert.equal(await ordinary.check({ ...values, items: [{ quantite: 1, prix_unitaire: 460 }] }), true);
  assert.equal(ordinary.reads(), 0);
  const pdg = preview({ role: 'PDG' });
  assert.equal(await pdg.check(values), true);
  assert.equal(pdg.reads(), 0);
  const cash = preview({ latest: { plafond_par_client: { 798: 1 } } });
  assert.equal(await cash.check({ ...values, type: 'Comptant' }), true);
});

test('quota lookup rejects missing/invalid clients and malformed balances', () => {
  assert.equal(hasPlafondAuthorization({ plafond_par_client: { 798: 1 } }, 798), true);
  assert.equal(hasPlafondAuthorization({ bon_plafond_autorisations: 1 }, ''), false);
  assert.equal(hasPlafondAuthorization({ bon_plafond_autorisations: NaN }, 798), false);
  assert.equal(hasPlafondAuthorization({ plafond_par_client: { 798: -1 } }, 798), false);
  assert.equal(hasPlafondAuthorization(undefined, 798), false);
});
