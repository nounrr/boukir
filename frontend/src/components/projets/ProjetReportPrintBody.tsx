import type { ProjetTablePrintOptions } from '../../utils/projetTablePrint';

/** Report content uses the original bon template's header, document box and footer. */
export default function ProjetReportPrintBody({ report }: { report: ProjetTablePrintOptions }) {
  return <>
    {report.notes?.filter(Boolean).map((note, index) => <div key={index} className="mb-3 rounded border-l-4 border-orange-500 bg-gray-50 p-3 text-sm whitespace-pre-wrap">{note}</div>)}
    {report.tables.map((table, index) => <section key={index} className="mb-6">
      {table.title && <h3 className="mb-2 text-base font-semibold text-gray-800" style={{ breakAfter: 'avoid' }}>{table.title}</h3>}
      <table className="no-mobile-scroll print-table-full w-full border-collapse border border-gray-300 text-xs" style={{ width: '100%', tableLayout: 'fixed' }}>
        <thead style={{ display: 'table-header-group' }}><tr className="bg-gray-100">
          {table.columns.map((column, col) => <th key={col} className="border border-gray-300 px-2 py-2 font-semibold" style={{ textAlign: column.numeric ? 'right' : 'left', overflowWrap: 'anywhere' }}>{column.label}</th>)}
        </tr></thead>
        <tbody>
          {table.rows.map((row, line) => <tr key={line} style={{ breakInside: 'avoid' }}>
            {table.columns.map((column, col) => <td key={col} className="border border-gray-300 px-2 py-2 text-gray-700" style={{ textAlign: column.numeric ? 'right' : 'left', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row[col] ?? ''}</td>)}
          </tr>)}
          {!table.rows.length && <tr><td colSpan={table.columns.length} className="border border-gray-300 p-3 text-center text-gray-500">Aucune ligne à imprimer.</td></tr>}
        </tbody>
        {Boolean(table.totals?.length) && <tbody className="font-bold" style={{ breakInside: 'avoid' }}>
          {table.totals!.map((row, line) => {
            let span = 1;
            while (span < table.columns.length && (row[span] ?? '') === '') span++;
            return <tr key={line}>
              <td colSpan={span} className="border border-gray-300 px-2 py-2">{row[0]}</td>
              {table.columns.slice(span).map((column, offset) => <td key={offset} className="border border-gray-300 px-2 py-2" style={{ textAlign: column.numeric ? 'right' : 'left', overflowWrap: 'anywhere' }}>{row[span + offset] ?? ''}</td>)}
            </tr>;
          })}
        </tbody>}
      </table>
    </section>)}
  </>;
}
