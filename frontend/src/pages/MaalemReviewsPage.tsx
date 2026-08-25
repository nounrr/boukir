import React, { useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  Eye, EyeOff, Filter, Flag, History, Info, Loader2, LockKeyhole, MessageSquareText,
  RotateCcw, Search, ShieldAlert, SlidersHorizontal, Star, UserRound, Wrench, X, XCircle,
} from 'lucide-react';
import {
  useGetAdminMaalemReviewFiltersQuery, useGetAdminMaalemReviewHistoryQuery,
  useGetAdminMaalemReviewQuery, useGetAdminMaalemReviewsQuery, useModerateMaalemReviewMutation,
  type AdminMaalemReview, type MaalemReviewAction, type MaalemReviewStatus,
} from '../store/api/maalemReviewsApi';
import { useGetMyMaalemReviewPermissionsQuery } from '../store/api/maalemReviewPermissionsApi';

const STATUS_LABELS: Record<MaalemReviewStatus, string> = {
  pending: 'En attente', published: 'Publié', hidden: 'Masqué', rejected: 'Rejeté',
};
const STATUS_STYLES: Record<MaalemReviewStatus, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  published: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  hidden: 'border-slate-200 bg-slate-100 text-slate-700',
  rejected: 'border-red-200 bg-red-50 text-red-800',
};
const REASONS = [
  ['INSULTS', 'Insultes'], ['HATE_SPEECH', 'Contenu haineux'], ['PERSONAL_DATA', 'Données personnelles'],
  ['SPAM', 'Spam'], ['OFF_TOPIC', 'Contenu sans rapport'], ['THREAT', 'Menace'],
  ['SUSPECTED_FRAUD', 'Fraude présumée'], ['ONGOING_DISPUTE', 'Litige en cours'], ['OTHER', 'Autre'],
] as const;
const EMPTY_FILTERS = { q: '', status: '', rating: '', maalem: '', client: '', city: '', dateFrom: '', dateTo: '', comment: '', reported: '' };
const fieldClass = 'h-11 w-full rounded-xl border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm transition focus:border-indigo-500 focus:ring-indigo-500';
const ACTION_LABELS: Record<MaalemReviewAction, string> = { publish: 'Publier', hide: 'Masquer', reject: 'Rejeter', restore: 'Restaurer' };
const ACTION_SUMMARIES: Record<MaalemReviewAction, string> = {
  publish: 'L’avis deviendra visible sur le profil public du Maalem.',
  hide: 'L’avis sera retiré du profil public. Son contenu original et son historique seront conservés.',
  reject: 'L’avis sera rejeté et ne pourra plus être publié sans une nouvelle décision de modération.',
  restore: 'L’avis masqué sera restauré dans son dernier état publiable.',
};

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('fr-MA', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
}
function errorMessage(error: unknown) {
  const candidate = error as { data?: { message?: string }; error?: string };
  return candidate?.data?.message || candidate?.error || 'Une erreur est survenue.';
}
function Stars({ rating, compact = false }: { rating: number; compact?: boolean }) {
  return <span className="inline-flex items-center gap-2" role="img" aria-label={`Note : ${rating} étoiles sur 5`}>
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <Star key={index} className={`${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} ${index < rating ? 'fill-amber-400 text-amber-400' : 'fill-slate-50 text-slate-300'}`} />)}</span>
    <strong className="text-xs tabular-nums text-slate-700">{rating}/5</strong>
  </span>;
}
function StatusBadge({ status }: { status: MaalemReviewStatus }) {
  return <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>;
}
function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-bold text-slate-600">{children}</label>;
}

export default function MaalemReviewsPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selected, setSelected] = useState<AdminMaalemReview | null>(null);
  const [action, setAction] = useState<{ review: AdminMaalemReview; type: MaalemReviewAction } | null>(null);
  const [reasonCode, setReasonCode] = useState('');
  const [explanation, setExplanation] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const actionCancelRef = useRef<HTMLButtonElement>(null);

  const { data: permissions, isLoading: permissionsLoading } = useGetMyMaalemReviewPermissionsQuery();
  const canView = permissions?.view === true;
  const { data: options } = useGetAdminMaalemReviewFiltersQuery(undefined, { skip: !canView });
  const query = useMemo(() => ({
    page, limit: 25,
    ...(filters.q.trim() && { q: filters.q.trim() }),
    ...(filters.status && { status: filters.status }),
    ...(filters.rating && { rating: Number(filters.rating) }),
    ...(filters.maalem && { maalem_id: Number(filters.maalem) }),
    ...(filters.client && permissions?.view_private_details && { client_id: Number(filters.client) }),
    ...(filters.city && { city: filters.city }),
    ...(filters.dateFrom && { date_from: filters.dateFrom }),
    ...(filters.dateTo && { date_to: filters.dateTo }),
    ...(filters.comment && { has_comment: filters.comment === 'yes' }),
    ...(filters.reported && { reported: filters.reported === 'yes' }),
  }), [filters, page, permissions?.view_private_details]);
  const { data, isLoading, isFetching, isError, refetch } = useGetAdminMaalemReviewsQuery(query, { skip: !canView });
  const { data: detail, isFetching: detailLoading } = useGetAdminMaalemReviewQuery(selected?.id || 0, { skip: !selected });
  const { data: history, isFetching: historyLoading } = useGetAdminMaalemReviewHistoryQuery(selected?.id || 0, { skip: !selected || !permissions?.view_private_details });
  const [moderate, { isLoading: actionLoading }] = useModerateMaalemReviewMutation();

  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / 25));
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const advancedFilterCount = [filters.maalem, filters.client, filters.city, filters.dateFrom, filters.dateTo, filters.comment, filters.reported].filter(Boolean).length;
  const firstResult = data?.total ? (page - 1) * 25 + 1 : 0;
  const lastResult = Math.min(page * 25, data?.total || 0);
  const queueSummary = useMemo(() => {
    const reviews = data?.reviews || [];
    return {
      pending: reviews.filter((review) => review.status === 'pending').length,
      reported: reviews.filter((review) => review.report_count > 0).length,
      published: reviews.filter((review) => review.status === 'published').length,
      masked: reviews.filter((review) => review.private_details_masked).length,
    };
  }, [data?.reviews]);

  const updateFilter = (key: keyof typeof filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value })); setPage(1);
  };
  const resetFilters = () => { setFilters(EMPTY_FILTERS); setPage(1); setAdvancedOpen(false); };
  const openAction = (review: AdminMaalemReview, type: MaalemReviewAction) => {
    setAction({ review, type }); setReasonCode(''); setExplanation(''); setInternalNote(''); setActionError(null); setFeedback(null);
  };
  const submitAction = async () => {
    if (!action) return;
    const reasonRequired = action.type === 'hide' || action.type === 'reject';
    if (reasonRequired && !reasonCode) { setActionError('Choisissez un motif avant de continuer.'); return; }
    if (reasonCode === 'OTHER' && !explanation.trim()) { setActionError('Expliquez le motif « Autre » avant de continuer.'); return; }
    setActionError(null);
    try {
      await moderate({
        id: action.review.id, action: action.type,
        expected_status: action.review.status, expected_version: action.review.moderation_version,
        ...(reasonCode && { reason_code: reasonCode }), ...(explanation.trim() && { explanation: explanation.trim() }),
        ...(internalNote.trim() && { internal_note: internalNote.trim() }),
      }).unwrap();
      setAction(null); setSelected(null);
      setFeedback({ kind: 'success', message: 'Avis mis à jour. Le profil public a été invalidé.' });
    } catch (error) { setActionError(errorMessage(error)); }
  };

  if (permissionsLoading) return <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Chargement des permissions"><Loader2 className="h-8 w-8 animate-spin text-indigo-600 motion-reduce:animate-none" /></div>;
  if (!canView) return <section className="mx-auto max-w-xl rounded-xl border border-red-200 bg-red-50 p-8 text-center" role="alert"><ShieldAlert className="mx-auto h-10 w-10 text-red-600" /><h1 className="mt-3 text-xl font-bold text-red-950">Accès aux avis refusé</h1><p className="mt-2 text-sm leading-6 text-red-800">La permission review.view est nécessaire pour consulter cet espace.</p></section>;

  const activeReview = detail?.review || selected;
  const reasonRequired = action?.type === 'hide' || action?.type === 'reject';
  const isRejectAction = action?.type === 'reject';

  return <div className="space-y-6 pb-12">
    <header className="border-b border-slate-200 pb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">Qualité & confiance</p><h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Avis Maalem</h1><p className="mt-2 text-sm leading-6 text-slate-600">Contrôlez la visibilité publique sans modifier la note ni le commentaire déposés par le client.</p></div>
        <div className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm shadow-sm" aria-live="polite">{isFetching ? <Loader2 className="h-4 w-4 animate-spin text-indigo-600 motion-reduce:animate-none" /> : <MessageSquareText className="h-4 w-4 text-indigo-600" />}<span className="font-bold tabular-nums text-slate-900">{data?.total || 0}</span><span className="text-slate-500">avis {isFetching ? '· actualisation…' : ''}</span></div>
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3.5 py-3 text-sm leading-5 text-indigo-950"><Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" /><p><strong>Avant d’agir :</strong> vérifiez le contexte de la demande. Toute décision est historisée et la version est contrôlée lors de l’enregistrement.</p></div>
    </header>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 text-white shadow-sm" aria-labelledby="queue-summary-title">
      <div className="xl:grid xl:grid-cols-[180px_1fr]">
        <div className="flex items-center border-b border-slate-700 px-4 py-3.5 xl:border-b-0 xl:border-r">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">File opérationnelle</p><h2 id="queue-summary-title" className="mt-1 text-sm font-black">Vue de cette page</h2></div>
        </div>
        <dl className="grid grid-cols-2 gap-px bg-slate-700 xl:grid-cols-4">
          <QueueMetric label="À traiter" value={queueSummary.pending} tone="amber" hint="en attente" />
          <QueueMetric label="À examiner" value={queueSummary.reported} tone="red" hint="signalés" />
          <QueueMetric label="En ligne" value={queueSummary.published} tone="emerald" hint="publiés" />
          <QueueMetric label="Accès limité" value={queueSummary.masked} tone="slate" hint="contenu masqué" />
        </dl>
      </div>
    </section>

    {feedback && <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${feedback.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.kind === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertTriangle className="h-5 w-5 shrink-0" />}{feedback.message}</div>}

    <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="review-filters-title">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 id="review-filters-title" className="flex items-center gap-2 text-sm font-black text-slate-900"><Filter className="h-4 w-4 text-indigo-600" /> Filtres</h2><p className="mt-0.5 text-xs text-slate-500">Commencez par la recherche, le statut ou la note.</p></div>
        {activeFilterCount > 0 && <button type="button" onClick={resetFilters} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border border-slate-300 px-3.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:self-auto"><RotateCcw className="h-4 w-4" /> Réinitialiser <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700">{activeFilterCount}</span></button>}
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="md:col-span-2"><FieldLabel htmlFor="review-search">Recherche</FieldLabel><div className="relative"><Search className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" /><input id="review-search" value={filters.q} onChange={(e) => updateFilter('q', e.target.value)} placeholder="Référence, demande, Maalem ou commentaire…" className={`${fieldClass} pl-10`} /></div></div>
        <div><FieldLabel htmlFor="review-status">Statut</FieldLabel><select id="review-status" value={filters.status} onChange={(e) => updateFilter('status', e.target.value)} className={fieldClass}><option value="">Tous les statuts</option>{options?.statuses.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></div>
        <div><FieldLabel htmlFor="review-rating">Note</FieldLabel><select id="review-rating" value={filters.rating} onChange={(e) => updateFilter('rating', e.target.value)} className={fieldClass}><option value="">Toutes les notes</option>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} étoile{rating > 1 ? 's' : ''}</option>)}</select></div>
      </div>
      <div className="border-t border-slate-100">
        <button type="button" onClick={() => setAdvancedOpen((open) => !open)} aria-expanded={advancedOpen} aria-controls="advanced-review-filters" className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"><span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-slate-500" /> Filtres avancés {advancedFilterCount > 0 && <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">{advancedFilterCount} actif{advancedFilterCount > 1 ? 's' : ''}</span>}</span><ChevronDown className={`h-4 w-4 transition-transform motion-reduce:transition-none ${advancedOpen ? 'rotate-180' : ''}`} /></button>
        {advancedOpen && <div id="advanced-review-filters" className="grid gap-4 border-t border-slate-100 bg-slate-50/50 p-4 md:grid-cols-2 xl:grid-cols-4">
          <div><FieldLabel htmlFor="review-maalem">Maalem</FieldLabel><select id="review-maalem" value={filters.maalem} onChange={(e) => updateFilter('maalem', e.target.value)} className={fieldClass}><option value="">Tous les Maalems</option>{options?.maalems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          {permissions?.view_private_details && <div><FieldLabel htmlFor="review-client">Client</FieldLabel><select id="review-client" value={filters.client} onChange={(e) => updateFilter('client', e.target.value)} className={fieldClass}><option value="">Tous les clients</option>{options?.clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>}
          <div><FieldLabel htmlFor="review-city">Ville</FieldLabel><select id="review-city" value={filters.city} onChange={(e) => updateFilter('city', e.target.value)} className={fieldClass}><option value="">Toutes les villes</option>{options?.cities.map((city) => <option key={city}>{city}</option>)}</select></div>
          <div><FieldLabel htmlFor="review-comment">Commentaire</FieldLabel><select id="review-comment" value={filters.comment} onChange={(e) => updateFilter('comment', e.target.value)} className={fieldClass}><option value="">Avec ou sans commentaire</option><option value="yes">Avec commentaire</option><option value="no">Sans commentaire</option></select></div>
          <div><FieldLabel htmlFor="review-reported">Signalement</FieldLabel><select id="review-reported" value={filters.reported} onChange={(e) => updateFilter('reported', e.target.value)} className={fieldClass}><option value="">Tous les avis</option><option value="yes">Signalés uniquement</option><option value="no">Non signalés uniquement</option></select></div>
          <div><FieldLabel htmlFor="review-date-from">Soumis à partir du</FieldLabel><input id="review-date-from" type="date" value={filters.dateFrom} onChange={(e) => updateFilter('dateFrom', e.target.value)} className={fieldClass} /></div>
          <div><FieldLabel htmlFor="review-date-to">Soumis jusqu’au</FieldLabel><input id="review-date-to" type="date" value={filters.dateTo} onChange={(e) => updateFilter('dateTo', e.target.value)} className={fieldClass} /></div>
        </div>}
      </div>
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="reviews-results-title" aria-busy={isFetching}>
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5"><div><h2 id="reviews-results-title" className="text-sm font-black text-slate-900">Résultats</h2><p className="mt-0.5 text-xs text-slate-500" aria-live="polite">{data?.total ? `${firstResult}–${lastResult} sur ${data.total} avis` : 'Aucun avis affiché'}</p></div>{isFetching && <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-indigo-600 motion-reduce:animate-none" /> Mise à jour</span>}</div>
      {isLoading ? <div className="space-y-3 p-5" role="status" aria-label="Chargement des avis">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />)}</div>
      : isError ? <div className="px-5 py-14 text-center" role="alert"><AlertTriangle className="mx-auto h-9 w-9 text-red-500" /><p className="mt-3 font-bold text-red-800">Impossible de charger les avis.</p><p className="mt-1 text-sm text-slate-600">Vérifiez votre connexion puis réessayez.</p><button onClick={() => refetch()} className="mt-4 min-h-11 rounded-xl border border-indigo-200 px-4 text-sm font-bold text-indigo-700 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">Réessayer</button></div>
      : !data?.reviews.length ? <div className="px-5 py-14 text-center"><MessageSquareText className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 font-bold text-slate-900">Aucun avis trouvé</p><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">Aucun avis ne correspond à ces critères. Élargissez la recherche ou réinitialisez les filtres.</p>{activeFilterCount > 0 && <button onClick={resetFilters} className="mt-4 min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">Réinitialiser les filtres</button>}</div>
      : <>
        <div className="hidden max-h-[70vh] overflow-auto lg:block"><table className="no-mobile-scroll w-full min-w-[1080px] table-fixed text-sm"><thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 shadow-[0_1px_0_0_rgba(226,232,240,1)]"><tr><th scope="col" className="w-[150px] px-3 py-3">Avis / demande</th><th scope="col" className="w-[185px] px-3 py-3">Parties</th><th scope="col" className="px-3 py-3">Note & commentaire</th><th scope="col" className="w-[105px] px-3 py-3">Statut</th><th scope="col" className="w-[145px] px-3 py-3">Suivi</th><th scope="col" className="w-[235px] px-3 py-3 text-right">Décision</th></tr></thead><tbody className="divide-y divide-slate-100">{data.reviews.map((review) => <tr key={review.id} className="align-top transition-colors hover:bg-slate-50/80">
          <td className="px-4 py-4"><button onClick={() => setSelected(review)} className="font-mono text-xs font-bold text-indigo-700 underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">{review.reference}</button><p className="mt-1.5 font-semibold text-slate-900">{review.request_number}</p><p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" /> {formatDate(review.submitted_at)}</p></td>
          <td className="px-4 py-4"><p className="flex items-center gap-2 font-semibold text-slate-900"><Wrench className="h-4 w-4 text-slate-400" /> {review.maalem_name}</p><p className="mt-2 flex items-center gap-2 text-xs text-slate-600">{!review.private_details_masked && review.customer_name ? <UserRound className="h-4 w-4 text-slate-400" /> : <LockKeyhole className="h-4 w-4 text-slate-400" />}{!review.private_details_masked && review.customer_name ? review.customer_name : 'Identité client masquée'}</p><p className="mt-1 pl-6 text-xs text-slate-500">{review.city || 'Ville non renseignée'}</p></td>
          <td className="px-4 py-4"><Stars rating={review.rating} compact /><p className="mt-2 max-w-md text-sm leading-5 text-slate-600">{review.private_details_masked ? <span className="inline-flex items-center gap-1.5 italic text-slate-500"><LockKeyhole className="h-3.5 w-3.5" /> Commentaire privé masqué</span> : review.comment ? <span title={review.comment}>{review.comment.slice(0, 125)}{review.comment.length > 125 ? '…' : ''}</span> : <span className="italic text-slate-400">Sans commentaire</span>}</p>{review.report_count > 0 && <p className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-red-700"><Flag className="h-3.5 w-3.5" /> {review.report_count} signalement{review.report_count > 1 ? 's' : ''}</p>}</td>
          <td className="px-4 py-4"><StatusBadge status={review.status} /></td><td className="px-4 py-4 text-xs leading-5 text-slate-600"><p>Modéré : {formatDate(review.moderated_at)}</p><p className="mt-1 font-semibold text-slate-700">{review.moderator_name || 'Aucun modérateur'}</p></td><td className="px-4 py-4"><ReviewActions review={review} permissions={permissions} onDetail={() => setSelected(review)} onAction={openAction} /></td>
        </tr>)}</tbody></table></div>
        <div className="divide-y divide-slate-100 lg:hidden">{data.reviews.map((review) => <article key={review.id} className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-xs font-bold text-indigo-700">{review.reference}</p><p className="mt-1 text-sm font-semibold text-slate-700">Demande {review.request_number}</p></div><StatusBadge status={review.status} /></div><dl className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2"><div><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Maalem</dt><dd className="mt-1 font-bold text-slate-900">{review.maalem_name}</dd></div><div><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Client</dt><dd className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-700">{(review.private_details_masked || !review.customer_name) && <LockKeyhole className="h-3.5 w-3.5" />}{!review.private_details_masked && review.customer_name ? review.customer_name : 'Identité masquée'}</dd></div></dl><div className="mt-4"><Stars rating={review.rating} /><p className="mt-2 text-sm leading-6 text-slate-600">{review.private_details_masked ? 'Commentaire privé masqué.' : review.comment || 'Aucun commentaire déposé.'}</p>{review.report_count > 0 && <p className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-red-700"><Flag className="h-3.5 w-3.5" /> {review.report_count} signalement{review.report_count > 1 ? 's' : ''}</p>}</div><div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500"><span>{review.city || 'Ville non renseignée'}</span><time>{formatDate(review.submitted_at)}</time></div><div className="mt-4"><ReviewActions review={review} permissions={permissions} onDetail={() => setSelected(review)} onAction={openAction} mobile /></div></article>)}</div>
      </>}
      <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3.5 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="text-slate-500">Page <strong className="text-slate-800">{page}</strong> sur <strong className="text-slate-800">{totalPages}</strong></span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Afficher la page précédente"><ChevronLeft className="h-4 w-4" /> Précédente</button><button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Afficher la page suivante">Suivante <ChevronRight className="h-4 w-4" /></button></div></div>
    </section>

    <Dialog.Root open={Boolean(selected)} onOpenChange={(open) => { if (!open && !actionLoading) setSelected(null); }}>
      {activeReview && <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/45 data-[state=open]:animate-in data-[state=closed]:animate-out motion-reduce:animate-none" />
      <Dialog.Content onEscapeKeyDown={(event) => { if (actionLoading) event.preventDefault(); }} onPointerDownOutside={(event) => { if (actionLoading) event.preventDefault(); }} onOpenAutoFocus={(event) => { event.preventDefault(); drawerCloseRef.current?.focus(); }} className="fixed inset-y-0 right-0 z-50 h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl focus:outline-none">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4"><div><p className="font-mono text-xs font-bold text-indigo-700">{activeReview.reference}</p><Dialog.Title className="mt-1 text-xl font-black text-slate-950">Détail de l’avis</Dialog.Title><Dialog.Description className="mt-1 text-xs text-slate-500">Contenu original, contexte et historique de modération.</Dialog.Description></div><button ref={drawerCloseRef} onClick={() => !actionLoading && setSelected(null)} disabled={actionLoading} aria-label="Fermer le détail de l’avis" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"><X className="h-5 w-5" /></button></div>
      <div className="space-y-7 p-5">{detailLoading && <p className="flex items-center gap-2 text-sm text-slate-500" role="status"><Loader2 className="h-4 w-4 animate-spin text-indigo-600 motion-reduce:animate-none" /> Actualisation du détail…</p>}
        <section aria-labelledby="detail-review-heading"><div className="flex flex-wrap items-center justify-between gap-3"><h3 id="detail-review-heading" className="text-sm font-black text-slate-950">Avis déposé</h3><StatusBadge status={activeReview.status} /></div><div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4"><Stars rating={activeReview.rating} /><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-800">{activeReview.private_details_masked ? 'Le contenu original nécessite la permission review.view_private_details.' : activeReview.comment || 'Aucun commentaire déposé.'}</p>{activeReview.report_count > 0 && <p className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-red-700"><Flag className="h-3.5 w-3.5" /> {activeReview.report_count} signalement{activeReview.report_count > 1 ? 's' : ''}</p>}</div></section>
        <section aria-labelledby="detail-identities-heading"><h3 id="detail-identities-heading" className="text-sm font-black text-slate-950">Demande & identités</h3><dl className="mt-3 grid gap-3 sm:grid-cols-2"><Detail label="Demande" value={activeReview.request_number} /><Detail label="Ville" value={activeReview.city || 'Non renseignée'} /><Detail label="Maalem" value={activeReview.maalem_name} /><Detail label="Client" value={!activeReview.private_details_masked && activeReview.customer_name ? activeReview.customer_name : <span className="inline-flex items-center gap-1.5 text-slate-500"><LockKeyhole className="h-3.5 w-3.5" /> Détails privés masqués</span>} />{permissions?.view_private_details && !activeReview.private_details_masked && activeReview.customer_phone && <Detail label="Téléphone client" value={activeReview.customer_phone} />}{permissions?.view_private_details && !activeReview.private_details_masked && activeReview.customer_email && <Detail label="E-mail client" value={activeReview.customer_email} />}</dl></section>
        <section aria-labelledby="detail-moderation-heading"><h3 id="detail-moderation-heading" className="text-sm font-black text-slate-950">État de modération</h3><dl className="mt-3 grid gap-3 sm:grid-cols-2"><Detail label="Soumis le" value={formatDate(activeReview.submitted_at)} /><Detail label="Modéré le" value={formatDate(activeReview.moderated_at)} /><Detail label="Modérateur" value={activeReview.moderator_name || 'Aucun'} /><Detail label="Version" value={`v${activeReview.moderation_version}`} /></dl><div className="mt-4"><ReviewActions review={activeReview} permissions={permissions} onDetail={() => undefined} onAction={openAction} mobile hideDetail /></div></section>
        {permissions?.view_private_details && <section aria-labelledby="detail-history-heading"><h3 id="detail-history-heading" className="flex items-center gap-2 text-sm font-black text-slate-950"><History className="h-4 w-4 text-indigo-600" /> Historique immuable</h3><p className="mt-1 text-xs leading-5 text-slate-500">Ces événements sont conservés pour l’audit et ne peuvent pas être modifiés.</p><div className="mt-3 space-y-3">{historyLoading && <p className="flex items-center gap-2 text-sm text-slate-500" role="status"><Loader2 className="h-4 w-4 animate-spin text-indigo-600 motion-reduce:animate-none" /> Chargement de l’historique…</p>}{history?.history.map((event) => <article key={event.id} className="rounded-xl border border-slate-200 p-3.5 text-sm"><div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"><p className="font-bold text-slate-900">{event.old_status ? STATUS_LABELS[event.old_status] : 'Création'} → {event.new_status ? STATUS_LABELS[event.new_status] : '—'}</p><time className="text-xs text-slate-500">{formatDate(event.created_at)}</time></div><p className="mt-1 text-xs text-slate-600">{event.actor_name} · {event.event_type}</p>{event.reason_code && <p className="mt-2 text-xs leading-5"><strong>Motif :</strong> {event.reason_code}{event.reason ? ` — ${event.reason}` : ''}</p>}{event.internal_note && <p className="mt-2 rounded-lg bg-slate-50 p-2.5 text-xs leading-5"><strong>Note interne :</strong> {event.internal_note}</p>}</article>)}{history && history.history.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">Aucun événement d’historique.</p>}</div></section>}
      </div>
      </Dialog.Content>
      </Dialog.Portal>}
    </Dialog.Root>

    <Dialog.Root open={Boolean(action)} onOpenChange={(open) => { if (!open && !actionLoading) setAction(null); }}>
    {action && <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-950/55 motion-reduce:animate-none" />
      <Dialog.Content role="alertdialog" onEscapeKeyDown={(event) => { if (actionLoading) event.preventDefault(); }} onPointerDownOutside={(event) => { if (actionLoading) event.preventDefault(); }} onOpenAutoFocus={(event) => { event.preventDefault(); actionCancelRef.current?.focus(); }} className="fixed left-1/2 top-1/2 z-[60] max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-white shadow-2xl focus:outline-none">
      <div className={`border-b px-5 py-4 ${isRejectAction ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`}><div className="flex items-start justify-between gap-4"><div><p className={`text-xs font-bold uppercase tracking-[0.12em] ${isRejectAction ? 'text-red-700' : 'text-indigo-700'}`}>Décision de modération</p><Dialog.Title className="mt-1 text-xl font-black text-slate-950">{ACTION_LABELS[action.type]} {action.review.reference}</Dialog.Title></div><button onClick={() => !actionLoading && setAction(null)} disabled={actionLoading} aria-label="Fermer la confirmation" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"><X className="h-5 w-5" /></button></div></div>
      <div className="p-5"><Dialog.Description asChild><div id="review-action-summary" className={`rounded-xl border p-3.5 text-sm leading-6 ${isRejectAction ? 'border-red-200 bg-red-50 text-red-900' : 'border-indigo-100 bg-indigo-50/60 text-indigo-950'}`}><strong>Conséquence :</strong> {ACTION_SUMMARIES[action.type]}</div></Dialog.Description><p className="mt-3 text-xs text-slate-500">État attendu : <strong>{STATUS_LABELS[action.review.status]}</strong> · version <strong>{action.review.moderation_version}</strong>. Si l’avis a changé entre-temps, l’opération sera refusée.</p>
        {reasonRequired && <div className="mt-5 space-y-4"><div><label htmlFor="moderation-reason" className="block text-sm font-bold text-slate-700">Motif <span className="text-red-600">*</span></label><select id="moderation-reason" value={reasonCode} onChange={(e) => { setReasonCode(e.target.value); setActionError(null); }} aria-required="true" className={`${fieldClass} mt-1.5`}><option value="">Choisir un motif…</option>{REASONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></div>{reasonCode === 'OTHER' && <div><label htmlFor="moderation-explanation" className="block text-sm font-bold text-slate-700">Explication <span className="text-red-600">*</span></label><textarea id="moderation-explanation" value={explanation} onChange={(e) => { setExplanation(e.target.value); setActionError(null); }} maxLength={500} rows={3} aria-required="true" className="mt-1.5 w-full rounded-xl border-slate-300 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500" /><p className="mt-1 text-right text-xs tabular-nums text-slate-400">{explanation.length}/500</p></div>}</div>}
        <div className="mt-4"><label htmlFor="moderation-note" className="block text-sm font-bold text-slate-700">Note interne <span className="font-normal text-slate-500">(facultative)</span></label><textarea id="moderation-note" value={internalNote} onChange={(e) => setInternalNote(e.target.value)} maxLength={1000} rows={3} className="mt-1.5 w-full rounded-xl border-slate-300 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500" /><p className="mt-1 text-xs text-slate-500">Visible uniquement par les collaborateurs autorisés.</p></div>
        {actionError && <p className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {actionError}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button ref={actionCancelRef} disabled={actionLoading} onClick={() => setAction(null)} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50">Annuler</button><button disabled={actionLoading} onClick={submitAction} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 ${isRejectAction ? 'bg-red-700 hover:bg-red-800 focus:ring-red-600' : action.type === 'publish' ? 'bg-emerald-700 hover:bg-emerald-800 focus:ring-emerald-600' : 'bg-indigo-700 hover:bg-indigo-800 focus:ring-indigo-600'}`}>{actionLoading && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}{actionLoading ? 'Enregistrement…' : `Confirmer : ${ACTION_LABELS[action.type].toLowerCase()}`}</button></div>
      </div>
      </Dialog.Content>
    </Dialog.Portal>}
    </Dialog.Root>
  </div>;
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-xl border border-slate-200 p-3.5"><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{value}</dd></div>;
}

function QueueMetric({ label, value, tone, hint }: { label: string; value: number; tone: 'amber' | 'red' | 'emerald' | 'slate'; hint: string }) {
  const toneClass = { amber: 'bg-amber-400', red: 'bg-red-500', emerald: 'bg-emerald-400', slate: 'bg-slate-400' }[tone];
  return <div className="relative min-w-0 bg-slate-950 px-4 py-3.5"><span className={`absolute left-0 top-0 h-1 w-full ${toneClass}`} aria-hidden="true" /><dt className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</dt><dd className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2"><strong className="text-xl font-black tabular-nums text-white">{value}</strong><span className="truncate text-xs text-slate-400">{hint}</span></dd></div>;
}

function ReviewActions({ review, permissions, onDetail, onAction, mobile = false, hideDetail = false }: {
  review: AdminMaalemReview; permissions?: { moderate: boolean; restore: boolean };
  onDetail: () => void; onAction: (review: AdminMaalemReview, type: MaalemReviewAction) => void;
  mobile?: boolean; hideDetail?: boolean;
}) {
  const base = mobile ? 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2' : 'inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border px-2 text-[11px] font-bold transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2';
  const label = (text: string) => <span>{text}</span>;
  return <div className={mobile ? 'flex flex-wrap gap-2' : 'grid w-full grid-cols-2 gap-2'} aria-label={`Actions pour l’avis ${review.reference}`}>
    {!hideDetail && <button onClick={onDetail} className={`${base} border-slate-300 text-slate-700 hover:bg-slate-100`} title="Consulter le détail" aria-label={`Consulter le détail de ${review.reference}`}><Eye className="h-4 w-4" />{label('Détail')}</button>}
    {permissions?.moderate && review.status === 'pending' && <button onClick={() => onAction(review, 'publish')} className={`${base} border-emerald-200 text-emerald-700 hover:bg-emerald-50`} title="Publier l’avis" aria-label={`Publier ${review.reference}`}><CheckCircle2 className="h-4 w-4" />{label('Publier')}</button>}
    {permissions?.moderate && ['pending', 'published'].includes(review.status) && <button onClick={() => onAction(review, 'hide')} className={`${base} border-slate-300 text-slate-700 hover:bg-slate-100`} title="Masquer l’avis" aria-label={`Masquer ${review.reference}`}><EyeOff className="h-4 w-4" />{label('Masquer')}</button>}
    {permissions?.moderate && review.status !== 'rejected' && <button onClick={() => onAction(review, 'reject')} className={`${base} border-red-200 text-red-700 hover:bg-red-50`} title="Rejeter l’avis" aria-label={`Rejeter ${review.reference}`}><XCircle className="h-4 w-4" />{label('Rejeter')}</button>}
    {permissions?.restore && review.status === 'hidden' && <button onClick={() => onAction(review, 'restore')} className={`${base} border-indigo-200 text-indigo-700 hover:bg-indigo-50`} title="Restaurer l’avis" aria-label={`Restaurer ${review.reference}`}><RotateCcw className="h-4 w-4" />{label('Restaurer')}</button>}
  </div>;
}
