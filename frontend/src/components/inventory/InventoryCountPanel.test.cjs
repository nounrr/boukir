const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
require.extensions['.ts'] = require.extensions['.tsx'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, filename);
function stub(file, exports) {
  const filename = require.resolve(file);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
let sessionsState, summaryState;
let summaryArgs, summaryOptions, entriesOptions;
stub('../../store/api/inventoryCountingApi.ts', {
  useListInventoryCountSessionsQuery: () => sessionsState,
  useGetInventoryCountSummaryQuery: (args, options) => { summaryArgs = args; summaryOptions = options; return summaryState; },
  useGetInventoryCountEntriesQuery: (_args, options) => { entriesOptions = options; return {}; },
  useCreateInventoryCountSessionMutation: () => [() => {}, {}],
  useRotateInventoryCountLinkMutation: () => [() => {}, {}],
  useCloseInventoryCountSessionMutation: () => [() => {}, {}],
});
stub('../../utils/notifications.ts', { showError() {} });
const { default: Panel, InventoryCountSummaryTable, InventoryCountEntriesTable } = require('./InventoryCountPanel.tsx');
const session = { id: 8, title: 'Inventaire magasin', is_closed: false, created_at: '2026-11-13T08:00:00Z', item_count: 2, participant_count: 2, entry_count: 4, total_quantity: 10 };
const items = [
  { entity_key: 'p:12', product_id: 12, variant_id: null, designation: 'Peinture test', variant_name: null, reference: 'P12', quantity: 10, entry_count: 3, participants: [{ name: 'Amine', quantity: 8, entry_count: 2 }, { name: 'Sara', quantity: 2, entry_count: 1 }] },
  { entity_key: 'p:12:v:30', product_id: 12, variant_id: 30, designation: 'Peinture test', variant_name: 'Blanc 5 kg', reference: 'V30', quantity: 0, entry_count: 1, participants: [{ name: 'Amine', quantity: 0, entry_count: 1 }] },
];
const render = canManage => renderToStaticMarkup(React.createElement(Panel, { canManage }));
function loaded() {
  sessionsState = { currentData: { sessions: [session] }, refetch() {} };
  summaryState = { currentData: { items, pagination: { page: 1, limit: 50, total: 2 } }, refetch() {} };
}

test('summary keeps root product and variant separate and shows every contributor quantity, including zero', () => {
  const html = renderToStaticMarkup(React.createElement(InventoryCountSummaryTable, { items, onShowEntries() {} }));
  assert.equal((html.match(/<tr\b/g) || []).length, 3);
  for (const label of ['Peinture test', 'Blanc 5 kg', 'P12', 'V30', 'Amine', 'Sara', '2 saisies', 'Voir les 3 saisies']) assert.ok(html.includes(label), label);
  assert.match(html, />Produit<\/span>/);
  assert.match(html, />Variante<\/span>/);
  assert.match(html, /tabular-nums[^>]*>0<\/span>/);
});

test('entry history retains repeated submissions from the same person', () => {
  const entries = [
    { id: 1, product_id: 12, variant_id: null, designation: 'Produit répété', reference: 'P12', name: 'Amine', quantity: 3, created_at: '2026-11-13T08:00:00Z' },
    { id: 2, product_id: 12, variant_id: null, designation: 'Produit répété', reference: 'P12', name: 'Amine', quantity: 5, created_at: '2026-11-13T08:01:00Z' },
    { id: 3, product_id: 12, variant_id: 30, designation: 'Produit répété', variant_name: 'Variante A', reference: 'V30', name: 'Sara', quantity: 1.25, created_at: '2026-11-13T08:02:00Z' },
  ];
  const html = renderToStaticMarkup(React.createElement(InventoryCountEntriesTable, { entries }));
  assert.equal((html.match(/<tr\b/g) || []).length, 4);
  assert.equal((html.match(/>Amine<\/td>/g) || []).length, 2);
  assert.match(html, /1,25/);
  assert.match(html, /2026-11-13T08:01:00Z/);
});

test('managers get link controls while read-only viewers only see counts', () => {
  loaded();
  const editable = render(true);
  for (const label of ['Créer un lien de comptage', 'Remplacer le lien', 'Clôturer les saisies', 'Historique des saisies']) assert.ok(editable.includes(label));
  assert.equal(summaryArgs.id, 8);
  assert.equal(summaryOptions.skip, false);
  assert.equal(entriesOptions.skip, true);
  const readonly = render(false);
  assert.doesNotMatch(readonly, /Créer un lien de comptage|Remplacer le lien|Clôturer les saisies/);
  assert.match(readonly, /Quantités par personne/);
  assert.match(readonly, /Peinture test/);
});

test('empty, loading and failed states are explicit and no stale quantities appear on error', () => {
  sessionsState = { isLoading: true }; summaryState = {};
  assert.match(render(false), /Chargement des comptages/);
  assert.equal(summaryOptions.skip, true);
  sessionsState = { currentData: { sessions: [] } };
  assert.match(render(false), /Aucun comptage par lien/);
  loaded(); summaryState = { ...summaryState, isError: true };
  const failed = render(false);
  assert.match(failed, /Impossible de charger les quantités/);
  assert.doesNotMatch(failed, /Peinture test|Blanc 5 kg/);
  sessionsState = { isError: true };
  assert.match(render(false), /Impossible de charger les comptages/);
});
