// Génère frontend/src/styles/dark-utilities.css. Usage : node scripts/gen-dark-css.mjs <sortie.css> <dossier src>
// Ne garde que les classes réellement présentes dans le code. À relancer après l'ajout de nouvelles couleurs.
// Surcharge des utilitaires Tailwind sous html.dark ; les aperçus d'impression restent clairs.
import { writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2];
const srcDir = process.argv[3];
const used = new Set();
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(tsx?|jsx?)$/.test(f)) for (const t of readFileSync(p, 'utf8').split(/[\s"'`{}()]+/)) used.add(t); } };
walk(srcDir);
// Zones d'impression / aperçus papier : restent en clair.
const PAPER = ':is([data-print-root], #print-mode, .print-compact, [data-contact-pdf-page], .thermal-table, [data-keep-light])';
const D = 'html.dark';
const NP = `:not(${PAPER}, ${PAPER} *)`;
const esc = (c) => c.replace(/([:/.\[\]])/g, '\\$1');
const rules = [];
const rule = (classes, decl, pseudo = '') => {
  classes = classes.filter((c) => used.has(c));
  if (!classes.length) return;
  const sel = classes.map((c) => {
    const [variant, base] = c.includes(':') ? c.split(':') : [null, c];
    const ps = variant === 'hover' ? ':hover' : variant === 'focus' ? ':focus' : variant === 'group-hover' ? '' : '';
    const pre = variant === 'group-hover' ? `${D} .group:hover ` : `${D} `;
    return `${pre}.${esc(c)}${ps}${pseudo}${NP}`;
  }).join(',\n');
  rules.push(`${sel} { ${decl} }`);
};

// Surfaces neutres
const surface = {
  'white': '#161b26',
  '50': '#1a2030',
  '100': '#212839',
  '200': '#2a3245',
  '300': '#364056',
};
const neutrals = ['gray', 'slate', 'zinc', 'neutral', 'stone'];
rule(['bg-white', 'hover:bg-white', 'focus:bg-white'], `background-color: ${surface.white} !important;`);
for (const op of ['95', '90', '80', '70', '60', '50']) rule([`bg-white/${op}`], `background-color: rgba(22,27,38,.${op === '50' ? '8' : '92'}) !important;`);
for (const shade of ['50', '100', '200', '300']) {
  const list = neutrals.flatMap((n) => [`bg-${n}-${shade}`, `hover:bg-${n}-${shade}`, `focus:bg-${n}-${shade}`]);
  rule(list, `background-color: ${surface[shade]} !important;`);
  for (const op of ['20', '30', '40', '50', '60', '70', '80']) {
    rule(neutrals.map((n) => `bg-${n}-${shade}/${op}`), `background-color: ${surface[shade]} !important;`);
  }
}
// Textes neutres
const ink = { '950': '#f5f7fb', '900': '#eef2f7', '800': '#e2e8f0', '700': '#cbd5e1', '600': '#a9b4c4', '500': '#8d99ab', '400': '#6f7b8e', '300': '#566174', '200': '#454f61' };
for (const [shade, color] of Object.entries(ink)) {
  rule(neutrals.flatMap((n) => [`text-${n}-${shade}`, `hover:text-${n}-${shade}`, `group-hover:text-${n}-${shade}`]), `color: ${color} !important;`);
  rule(neutrals.map((n) => `placeholder-${n}-${shade}`), `color: ${color} !important;`, '::placeholder');
}
rule(['text-black', 'text-black/90', 'text-black/80', 'text-black/70'], `color: ${ink['900']} !important;`);
// Bordures neutres
const line = { '50': 'rgba(255,255,255,.05)', '100': 'rgba(255,255,255,.06)', '200': 'rgba(255,255,255,.09)', '300': 'rgba(255,255,255,.14)', '400': 'rgba(255,255,255,.2)' };
for (const [shade, color] of Object.entries(line)) {
  rule(neutrals.flatMap((n) => [`border-${n}-${shade}`, `hover:border-${n}-${shade}`]), `border-color: ${color} !important;`);
  rules.push(neutrals.map((n) => `${D} .divide-${n}-${shade}${NP} > :not([hidden]) ~ :not([hidden])`).join(',\n') + ` { border-color: ${color} !important; }`);
  rule(neutrals.map((n) => `ring-${n}-${shade}`), `--tw-ring-color: ${color} !important;`);
}
rule(['border-white'], 'border-color: rgba(255,255,255,.1) !important;');

// Couleurs : fonds pâles -> teintes translucides, textes foncés -> textes clairs
const palette = {
  red: ['#fca5a5', '#f87171', '239,68,68'], orange: ['#fdba74', '#fb923c', '249,115,22'], amber: ['#fcd34d', '#fbbf24', '245,158,11'],
  yellow: ['#fde047', '#facc15', '234,179,8'], lime: ['#bef264', '#a3e635', '132,204,22'], green: ['#86efac', '#4ade80', '34,197,94'],
  emerald: ['#6ee7b7', '#34d399', '16,185,129'], teal: ['#5eead4', '#2dd4bf', '20,184,166'], cyan: ['#67e8f9', '#22d3ee', '6,182,212'],
  sky: ['#7dd3fc', '#38bdf8', '14,165,233'], blue: ['#93c5fd', '#60a5fa', '59,130,246'], primary: ['#93c5fd', '#60a5fa', '59,130,246'],
  indigo: ['#a5b4fc', '#818cf8', '99,102,241'], violet: ['#c4b5fd', '#a78bfa', '139,92,246'], purple: ['#d8b4fe', '#c084fc', '168,85,247'],
  fuchsia: ['#f0abfc', '#e879f9', '217,70,239'], pink: ['#f9a8d4', '#f472b6', '236,72,153'], rose: ['#fda4af', '#fb7185', '244,63,94'],
};
for (const [name, [light300, mid400, rgb]] of Object.entries(palette)) {
  const tint = { '50': `rgba(${rgb},.10)`, '100': `rgba(${rgb},.16)`, '200': `rgba(${rgb},.24)` };
  for (const [shade, bg] of Object.entries(tint)) {
    rule([`bg-${name}-${shade}`, `hover:bg-${name}-${shade}`], `background-color: ${bg} !important;`);
    for (const op of ['30', '40', '50', '60', '70', '80']) rule([`bg-${name}-${shade}/${op}`], `background-color: ${bg} !important;`);
  }
  rule(['700', '800', '900', '950'].flatMap((s) => [`text-${name}-${s}`, `hover:text-${name}-${s}`, `group-hover:text-${name}-${s}`]), `color: ${light300} !important;`);
  rule(['500', '600'].flatMap((s) => [`text-${name}-${s}`, `hover:text-${name}-${s}`, `group-hover:text-${name}-${s}`]), `color: ${mid400} !important;`);
  rule(['50', '100', '200', '300'].flatMap((s) => [`border-${name}-${s}`, `hover:border-${name}-${s}`]), `border-color: rgba(${rgb},.32) !important;`);
  rules.push(['100', '200'].map((s) => `${D} .divide-${name}-${s}${NP} > :not([hidden]) ~ :not([hidden])`).join(',\n') + ` { border-color: rgba(${rgb},.25) !important; }`);
  rule(['from-' + name + '-50', 'from-' + name + '-100'], `--tw-gradient-from: rgba(${rgb},.14) var(--tw-gradient-from-position) !important; --tw-gradient-to: rgba(${rgb},0) var(--tw-gradient-to-position) !important; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important;`);
  rule(['to-' + name + '-50', 'to-' + name + '-100', 'via-' + name + '-50'], `--tw-gradient-to: rgba(${rgb},.08) var(--tw-gradient-to-position) !important;`);
}
rule(['from-white', 'from-gray-50', 'from-slate-50'], `--tw-gradient-from: ${surface.white} var(--tw-gradient-from-position) !important; --tw-gradient-to: rgba(22,27,38,0) var(--tw-gradient-to-position) !important; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important;`);
rule(['to-white', 'to-gray-50', 'to-slate-50', 'via-white', 'to-gray-100', 'to-slate-100'], `--tw-gradient-to: ${surface['50']} var(--tw-gradient-to-position) !important;`);

writeFileSync(out, '/* Fichier généré par scripts/gen-dark-css.mjs (npm run theme:dark-css) : couleurs Tailwind en mode sombre, écran uniquement. */\n@media screen {\n' + rules.join('\n') + '\n}\n');
console.log(rules.length, 'rules');
