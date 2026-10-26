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
      body { margin: 0; color: #1f2937; background: #f3f4f6; font: 12px Arial, sans-serif; }
      .toolbar { position: sticky; top: 0; padding: 12px 16px; background: #fff; border-bottom: 1px solid #cbd5e1; }
      button { padding: 10px 16px; border: 0; border-radius: 6px; background: #c2410c; color: white; cursor: pointer; font: bold 14px Arial, sans-serif; }
      .toolbar span { display: inline-block; margin: 8px 12px; color: #475569; }
      .sheet { width: ${landscape ? '277mm' : '190mm'}; max-width: none; margin: 20px auto; padding: 8mm; background: white; }
      header { border-bottom: 2px solid #f97316; padding-bottom: 16px; margin-bottom: 24px; text-align: center; }
      h1 { margin: 0 0 16px; font-size: 20px; }
      .project { font-weight: bold; white-space: pre-wrap; overflow-wrap: anywhere; }
      .document-info { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin: 24px 0; break-inside: avoid; }
      .notes { flex: 1; min-width: 0; }
      .note { margin: 0 0 8px; padding: 12px; background: #f9fafb; border-left: 4px solid #f97316; border-radius: 4px; white-space: pre-wrap; overflow-wrap: anywhere; }
      .document-box { margin-left: auto; padding: 16px; border: 1px solid #fed7aa; border-radius: 4px; text-align: right; max-width: 100%; }
      .document-box h2 { color: #c2410c; font-size: 18px; margin: 0 0 8px; }
      .meta { margin: 5px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
      section { margin-top: 24px; }
      h2 { font-size: 16px; margin: 0 0 8px; break-after: avoid; white-space: pre-wrap; overflow-wrap: anywhere; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      thead { display: table-header-group; }
      th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; overflow-wrap: anywhere; white-space: pre-wrap; }
      th { background: #f3f4f6; color: #1f2937; font-weight: 600; }
      .num { text-align: right; font-variant-numeric: tabular-nums; }
      tr { break-inside: avoid; }
      .totals { break-inside: avoid; background: white; font-weight: bold; }
      .empty { text-align: center; color: #64748b; padding: 20px; }
      @media screen and (max-width: 600px) {
        .sheet { width: calc(100% - 24px); margin: 12px; padding: 12px; }
        section { overflow-x: auto; }
        table { min-width: ${landscape ? '1000px' : '600px'}; }
      }
      @media print { body { background: white; } .toolbar { display: none; } .sheet { width: 100%; margin: 0; padding: 0; } }
    </style></head><body>
    <div class="toolbar"><button type="button" onclick="window.print()">Imprimer / Enregistrer en PDF</button><span>Choisissez votre imprimante ou « Enregistrer en PDF ».</span></div>
    <main class="sheet"><header><h1 class="project">${escapeHtml(projectName)}</h1></header>
    <div class="document-info"><div class="notes">${notes.filter(Boolean).map(note => `<p class="note">${escapeHtml(note)}</p>`).join('')}</div>
    <div class="document-box"><h2>${escapeHtml(title)}</h2>
      <p class="meta">Édité le ${escapeHtml(generatedAt.toLocaleString('fr-MA'))}</p>
    </div></div>${tables.map(renderTable).join('')}</main></body></html>`;
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
