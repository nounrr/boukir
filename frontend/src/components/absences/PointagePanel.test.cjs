const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { MemoryRouter } = require('react-router-dom');
require.extensions['.ts'] = require.extensions['.tsx'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, filename);
function stub(file, exports) {
  const filename = require.resolve(file);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
let state;
let queryArgs;
stub('../../store/api/pointageApi.ts', {
  useGetDailyPresenceQuery: args => { queryArgs = args; return state; },
  useGetPointageEventsQuery: () => ({ currentData: { data: [], pagination: { total: 0 } } }),
});
stub('./PointagePhoto.tsx', ({ eventId }) => React.createElement('span', { 'data-photo-event': eventId }, 'Photo'));
const { default: Panel, DailyPresenceTable, durationLabel } = require('./PointagePanel.tsx');
const row = patch => ({ key: '1-2026-11-12', employe_id: 1, nom_complet: 'Employé Test', cin: 'AB1', role: 'Employé', date_pointage: '2026-11-12', obligatoire: true, statut: 'absent', entree: null, sortie: null, temps_travail_minutes: 0, temps_en_cours: false, entree_event_id: null, sortie_event_id: null, entree_has_photo: false, sortie_has_photo: false, anomalies: [], passages_count: 0, absence_saisie: null, ...patch });
const data = rows => ({ data: rows, timezone: 'Africa/Casablanca', today: '2026-11-12', pagination: { page: 1, limit: 50, total: rows.length }, summary: { absent: 1, present: 1, termine: 1, temps_travail_minutes: 480 }, employees: [{ id: 1, nom_complet: 'Employé Test', cin: 'AB1' }], unassigned_count: 0 });
const render = (canConfigure = true) => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Panel, { month: '2026-11', onMonthChange() {}, canConfigure })));

test('daily register combines entry and exit into one employee/day row with work hours and photos', () => {
  const rows = [
    row({ key: '1-2026-11-12', statut: 'termine', entree: '08:00:00', sortie: '15:35:00', temps_travail_minutes: 455, entree_event_id: 41, sortie_event_id: 42, entree_has_photo: true, sortie_has_photo: true }),
    row({ key: '2-2026-11-12', employe_id: 2, nom_complet: 'Absent Test' }),
    row({ key: '3-2026-11-12', employe_id: 3, nom_complet: 'Présent Test', statut: 'present', entree: '08:15:00', temps_travail_minutes: 25, temps_en_cours: true }),
  ];
  state = { currentData: data(rows) };
  const html = render();
  for (const content of ['Entrée / sortie', '08:00:00', '15:35:00', '7 h 35', 'Travail terminé', 'Absent Test', 'Présent Test', 'Sortie attendue', 'En cours']) assert.ok(html.includes(content), content);
  assert.equal((html.match(/<tr\b/g) || []).length, 4);
  assert.match(html, /Faites défiler le tableau horizontalement/);
  assert.match(html, /sm:hidden/);
  assert.match(html, /data-photo-event="41"/);
  assert.match(html, /data-photo-event="42"/);
  assert.doesNotMatch(html, /Numéro de série|Paramètres de la pointeuse|Associer les identifiants/);
  assert.equal(queryArgs.month, '2026-11');
  assert.equal(queryArgs.page, 1);
});

test('filters expose month/day, employee, statuses and month-bound date selection', () => {
  state = { currentData: data([]) };
  const html = render();
  assert.match(html, /aria-label="Mois des présences"/);
  assert.match(html, /aria-label="Jour des présences"/);
  assert.match(html, /min="2026-11-01" max="2026-11-12"/);
  for (const value of ['value="absent"', 'value="present"', 'value="termine"', 'Nom ou CIN…']) assert.ok(html.includes(value));
  assert.match(html, /Choisir les employés obligés de pointer/);
  assert.doesNotMatch(render(false), /Choisir les employés obligés de pointer/);
});

test('missing exit remains explicit and never shows invented work completion', () => {
  const html = renderToStaticMarkup(React.createElement(DailyPresenceTable, { rows: [row({ statut: 'present', entree: '08:10:00', anomalies: ['sortie_manquante'], absence_saisie: { id: 1, type_absence: 'partielle', motif: 'Note' } })] }));
  assert.match(html, /Sortie manquante/);
  assert.doesNotMatch(html, /Sortie attendue/);
  assert.match(html, /Absence saisie : partielle/);
  assert.doesNotMatch(html, /Travail terminé/);
  assert.equal(durationLabel(455), '7 h 35');
  assert.equal(durationLabel(-3), '0 h 00');
});

test('failed and pending queries never show stale rows as valid attendance', () => {
  state = { data: data([row({ nom_complet: 'Stale employee' })]), isError: true };
  const error = render();
  assert.match(error, /Impossible de charger les présences/);
  assert.doesNotMatch(error, /Stale employee|Aucune présence pour cette sélection/);
  state = { isFetching: true };
  assert.match(render(), /Chargement des présences/);
});
