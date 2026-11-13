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
let role = 'Manager';
let gestion = true;
let statusOptions;
stub('../hooks/redux.ts', { useAuth: () => ({ user: { role } }) });
stub('../store/api/pointageApi.ts', {
  useGetPointageStatusQuery: (_args, options) => { statusOptions = options; return { data: { configured: true, device_key: '505' } }; },
  useLinkPointageIdentityMutation: () => [() => {}, {}],
  useGetPointageEventsQuery: () => ({ currentData: { data: [], pagination: { total: 0 } } }),
  useGetPointageConfigQuery: () => ({ data: { device_key: '505', local_ip: '', firmware: '', timezone: 'Africa/Casablanca', direction: 'inconnu', attendance_map: {} } }),
  useSavePointageConfigMutation: () => [() => {}, {}],
});
stub('../store/api/absencesApi.ts', {
  useGetMyAbsencePermissionsQuery: () => ({ data: { gestion } }),
  useGetAbsenceEmployeesQuery: () => ({ data: [] }),
});
stub('../utils/notifications.ts', {});
const Page = require('./PointageSettingsPage.tsx').default;
const render = () => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Page)));

test('gestion users retain employee identity associations without receiving device configuration', () => {
  role = 'Manager'; gestion = true;
  const html = render();
  assert.match(html, /Associer les identifiants de la pointeuse/);
  assert.match(html, /Passages détaillés/);
  assert.doesNotMatch(html, /Connexion Wdlink WDU505PROFP|Numéro de série \/ deviceKey|Remplacer l’adresse de réception/);
  assert.equal(statusOptions.skip, false);
});

test('PDG device configuration remains separate and unauthorized roles cannot query attendance data', () => {
  role = 'PDG'; gestion = false;
  assert.match(render(), /Connexion Wdlink WDU505PROFP/);
  role = 'Employé'; gestion = false;
  const html = render();
  assert.match(html, /La gestion du pointage n’est pas autorisée/);
  assert.doesNotMatch(html, /Associer les identifiants|Passages détaillés/);
  assert.equal(statusOptions.skip, true);
});
