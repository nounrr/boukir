import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/redux';
import { useGetArchivedContactsQuery } from '../store/api/contactsApi';
import type { ContactArchiveKind } from '../store/api/contactsApi';
import { formatDateDMY } from '../utils/dateUtils';
import ContactArchiveButton from './ContactArchiveButton';

const detailPaths = {
  client: '/clients-copy',
  fournisseur: '/fournisseurs-copy',
  charge: '/charges-copy',
};

export default function ContactArchivesPanel() {
  const { user } = useAuth();
  const isPdg = user?.role === 'PDG';
  const [kind, setKind] = useState<ContactArchiveKind>('client');
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const { currentData, isFetching, isError, refetch } = useGetArchivedContactsQuery(
    { kind, page, search },
    { refetchOnMountOrArgChange: true },
  );
  const pagination = currentData?.pagination;

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="contact-archives-heading">
      <div>
        <h2 id="contact-archives-heading" className="text-lg font-semibold text-slate-900">Contacts archivés</h2>
        <p className="mt-1 text-sm text-slate-600">Les clients et fournisseurs avec un solde nul et trois mois sans mouvement sont archivés automatiquement.</p>
      </div>
      <form className="flex flex-wrap items-end gap-3" onSubmit={event => {
        event.preventDefault();
        setSearch(searchInput.trim());
        setPage(1);
      }}>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Type de contact
          <select className="min-h-10 rounded-md border border-slate-300 px-3" value={kind} onChange={event => {
            setKind(event.target.value as ContactArchiveKind);
            setPage(1);
          }}>
            <option value="client">Clients</option>
            <option value="fournisseur">Fournisseurs</option>
            {isPdg && <option value="charge">Charges</option>}
          </select>
        </label>
        <label className="grid min-w-40 flex-1 gap-1 text-sm font-medium text-slate-700">
          Nom, société ou numéro
          <input type="search" className="min-h-10 rounded-md border border-slate-300 px-3" value={searchInput}
            onChange={event => { setSearchInput(event.target.value); if (!event.target.value) { setSearch(''); setPage(1); } }} />
        </label>
        <button type="submit" className="min-h-10 rounded-md bg-blue-700 px-4 text-sm font-medium text-white">Rechercher</button>
      </form>

      {isError ? (
        <p role="alert" className="text-sm text-red-700">Impossible de charger les archives.{' '}
          <button type="button" onClick={() => void refetch()} className="underline">Réessayer</button>
        </p>
      ) : isFetching && !currentData ? (
        <p role="status" className="text-sm text-slate-600">Chargement des archives…</p>
      ) : currentData?.data.length ? (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
          {currentData.data.map(contact => {
            const name = contact.nom_complet || contact.societe || `Contact #${contact.id}`;
            return (
              <li key={contact.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <Link className="break-words font-semibold text-blue-700 hover:underline" to={`${detailPaths[kind]}/${contact.id}`}>{name}</Link>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatDateDMY(contact.archived_at)} · {contact.archive_reason === 'inactivity' ? 'Inactivité' : 'Archivage manuel'}
                  </p>
                </div>
                {isPdg && <ContactArchiveButton id={contact.id} name={name} restore compact={false} />}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">Aucun contact archivé.</p>
      )}

      {pagination && pagination.totalPages > 1 && (
        <nav aria-label="Pages des archives" className="flex items-center justify-end gap-3 text-sm">
          <button type="button" className="rounded border px-3 py-2 disabled:opacity-40" disabled={pagination.page <= 1}
            onClick={() => setPage(pagination.page - 1)}>Précédent</button>
          <span>{pagination.page} / {pagination.totalPages}</span>
          <button type="button" className="rounded border px-3 py-2 disabled:opacity-40" disabled={pagination.page >= pagination.totalPages}
            onClick={() => setPage(pagination.page + 1)}>Suivant</button>
        </nav>
      )}
    </section>
  );
}
