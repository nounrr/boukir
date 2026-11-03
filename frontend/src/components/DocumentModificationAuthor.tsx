type ModifiedDocument = {
  last_modified_by_name?: string | null;
  last_modified_at?: string | null;
};

export default function DocumentModificationAuthor({ document }: { document: ModifiedDocument }) {
  const name = document.last_modified_by_name;
  const date = document.last_modified_at ? new Date(document.last_modified_at) : null;
  const dateLabel = date && !Number.isNaN(date.getTime()) ? date.toLocaleString('fr-MA') : '';
  return <span className={name ? 'text-xs font-medium text-blue-700' : 'text-xs text-gray-400'}
    title={name ? `Dernière modification du bon par ${name}${dateLabel ? ` le ${dateLabel}` : ''}` : 'Aucune modification attribuée'}>
    {name || '—'}
  </span>;
}
