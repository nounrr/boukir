import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Clipboard, History, Link2, Loader2, Plus, RefreshCw, Search, Users, X } from 'lucide-react';
import {
  useListInventoryCountSessionsQuery, useCreateInventoryCountSessionMutation,
  useRotateInventoryCountLinkMutation, useCloseInventoryCountSessionMutation,
  useGetInventoryCountSummaryQuery, useGetInventoryCountEntriesQuery,
} from '../../store/api/inventoryCountingApi';
import type { CountEntry, CountPagination, CountSession, CountSummaryItem } from '../../store/api/inventoryCountingApi';
import { showError } from '../../utils/notifications';

const quantityLabel = (value: number) => Number(value || 0).toLocaleString('fr-FR', { maximumFractionDigits: 3 });
const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca', dateStyle: 'short', timeStyle: 'short' });
};
const initialTitle = () => `Comptage du ${new Date().toLocaleDateString('fr-FR', { timeZone: 'Africa/Casablanca' })}`;
const errorMessage = (error: unknown) => {
  const detail = error as { data?: { message?: string }; message?: string };
  return detail?.data?.message || detail?.message || 'Opération impossible. Réessayez.';
};
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50';
const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100';

function CountPaginationControls({ pagination, onPageChange, loading }: { pagination: CountPagination; onPageChange: (page: number) => void; loading?: boolean }) {
  const pages = Math.max(1, Math.ceil(pagination.total / pagination.limit));
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
    <span>{pagination.total} résultat{pagination.total > 1 ? 's' : ''} · Page {pagination.page} / {pages}</span>
    <div className="flex gap-2"><button type="button" disabled={loading || pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)} className={buttonClass} aria-label="Page de comptage précédente"><ChevronLeft size={15} /> Précédent</button><button type="button" disabled={loading || pagination.page >= pages} onClick={() => onPageChange(pagination.page + 1)} className={buttonClass} aria-label="Page de comptage suivante">Suivant <ChevronRight size={15} /></button></div>
  </div>;
}

export function InventoryCountSummaryTable({ items, onShowEntries }: { items: CountSummaryItem[]; onShowEntries: (item: CountSummaryItem) => void }) {
  return <><p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500 sm:hidden">Faites glisser le tableau pour voir les quantités et les personnes.</p><div className="overflow-x-auto"><table className="min-w-full text-left text-sm">
    <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600"><tr>{['Produit / variante', 'Total compté', 'Quantités par personne', 'Saisies'].map(label => <th key={label} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">{label}</th>)}</tr></thead>
    <tbody className="divide-y divide-slate-100">{items.map(item => <tr key={item.entity_key} className="align-top hover:bg-slate-50/60">
      <td className="min-w-[220px] px-4 py-4"><div className="mb-1.5 flex items-center gap-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${item.variant_id !== null ? 'bg-indigo-50 text-indigo-800' : 'bg-slate-100 text-slate-600'}`}>{item.variant_id !== null ? 'Variante' : 'Produit'}</span><span className="text-xs text-slate-500">Réf. {item.reference || item.product_id}</span></div><p className="font-semibold text-slate-950">{item.designation}</p>{item.variant_id !== null && <p className="mt-1 text-sm text-indigo-800">{item.variant_name || `Variante #${item.variant_id}`}</p>}</td>
      <td className="whitespace-nowrap px-4 py-4"><span className="text-lg font-bold tabular-nums text-slate-950">{quantityLabel(item.quantity)}</span></td>
      <td className="min-w-[220px] px-4 py-3"><ul className="space-y-2">{item.participants.map(participant => <li key={participant.name} className="flex items-baseline justify-between gap-5"><div><span className="font-medium text-slate-800">{participant.name}</span><span className="ml-2 whitespace-nowrap text-xs text-slate-500">{participant.entry_count} saisie{participant.entry_count > 1 ? 's' : ''}</span></div><span className="font-semibold tabular-nums text-slate-950">{quantityLabel(participant.quantity)}</span></li>)}</ul></td>
      <td className="whitespace-nowrap px-4 py-4"><button type="button" onClick={() => onShowEntries(item)} className="text-xs font-semibold text-indigo-700 underline decoration-indigo-200 underline-offset-4 hover:decoration-indigo-600">Voir les {item.entry_count} saisie{item.entry_count > 1 ? 's' : ''}</button></td>
    </tr>)}</tbody>
  </table></div></>;
}

export function InventoryCountEntriesTable({ entries }: { entries: CountEntry[] }) {
  return <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-y border-slate-200 bg-slate-50 text-xs text-slate-600"><tr>{['Date et heure', 'Personne', 'Produit / variante', 'Quantité'].map(label => <th key={label} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{entries.map(entry => <tr key={entry.id}><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600"><time dateTime={entry.created_at}>{dateLabel(entry.created_at)}</time></td><td className="px-4 py-3 font-medium text-slate-900">{entry.name}</td><td className="min-w-[190px] px-4 py-3"><p>{entry.designation}</p>{entry.variant_id !== null && <p className="text-xs text-indigo-700">{entry.variant_name || `Variante #${entry.variant_id}`}</p>}<p className="mt-1 text-xs text-slate-500">Réf. {entry.reference || entry.product_id}</p></td><td className="whitespace-nowrap px-4 py-3 font-bold tabular-nums text-slate-900">{quantityLabel(entry.quantity)}</td></tr>)}</tbody></table></div>;
}

export default function InventoryCountPanel({ canManage }: { canManage: boolean }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createdSession, setCreatedSession] = useState<CountSession | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showHistory, setShowHistory] = useState(false);
  const [historyEntity, setHistoryEntity] = useState<{ key: string; label: string } | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [generatedLink, setGeneratedLink] = useState<{ id: number; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const linkInput = useRef<HTMLInputElement>(null);
  const { currentData: sessionsData, isLoading: loadingSessions, isFetching: fetchingSessions, isError: sessionsError, refetch: refreshSessions } = useListInventoryCountSessionsQuery(undefined, { pollingInterval: 30000 });
  const sessions = sessionsData?.sessions || [];
  const id = selectedId ?? sessions[0]?.id ?? createdSession?.id ?? null;
  const selected = sessions.find(session => session.id === id) || (createdSession?.id === id ? createdSession : null);
  const { currentData: summaryData, isFetching: fetchingSummary, isError: summaryError, refetch: refreshSummary } = useGetInventoryCountSummaryQuery({ id: id || 0, q: search.trim() || undefined, page }, { skip: !id, pollingInterval: 30000 });
  const { currentData: entriesData, isFetching: fetchingEntries, isError: entriesError, refetch: refreshEntries } = useGetInventoryCountEntriesQuery({ id: id || 0, entity_key: historyEntity?.key, page: historyPage }, { skip: !id || !showHistory, pollingInterval: showHistory ? 30000 : 0 });
  const [create, { isLoading: creating }] = useCreateInventoryCountSessionMutation();
  const [rotate, { isLoading: rotating }] = useRotateInventoryCountLinkMutation();
  const [close, { isLoading: closing }] = useCloseInventoryCountSessionMutation();
  const busy = creating || rotating || closing;
  useEffect(() => { setPage(1); setSearch(''); setShowHistory(false); setHistoryEntity(null); setHistoryPage(1); setCopied(false); }, [id]);

  const createSession = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || busy) return;
    try {
      const result = await create({ title: title.trim() }).unwrap();
      setCreatedSession(result.session); setSelectedId(result.session.id); setGeneratedLink({ id: result.session.id, url: result.url }); setCopied(false);
    } catch (error) { showError(errorMessage(error)); }
  };
  const replaceLink = async () => {
    if (!id || busy) return;
    try { const result = await rotate(id).unwrap(); setGeneratedLink({ id, url: result.url }); setCopied(false); }
    catch (error) { showError(errorMessage(error)); }
  };
  const toggleClosed = async () => {
    if (!selected || busy) return;
    try { const result = await close({ id: selected.id, is_closed: !selected.is_closed }).unwrap(); setCreatedSession(result.session); }
    catch (error) { showError(errorMessage(error)); }
  };
  const copyLink = async () => {
    if (!generatedLink || generatedLink.id !== id) return;
    try { await navigator.clipboard.writeText(generatedLink.url); setCopied(true); }
    catch {
      linkInput.current?.focus(); linkInput.current?.select();
      try { if (document.execCommand('copy')) setCopied(true); else throw new Error('copy unavailable'); }
      catch { showError('Copie automatique indisponible. Sélectionnez le lien puis copiez-le manuellement.'); }
    }
  };
  const refresh = () => { void refreshSessions(); if (id) void refreshSummary(); if (id && showHistory) void refreshEntries(); };
  const openHistory = (item?: CountSummaryItem) => { setHistoryEntity(item ? { key: item.entity_key, label: [item.designation, item.variant_name].filter(Boolean).join(' · ') } : null); setHistoryPage(1); setShowHistory(true); };
  const activeLink = canManage && generatedLink?.id === id ? generatedLink : null;

  return <section className="overflow-hidden rounded-xl border border-indigo-200 bg-white shadow-sm" aria-labelledby="inventory-count-heading">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5"><div><p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-indigo-700">Comptage partagé</p><h2 id="inventory-count-heading" className="text-lg font-bold text-slate-950">Comptages par lien</h2><p className="mt-1 text-sm text-slate-600">Quantités déclarées par chaque personne, regroupées par produit ou variante.</p></div><button type="button" disabled={fetchingSessions || fetchingSummary} onClick={refresh} className={buttonClass}><RefreshCw size={15} className={fetchingSessions || fetchingSummary ? 'animate-spin' : ''} />Actualiser</button></header>
    {canManage && <form onSubmit={createSession} className="flex flex-col gap-3 border-b border-indigo-100 bg-indigo-50/50 p-4 sm:flex-row sm:items-end sm:px-5"><label className="min-w-0 flex-1 text-xs font-semibold text-indigo-950">Nom du nouveau comptage<input required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} className={`${inputClass} mt-1.5`} /></label><button disabled={busy || !title.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50">{creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}Créer un lien de comptage</button></form>}
    {sessionsError ? <p role="alert" className="p-5 text-sm text-red-700">Impossible de charger les comptages. <button type="button" onClick={() => refreshSessions()} className="underline">Réessayer</button></p> : loadingSessions ? <p role="status" className="p-5 text-sm text-slate-600">Chargement des comptages…</p> : !id ? <div className="px-5 py-8 text-center"><Link2 className="mx-auto mb-3 text-indigo-400" size={24} /><p className="font-semibold text-slate-800">Aucun comptage par lien pour le moment.</p><p className="mt-1 text-sm text-slate-500">{canManage ? 'Créez un lien et partagez-le aux personnes qui comptent les produits.' : 'Un responsable peut créer un lien depuis cette page.'}</p></div> : <>
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4 sm:px-5"><label className="min-w-0 flex-1 text-xs font-semibold text-slate-600">Comptage consulté<select value={id} onChange={event => setSelectedId(Number(event.target.value))} className={`${inputClass} mt-1.5`}>{createdSession && !sessions.some(session => session.id === createdSession.id) && <option value={createdSession.id}>{createdSession.title}</option>}{sessions.map(session => <option key={session.id} value={session.id}>{session.title}{session.is_closed ? ' · Clôturé' : ''}</option>)}</select></label>{selected && <span className={`mb-2 inline-flex rounded-md px-2 py-1 text-xs font-bold ${selected.is_closed ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-800'}`}>{selected.is_closed ? 'Clôturé' : 'Ouvert aux saisies'}</span>}{canManage && selected && <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || selected.is_closed} onClick={replaceLink} className={buttonClass}><Link2 size={15} />Remplacer le lien</button><button type="button" disabled={busy} onClick={toggleClosed} className={buttonClass}>{closing && <Loader2 size={15} className="animate-spin" />}{selected.is_closed ? 'Rouvrir les saisies' : 'Clôturer les saisies'}</button></div>}</div>
      {activeLink && <div className="space-y-2 border-b border-indigo-100 bg-indigo-50/50 p-4 sm:px-5"><label className="block text-xs font-semibold text-indigo-950">Lien spécial à partager<input ref={linkInput} readOnly value={activeLink.url} onFocus={event => event.target.select()} className={`${inputClass} mt-1.5 font-mono text-xs`} /></label><div className="flex flex-wrap items-center gap-3"><button type="button" onClick={copyLink} className={buttonClass}>{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? 'Lien copié' : 'Copier le lien'}</button><span aria-live="polite" className="text-xs text-indigo-800">Copiez le lien maintenant : il est affiché uniquement à sa génération.</span></div></div>}
      {canManage && <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500 sm:px-5">Remplacer le lien invalide l’ancien. Clôturer le comptage bloque les nouvelles saisies et conserve les données.</p>}
      {selected && <div className="grid grid-cols-2 border-b border-slate-200 sm:grid-cols-4">{[{ label: 'Produits / variantes', value: selected.item_count }, { label: 'Personnes', value: selected.participant_count }, { label: 'Saisies enregistrées', value: selected.entry_count }, { label: 'Quantité déclarée', value: quantityLabel(selected.total_quantity) }].map(stat => <div key={stat.label} className="border-r border-slate-100 px-4 py-3"><p className="text-xs text-slate-500">{stat.label}</p><p className="mt-1 text-xl font-bold tabular-nums text-slate-950">{stat.value}</p></div>)}</div>}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 p-4 sm:px-5"><label className="min-w-0 flex-1 text-xs font-semibold text-slate-600">Rechercher un produit ou une variante<span className="relative mt-1.5 block"><Search size={16} className="pointer-events-none absolute left-3 top-3 text-slate-400" /><input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Désignation ou référence…" className={`${inputClass} pl-9`} /></span></label><button type="button" onClick={() => openHistory()} className={buttonClass}><History size={15} />Historique des saisies</button></div>
      {summaryError ? <p role="alert" className="p-5 text-sm text-red-700">Impossible de charger les quantités. <button type="button" onClick={() => refreshSummary()} className="underline">Réessayer</button></p> : !summaryData ? <p role="status" className="p-5 text-sm text-slate-600">Chargement des quantités…</p> : summaryData.items.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">{search.trim() ? 'Aucun produit ne correspond à cette recherche.' : 'Aucune quantité enregistrée pour ce comptage.'}</p> : <InventoryCountSummaryTable items={summaryData.items} onShowEntries={item => openHistory(item)} />}
      {summaryData && !summaryError && <CountPaginationControls pagination={summaryData.pagination} onPageChange={setPage} loading={fetchingSummary} />}
      {showHistory && <section aria-label="Historique des saisies de comptage" className="border-t-4 border-slate-100"><header className="flex items-start justify-between gap-3 p-4 sm:px-5"><div><h3 className="font-bold text-slate-900">Historique des saisies</h3><p className="mt-1 text-xs text-slate-500">{historyEntity?.label || 'Tous les produits et toutes les personnes'} · Chaque enregistrement est conservé.</p></div><button type="button" onClick={() => setShowHistory(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Fermer l’historique des saisies"><X size={17} /></button></header>{entriesError ? <p role="alert" className="p-4 text-sm text-red-700">Impossible de charger l’historique. <button type="button" onClick={() => refreshEntries()} className="underline">Réessayer</button></p> : !entriesData ? <p role="status" className="p-4 text-sm text-slate-600">Chargement des saisies…</p> : entriesData.entries.length ? <InventoryCountEntriesTable entries={entriesData.entries} /> : <p className="p-5 text-sm text-slate-500">Aucune saisie à afficher.</p>}{entriesData && !entriesError && <CountPaginationControls pagination={entriesData.pagination} onPageChange={setHistoryPage} loading={fetchingEntries} />}</section>}
    </>}
    <footer className="flex items-start gap-2 border-t border-slate-100 px-4 py-3 text-xs leading-relaxed text-slate-500 sm:px-5"><Users size={14} className="mt-0.5 shrink-0" />Les quantités d’une même personne s’additionnent à chaque enregistrement. Les noms sont déclarés lors du comptage ; les produits et leurs variantes restent séparés.</footer>
  </section>;
}
