type ModifiedDocument = {
  last_modified_by_name?: string | null;
  last_modified_at?: string | null;
};

export function DocumentModificationNote({ document, compact = false }: { document: ModifiedDocument; compact?: boolean }) {
  if (!document.last_modified_by_name) return null;
  const date = document.last_modified_at ? new Date(document.last_modified_at) : null;
  const dateLabel = date && !Number.isNaN(date.getTime()) ? date.toLocaleString('fr-MA') : '';
  return (
    <p className={compact
      ? 'mt-0.5 text-[11px] leading-tight font-normal text-gray-500'
      : 'my-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-normal text-blue-900'}>
      Modifié par <span className={compact ? undefined : 'font-bold'}>{document.last_modified_by_name}</span>{dateLabel ? ` le ${dateLabel}` : ''}.
    </p>
  );
}

export default function DocumentModificationAuthor({ document }: { document: ModifiedDocument }) {
  const name = document.last_modified_by_name;
  const date = document.last_modified_at ? new Date(document.last_modified_at) : null;
  const dateLabel = date && !Number.isNaN(date.getTime()) ? date.toLocaleString('fr-MA') : '';
  return <span className={name ? 'text-xs font-medium text-blue-700' : 'text-xs text-gray-400'}
    title={name ? `Dernière modification du bon par ${name}${dateLabel ? ` le ${dateLabel}` : ''}` : 'Aucune modification attribuée'}>
    {name || '—'}
  </span>;
}
