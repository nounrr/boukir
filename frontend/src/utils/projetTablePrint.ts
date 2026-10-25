export type ProjetPrintCell = string | number | null | undefined;

export interface ProjetPrintTable {
  title?: string;
  columns: { label: string; numeric?: boolean }[];
  rows: ProjetPrintCell[][];
  totals?: ProjetPrintCell[][];
}

export interface ProjetTablePrintOptions {
  projectName: string;
  title: string;
  notes?: string[];
  tables: ProjetPrintTable[];
  landscape?: boolean;
}

const escapeHtml = (value: ProjetPrintCell) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

export function buildProjetTablePrintHtml(options: ProjetTablePrintOptions, generatedAt = new Date()) {
  const { projectName, title, notes = [], tables, landscape = false } = options;
  const renderTable = (table: ProjetPrintTable) => {
    const cells = (row: ProjetPrintCell[], tag = 'td', start = 0) => table.columns.slice(start).map((column, offset) =>
      `<${tag}${column.numeric ? ' class="num"' : ''}>${escapeHtml(row[start + offset])}</${tag}>`).join('');
    const totalRow = (row: ProjetPrintCell[]) => {
      let span = 1;
      while (span < table.columns.length && (row[span] ?? '') === '') span++;
      return `<tr><td colspan="${span}">${escapeHtml(row[0])}</td>${cells(row, 'td', span)}</tr>`;
    };
    return `<section>${table.title ? `<h2>${escapeHtml(table.title)}</h2>` : ''}
      <table><thead><tr>${cells(table.columns.map(column => column.label), 'th')}</tr></thead>
      <tbody>${table.rows.length ? table.rows.map(row => `<tr>${cells(row)}</tr>`).join('') : `<tr><td colspan="${table.columns.length}" class="empty">Aucune ligne à imprimer.</td></tr>`}</tbody>
      ${table.totals?.length ? `<tbody class="totals">${table.totals.map(totalRow).join('')}</tbody>` : ''}</table></section>`;
  };

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} — ${escapeHtml(projectName)}</title>
    <style>
      @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #0f172a; background: #f1f5f9; font: 11px Arial, sans-serif; }
      .toolbar { position: sticky; top: 0; padding: 12px 16px; background: #fff; border-bottom: 1px solid #cbd5e1; }
      button { padding: 10px 16px; border: 0; border-radius: 6px; background: #075985; color: white; cursor: pointer; font: bold 14px Arial, sans-serif; }
      .toolbar span { display: inline-block; margin: 8px 12px; color: #475569; }
      .sheet { width: ${landscape ? '277mm' : '190mm'}; max-width: none; margin: 20px auto; padding: 8mm; background: white; }
      header { border-bottom: 2px solid #075985; padding-bottom: 12px; margin-bottom: 16px; }
      h1 { margin: 4px 0 8px; font-size: 22px; }
      .project { font-size: 15px; font-weight: bold; white-space: pre-wrap; overflow-wrap: anywhere; }
      .meta { margin: 5px 0 0; color: #475569; white-space: pre-wrap; overflow-wrap: anywhere; }
      section { margin-top: 18px; }
      h2 { font-size: 13px; margin: 0 0 8px; break-after: avoid; white-space: pre-wrap; }
      table { width: 100%; border-collapse: collapse; font-size: ${landscape ? '10px' : '11px'}; }
      thead { display: table-header-group; }
      th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; vertical-align: top; overflow-wrap: anywhere; white-space: pre-wrap; }
      th { background: #f1f5f9; color: #334155; }
      .num { text-align: right; font-variant-numeric: tabular-nums; }
      tr { break-inside: avoid; }
      .totals { break-inside: avoid; background: #f0f9ff; font-weight: bold; }
      .empty { text-align: center; color: #64748b; padding: 20px; }
      @media screen and (max-width: 600px) {
        .sheet { width: calc(100% - 24px); margin: 12px; padding: 12px; }
        section { overflow-x: auto; }
        table { min-width: ${landscape ? '1000px' : '600px'}; }
      }
      @media print { body { background: white; } .toolbar { display: none; } .sheet { width: 100%; margin: 0; padding: 0; } }
    </style></head><body>
    <div class="toolbar"><button type="button" onclick="window.print()">Imprimer / Enregistrer en PDF</button><span>Choisissez votre imprimante ou « Enregistrer en PDF ».</span></div>
    <main class="sheet"><header><div class="project">${escapeHtml(projectName)}</div><h1>${escapeHtml(title)}</h1>
      <p class="meta">Édité le ${escapeHtml(generatedAt.toLocaleString('fr-MA'))}</p>
      ${notes.filter(Boolean).map(note => `<p class="meta">${escapeHtml(note)}</p>`).join('')}
    </header>${tables.map(renderTable).join('')}</main></body></html>`;
}

export function printProjetTable(options: ProjetTablePrintOptions): boolean {
  // Ouverture synchrone depuis le clic pour rester compatible avec les navigateurs mobiles.
  const popup = window.open('', '_blank');
  if (!popup) return false;
  popup.opener = null;
  popup.document.write(buildProjetTablePrintHtml(options));
  popup.document.close();
  popup.focus();
  // L'aperçu reste ouvert pour permettre une nouvelle impression ou l'enregistrement PDF.
  popup.setTimeout(() => { if (!popup.closed) popup.print(); }, 250);
  return true;
}
