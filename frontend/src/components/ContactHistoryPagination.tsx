type Props = {
  history: { page: number; totalPages: number; totalRows: number } | undefined;
  limit: number;
  busy: boolean;
  onPage: (page: number) => void;
  onLimit: (limit: number) => void;
  embedded?: boolean;
};

export default function ContactHistoryPagination({ history, limit, busy, onPage, onLimit, embedded = false }: Props) {
  const page = history?.page ?? 1;
  const pages = history?.totalPages ?? 1;
  const buttonClass = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-40 hover:bg-gray-50';
  return <nav aria-label="Pagination de l’historique" className={`flex flex-wrap items-center justify-between gap-3 ${embedded ? 'border-t border-gray-200 bg-gray-50 px-4 py-3' : 'rounded-xl border border-gray-200 bg-white p-3'}`}>
    <div className="text-sm text-gray-600" aria-live="polite">Page <strong>{page}</strong> sur {pages} · {history?.totalRows ?? 0} opérations
      <span className="block text-xs text-gray-500">Les soldes cumulés incluent les opérations des pages précédentes.</span>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-sm text-gray-600">Par page <select aria-label="Opérations par page" value={limit} disabled={busy} onChange={event => onLimit(Number(event.target.value))} className="ml-1 rounded-lg border border-gray-300 p-2">{[25, 50, 100].map(size => <option key={size}>{size}</option>)}</select></label>
      <button type="button" className={buttonClass} disabled={busy || page <= 1} onClick={() => onPage(1)}>Première</button>
      <button type="button" className={buttonClass} disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>Précédente</button>
      <button type="button" className={buttonClass} disabled={busy || page >= pages} onClick={() => onPage(page + 1)}>Suivante</button>
      <button type="button" className={buttonClass} disabled={busy || page >= pages} onClick={() => onPage(pages)}>Dernière</button>
    </div>
  </nav>;
}
