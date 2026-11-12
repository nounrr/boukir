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
let events = [];
let failed = false;
stub('../../store/api/pointageApi.ts', {
  useGetPointageStatusQuery: () => ({ data: { configured: true, device_key: '505', timezone: 'Africa/Casablanca' } }),
  useGetPointageEventsQuery: () => ({ currentData: { data: events, pagination: { total: events.length } }, isError: failed }),
  useLinkPointageIdentityMutation: () => [() => {}, {}],
});
stub('../../store/api/absencesApi.ts', { useGetAbsenceEmployeesQuery: () => ({ data: [] }) });
stub('../../utils/notifications.ts', {});
stub('../../hooks/redux.ts', { useAuth: () => ({ token: 'test-token' }) });
const Panel = require('./PointagePanel.tsx').default;
const render = canConfigure => renderToStaticMarkup(React.createElement(Panel, { canConfigure }));

test('pointage journal shows correct days, entry/exit and unmatched identity without guessing', () => {
  events = [
    { id: 1, person_id: '42', employe_id: 7, nom_complet: 'Employé Test', date_pointage: '2026-11-12', heure_pointage: '08:02:00', direction: 'entree', method: 'face' },
    { id: 2, person_id: '42', employe_id: 7, nom_complet: 'Employé Test', date_pointage: '2026-11-12', heure_pointage: '18:01:00', direction: 'sortie', method: 'finger' },
    { id: 3, person_id: 'new-43', date_pointage: '2026-11-12', heure_pointage: '08:05:00', direction: 'inconnu', method: 'finger' },
  ];
  const html = render(true);
  for (const content of ['Employé Test', '2026-11-12', '08:02:00', '18:01:00', 'Entrée', 'Sortie', 'Visage', 'Empreinte', 'Sens à confirmer', 'À associer : new-43']) assert.ok(html.includes(content));
  assert.match(html, /Paramètres de la pointeuse/);
  assert.match(html, /<th[^>]*>Photo<\/th>/);
  assert.match(html, /Sans photo/);
  assert.doesNotMatch(render(false), /Paramètres de la pointeuse/);
});

test('pointage errors do not present stale or empty results as successful', () => {
  failed = true;
  const html = render(false);
  assert.match(html, /Impossible de charger les pointages/);
  assert.doesNotMatch(html, /Employé Test|Aucun passage reçu/);
});
