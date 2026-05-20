import type { Contact } from '../types';

type PrintContactListOptions = {
  title: string;
  rows: Contact[];
  totalRows: number;
  totalCumule: number;
  fmt: (value: number) => string;
  filters?: string[];
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export const printContactList = ({ title, rows, totalRows, totalCumule, fmt, filters = [] }: PrintContactListOptions) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const generatedAt = new Date().toLocaleString('fr-FR');
  const filterText = filters.filter(Boolean).join(' | ');
  const bodyRows = rows.map((row, idx) => {
    const total = Number((row as any).total_cumule ?? 0) || 0;
    return `
      <tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(row.id)}</td>
        <td>${escapeHtml(row.nom_complet || '')}</td>
        <td>${escapeHtml(row.societe || '')}</td>
        <td>${escapeHtml(row.telephone || '')}</td>
        <td>${escapeHtml(row.adresse || '')}</td>
        <td class="num">${escapeHtml(fmt(Number(row.solde || 0)))}</td>
        <td class="num total">${escapeHtml(fmt(total))}</td>
      </tr>`;
  }).join('');

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          * { box-sizing: border-box; }
          body { font-family: Arial, sans-serif; color: #111827; margin: 0; font-size: 11px; }
          .header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 12px; }
          h1 { margin: 0 0 4px; font-size: 20px; }
          .meta { color: #6b7280; font-size: 10px; line-height: 1.5; }
          .summary { border: 1px solid #e5e7eb; background: #fffbeb; padding: 8px 10px; text-align: right; min-width: 170px; }
          .summary strong { display: block; font-size: 14px; color: #111827; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          th, td { border: 1px solid #d1d5db; padding: 5px 6px; vertical-align: top; word-break: break-word; }
          th { background: #f3f4f6; text-align: left; font-weight: 700; }
          .num { text-align: right; white-space: nowrap; }
          .total { font-weight: 700; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>${escapeHtml(title)}</h1>
            <div class="meta">${escapeHtml(rows.length)} ligne(s) imprimee(s) / ${escapeHtml(totalRows)} resultat(s)</div>
            ${filterText ? `<div class="meta">Filtres: ${escapeHtml(filterText)}</div>` : ''}
            <div class="meta">Imprime le ${escapeHtml(generatedAt)}</div>
          </div>
          <div class="summary">
            Total cumule
            <strong>${escapeHtml(fmt(totalCumule))}</strong>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 34px;">#</th>
              <th style="width: 48px;">ID</th>
              <th>Nom</th>
              <th>Societe</th>
              <th style="width: 90px;">Telephone</th>
              <th>Adresse</th>
              <th style="width: 90px;" class="num">Solde</th>
              <th style="width: 100px;" class="num">Total cumule</th>
            </tr>
          </thead>
          <tbody>
            ${bodyRows || '<tr><td colspan="8" style="text-align:center;color:#6b7280;">Aucune ligne a imprimer</td></tr>'}
          </tbody>
        </table>
      </body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  }, 250);
};
