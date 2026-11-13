import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertCircle, ArrowUpRight, Building2, Check, CheckCircle2, ChevronLeft, ChevronRight,
  Clock3, HardHat, Loader2, Mail, Phone, RefreshCw, Search, ShoppingBag, Users, X,
} from 'lucide-react';
import {
  useGetEcommerceClientsQuery, type EcommerceClient, type EcommerceClientsTab,
} from '../store/api/ecommerceClientsApi';
import {
  useApproveArtisanRequestMutation, useRejectArtisanRequestMutation,
} from '../store/api/notificationsApi';

const isTrue = (value: unknown) => value === true || value === 1 || value === '1';
const isPending = (client: EcommerceClient) => isTrue(client.demande_artisan) && !isTrue(client.artisan_approuve);
const requestedRole = (client: EcommerceClient) => client.type_compte_demande === 'Promoteur' ? 'Promoteur' : 'Artisan';
const clientName = (client: EcommerceClient) => client.nom_complet || [client.prenom, client.nom].filter(Boolean).join(' ') || `Client #${client.id}`;
const money = (value: number) => new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD' }).format(Number(value) || 0);
const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const tabs = [
  { id: 'all', label: 'Tous les clients', icon: Users },
  { id: 'artisan', label: 'Demandes artisan', icon: HardHat },
  { id: 'promoteur', label: 'Demandes promoteur', icon: Building2 },
] as const;

function errorMessage(error: unknown) {
  const value = error as { data?: { message?: string }; error?: string };
  return value?.data?.message || value?.error || 'La demande n’a pas pu être traitée. Réessayez.';
}

function StatusBadge({ client }: { client: EcommerceClient }) {
  if (isPending(client)) return <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800"><Clock3 className="h-3.5 w-3.5" />En attente</span>;
  if (isTrue(client.artisan_approuve)) return <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" />Validé</span>;
  return <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">Compte client</span>;
}

export default function EcommerceClientsPage() {
  const [tab, setTab] = useState<EcommerceClientsTab>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [action, setAction] = useState<{ client: EcommerceClient; kind: 'approve' | 'reject' } | null>(null);
  const [note, setNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [approve, approveState] = useApproveArtisanRequestMutation();
  const [reject, rejectState] = useRejectArtisanRequestMutation();
  const busy = approveState.isLoading || rejectState.isLoading;
  const submitting = useRef(false);
  const actionButton = useRef<HTMLButtonElement | null>(null);
  const { currentData: data, isFetching, isError, refetch } = useGetEcommerceClientsQuery(
    { tab, search: query, page, limit }, { refetchOnFocus: true, refetchOnMountOrArgChange: true },
  );

  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (data && page > Math.max(1, data.pagination.totalPages)) setPage(Math.max(1, data.pagination.totalPages));
  }, [data, page]);

  const selectTab = (value: EcommerceClientsTab) => { setTab(value); setPage(1); };
  const openAction = (client: EcommerceClient, kind: 'approve' | 'reject', button: HTMLButtonElement) => {
    actionButton.current = button;
    setAction({ client, kind }); setNote(''); setActionError(null); setFeedback(null);
  };
  const confirmAction = async () => {
    if (!action || submitting.current) return;
    submitting.current = true;
    setActionError(null);
    try {
      const args = { id: action.client.id, note: note.trim() || undefined };
      if (action.kind === 'approve') await approve(args).unwrap();
      else await reject(args).unwrap();
      setFeedback(action.kind === 'approve'
        ? `${clientName(action.client)} : compte ${requestedRole(action.client)} confirmé.`
        : `La demande de ${clientName(action.client)} a été refusée.`);
      setAction(null);
    } catch (error) { setActionError(errorMessage(error)); }
    finally { submitting.current = false; }
  };
  const clientActions = (client: EcommerceClient) => <div className="flex flex-wrap items-center gap-2">
    {isPending(client) && <>
      <button type="button" disabled={busy || isFetching} onClick={event => openAction(client, 'approve', event.currentTarget)} className={`${buttonClass} border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100`}><Check className="h-4 w-4" />Confirmer {requestedRole(client)}</button>
      <button type="button" disabled={busy || isFetching} onClick={event => openAction(client, 'reject', event.currentTarget)} className={`${buttonClass} border-red-200 bg-white text-red-700 hover:bg-red-50`}>Refuser</button>
    </>}
    <Link to={`/clients/${client.id}`} className={`${buttonClass} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`} aria-label={`Ouvrir la fiche de ${clientName(client)}`}>Fiche<ArrowUpRight className="h-4 w-4" /></Link>
  </div>;

  return <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 pb-24 sm:p-6 lg:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-blue-700"><ShoppingBag className="h-6 w-6" /></div>
        <div><p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">E-commerce · Gestion des comptes</p><h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Clients e-commerce</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Retrouvez les clients inscrits sur le site et validez leurs demandes de compte Artisan ou Promoteur.</p></div>
      </div>
      <button type="button" onClick={() => void refetch()} disabled={isFetching} className={`${buttonClass} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}><RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />Actualiser</button>
    </header>

    {feedback && <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><span className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 shrink-0" />{feedback}</span><button type="button" aria-label="Fermer la confirmation" onClick={() => setFeedback(null)} className="rounded p-1 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"><X className="h-4 w-4" /></button></div>}

    <section aria-label="Vue d’ensemble" className="grid gap-3 sm:grid-cols-3">
      {tabs.map(({ id, icon: Icon }) => <button key={id} type="button" onClick={() => selectTab(id)} className={`flex items-center justify-between gap-4 rounded-xl border bg-white p-4 text-left transition hover:border-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${tab === id ? 'border-blue-300 shadow-sm' : 'border-slate-200'}`}>
        <div><p className="text-sm font-medium text-slate-600">{id === 'all' ? 'Comptes du site' : id === 'artisan' ? 'Artisans à confirmer' : 'Promoteurs à confirmer'}</p><p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{data ? data.counts[id] : '—'}</p></div><Icon className={`h-6 w-6 ${id === 'all' ? 'text-blue-600' : 'text-amber-600'}`} />
      </button>)}
    </section>

    <section aria-label="Liste des clients" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 pt-4 sm:px-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap gap-1" aria-label="Filtrer les comptes">
            {tabs.map(({ id, label }) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => selectTab(id)} className={`min-h-10 rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${tab === id ? 'bg-blue-50 text-blue-800' : 'text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}
          </div>
          <div className="w-full sm:max-w-sm"><label htmlFor="ecommerce-client-search" className="mb-1 block text-xs font-medium text-slate-600">Rechercher un client</label><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input id="ecommerce-client-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nom, société, téléphone ou e-mail…" className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm focus:border-blue-500 focus:ring-blue-500" /></div></div>
        </div>
        <p className="pb-3 text-xs text-slate-500">{tab === 'all' ? 'Tous les comptes issus du site, y compris les demandes en attente.' : `Demandes ${tab === 'artisan' ? 'artisan' : 'promoteur'} en attente de votre confirmation.`}</p>
      </div>

      <div aria-busy={isFetching}>
        {isError ? <div role="alert" className="flex flex-col items-center gap-3 p-10 text-center"><AlertCircle className="h-8 w-8 text-red-600" /><h2 className="font-semibold text-slate-900">Impossible de charger les clients</h2><p className="text-sm text-slate-600">Vérifiez votre connexion puis réessayez.</p><button type="button" onClick={() => void refetch()} className={`${buttonClass} border-slate-300 text-slate-700`}>Réessayer</button></div>
          : !data ? <div role="status" className="flex items-center justify-center gap-3 p-16 text-sm text-slate-600"><Loader2 className="h-5 w-5 animate-spin" />Chargement des clients…</div>
          : data.data.length === 0 ? <div className="px-6 py-16 text-center"><Users className="mx-auto mb-4 h-9 w-9 text-slate-300" /><h2 className="font-semibold text-slate-900">{query ? 'Aucun client ne correspond à votre recherche' : tab === 'all' ? 'Aucun client e-commerce pour le moment' : 'Aucune demande en attente'}</h2><p className="mt-2 text-sm text-slate-500">{query ? 'Essayez avec un autre nom, téléphone ou e-mail.' : tab === 'all' ? 'Les clients inscrits sur le site apparaîtront ici.' : 'Les nouvelles demandes apparaîtront ici pour validation.'}</p></div>
          : <>
            <div className="hidden overflow-x-auto lg:block"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600"><tr><th scope="col" className="px-5 py-3">Client</th><th scope="col" className="px-4 py-3">Coordonnées</th><th scope="col" className="px-4 py-3">Compte / demande</th><th scope="col" className="px-4 py-3">Statut</th><th scope="col" className="px-4 py-3 text-right">Solde remises</th><th scope="col" className="px-5 py-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{data.data.map(client => <tr key={client.id} className="align-top hover:bg-slate-50/60"><td className="px-5 py-4"><Link to={`/clients/${client.id}`} className="font-semibold text-slate-900 hover:text-blue-700 hover:underline">{clientName(client)}</Link><p className="mt-1 text-xs text-slate-500">{client.societe || `Client #${client.id}`}</p></td><td className="px-4 py-4"><p className="text-slate-700">{client.telephone || '—'}</p><p className="mt-1 max-w-64 break-words text-xs text-slate-500">{client.email || '—'}</p></td><td className="px-4 py-4"><p className="font-medium text-slate-700">{client.type_compte || 'Client'}</p>{isPending(client) && <p className="mt-1 text-xs font-medium text-amber-800">Demande : {requestedRole(client)}</p>}</td><td className="px-4 py-4"><StatusBadge client={client} /></td><td className="whitespace-nowrap px-4 py-4 text-right font-semibold tabular-nums text-slate-800">{money(client.remise_balance)}</td><td className="px-5 py-4">{clientActions(client)}</td></tr>)}</tbody></table></div>
            <ul className="divide-y divide-slate-200 lg:hidden">{data.data.map(client => <li key={client.id} className="space-y-4 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><Link to={`/clients/${client.id}`} className="font-semibold text-slate-900 hover:text-blue-700">{clientName(client)}</Link><p className="mt-1 text-xs text-slate-500">{client.societe || `Client #${client.id}`} · {client.type_compte || 'Client'}</p></div><StatusBadge client={client} /></div><div className="space-y-2 text-sm text-slate-600"><p className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0" />{client.telephone || 'Téléphone non renseigné'}</p><p className="flex items-start gap-2 break-all"><Mail className="mt-0.5 h-4 w-4 shrink-0" />{client.email || 'E-mail non renseigné'}</p></div><div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3"><p className="text-xs text-slate-600">Solde remises <strong className="ml-2 text-sm text-slate-900">{money(client.remise_balance)}</strong></p>{isPending(client) && <p className="text-xs font-semibold text-amber-800">Demande : {requestedRole(client)}</p>}</div>{clientActions(client)}</li>)}</ul>
          </>}
      </div>

      {data && !isError && <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-4 text-sm sm:px-5"><div className="flex flex-wrap items-center gap-3"><p aria-live="polite" className="text-slate-600">{data.pagination.total} client{data.pagination.total > 1 ? 's' : ''}{isFetching ? ' · Actualisation…' : ''}</p><label className="flex items-center gap-2 text-xs text-slate-600">Par page<select value={limit} onChange={event => { setLimit(Number(event.target.value)); setPage(1); }} className="rounded-md border border-slate-300 bg-white py-1 pl-2 pr-7 text-sm focus:border-blue-500 focus:ring-blue-500">{[20, 50, 100].map(value => <option key={value}>{value}</option>)}</select></label></div><div className="flex items-center gap-3"><button type="button" aria-label="Page précédente" disabled={page <= 1 || isFetching} onClick={() => setPage(value => value - 1)} className={`${buttonClass} border-slate-200 bg-white text-slate-700`}><ChevronLeft className="h-4 w-4" /></button><span className="text-xs tabular-nums text-slate-600">Page {page} / {Math.max(1, data.pagination.totalPages)}</span><button type="button" aria-label="Page suivante" disabled={page >= data.pagination.totalPages || isFetching} onClick={() => setPage(value => value + 1)} className={`${buttonClass} border-slate-200 bg-white text-slate-700`}><ChevronRight className="h-4 w-4" /></button></div></footer>}
    </section>

    <Dialog.Root open={action !== null} onOpenChange={open => { if (!open && !busy) setAction(null); }}>
      <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/50" /><Dialog.Content onCloseAutoFocus={event => { if (actionButton.current?.isConnected) { event.preventDefault(); actionButton.current.focus(); } }} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }} className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-2xl focus:outline-none">
        <Dialog.Title className="pr-8 text-xl font-bold text-slate-900">{action?.kind === 'approve' ? `Confirmer le compte ${requestedRole(action.client)}` : `Refuser la demande ${action ? requestedRole(action.client) : ''}`}</Dialog.Title>
        <Dialog.Description className="mt-3 text-sm leading-6 text-slate-600">{action && (action.kind === 'approve' ? `Le compte de ${clientName(action.client)} passera de ${action.client.type_compte || 'Client'} à ${requestedRole(action.client)}. Cette action valide sa demande d’accès aux conditions de ce type de compte.` : `La demande ${requestedRole(action.client)} de ${clientName(action.client)} sera refusée. Son compte client restera accessible.`)}</Dialog.Description>
        <label htmlFor="ecommerce-request-note" className="mb-2 mt-5 block text-sm font-medium text-slate-700">Note interne <span className="font-normal text-slate-500">(facultative)</span></label><textarea id="ecommerce-request-note" rows={3} maxLength={2000} value={note} disabled={busy} onChange={event => setNote(event.target.value)} className="w-full rounded-lg border border-slate-300 text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-60" placeholder="Ajouter une précision sur votre décision…" />
        {actionError && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{actionError}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" disabled={busy} onClick={() => setAction(null)} className={`${buttonClass} border-slate-300 bg-white text-slate-700`}>Annuler</button><button type="button" disabled={busy} onClick={() => void confirmAction()} className={`${buttonClass} ${action?.kind === 'approve' ? 'border-blue-700 bg-blue-700 text-white hover:bg-blue-800' : 'border-red-700 bg-red-700 text-white hover:bg-red-800'}`}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? 'Enregistrement…' : action?.kind === 'approve' ? `Confirmer ${requestedRole(action.client)}` : 'Refuser la demande'}</button></div>
        <Dialog.Close disabled={busy} className="absolute right-4 top-4 rounded-md p-1 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50" aria-label="Fermer"><X className="h-5 w-5" /></Dialog.Close>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  </div>;
}
