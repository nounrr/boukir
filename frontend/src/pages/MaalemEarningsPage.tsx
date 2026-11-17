import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Banknote, CheckSquare, HardHat, Loader2, Search, Square, Wallet } from 'lucide-react';
import {
  type MaalemEarning,
  useGetMaalemEarningsDetailQuery,
  useGetMaalemEarningsOverviewQuery,
  useSettleMaalemEarningsMutation,
} from '../store/api/serviceRequestsApi';
import { EARNING_STATE_LABELS, money } from '../components/service-requests/servicePaymentLabels';

function date(value?: string | null) {
  return value ? new Intl.DateTimeFormat('fr-MA', { dateStyle: 'medium' }).format(new Date(value)) : '—';
}

function errorMessage(error: unknown) {
  const value = error as { data?: { message?: string } };
  return value.data?.message || 'Une erreur est survenue';
}

const stateClass: Record<string, string> = {
  available: 'bg-amber-100 text-amber-800',
  pending: 'bg-slate-100 text-slate-700',
  paid_cash: 'bg-emerald-100 text-emerald-700',
  to_shop: 'bg-blue-100 text-blue-700',
};

/** "Paiements Maalems": what each Maalem can take now, and the cash desk paying one or several missions. */
export default function MaalemEarningsPage() {
  const overview = useGetMaalemEarningsOverviewQuery(undefined, { refetchOnMountOrArgChange: true });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const maalems = useMemo(() => (overview.data?.maalems ?? [])
    .filter((m) => !search.trim() || String(m.maalem_name).toLowerCase().includes(search.trim().toLowerCase())), [overview.data, search]);
  const totalAvailable = (overview.data?.maalems ?? []).reduce((sum, m) => sum + m.available, 0);

  if (selectedId != null) {
    return <MaalemEarningsDetail profileId={selectedId} onBack={() => { setSelectedId(null); void overview.refetch(); }} />;
  }

  return <div className="space-y-6 p-4 sm:p-6">
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 pb-5">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Maalems & Services</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-950">Paiements Maalems</h1>
        <p className="mt-1 text-sm text-slate-500">Montants des missions clôturées, à remettre en espèces quand le Maalem passe au magasin.</p></div>
      <div className="rounded-lg bg-amber-50 px-4 py-3 text-right"><p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Total à payer</p><p className="text-xl font-bold text-amber-900">{money(totalAvailable)}</p></div>
    </header>
    <div className="relative max-w-sm"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input className="h-10 w-full rounded-md border border-gray-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="Rechercher un Maalem" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
    {overview.isLoading && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Chargement…</p>}
    {overview.isError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorMessage(overview.error)}</p>}
    {!overview.isLoading && maalems.length === 0 && <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">Aucun montant Maalem pour l’instant. Il se saisit lors de l’affectation d’une demande.</p>}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {maalems.map((m) => <button key={m.maalem_profile_id} type="button" onClick={() => setSelectedId(m.maalem_profile_id)} className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow">
        <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 font-bold text-slate-900"><HardHat className="h-4 w-4 text-blue-600" />{m.maalem_name || `Maalem #${m.maalem_profile_id}`}</span>
          {m.available_count > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{m.available_count} à payer</span>}</div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div><dt className="text-slate-500">À payer</dt><dd className="text-base font-bold text-amber-800">{money(m.available)}</dd></div>
          <div><dt className="text-slate-500">À venir</dt><dd className="text-base font-semibold text-slate-700">{money(m.pending)}</dd></div>
          <div><dt className="text-slate-500">Payé en espèces</dt><dd className="font-semibold text-emerald-700">{money(m.paid_cash)}</dd></div>
          <div><dt className="text-slate-500">Utilisé en achats</dt><dd className="font-semibold text-blue-700">{money(m.to_shop)}</dd></div>
        </dl>
      </button>)}
    </div>
  </div>;
}

function MaalemEarningsDetail({ profileId, onBack }: { profileId: number; onBack: () => void }) {
  const detail = useGetMaalemEarningsDetailQuery(profileId, { refetchOnMountOrArgChange: true });
  const [settle, settleState] = useSettleMaalemEarningsMutation();
  const [selected, setSelected] = useState<number[]>([]);
  const [feedback, setFeedback] = useState('');
  const earnings = detail.data?.earnings ?? [];
  const available = earnings.filter((e) => e.state === 'available');
  const selectedTotal = available.filter((e) => selected.includes(e.id)).reduce((sum, e) => sum + e.amount, 0);
  const toggle = (id: number) => setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  async function pay(ids: number[], total: number) {
    if (!ids.length) return;
    const name = detail.data?.maalem_name || 'ce Maalem';
    if (!window.confirm(`Remettre ${money(total)} en espèces à ${name} pour ${ids.length} mission(s) ?`)) return;
    setFeedback('');
    try {
      const result = await settle({ maalem_profile_id: profileId, earning_ids: ids }).unwrap();
      setSelected([]);
      setFeedback(`${money(result.total)} payés en espèces (${result.count} mission(s)). Le Maalem est prévenu.`);
      await detail.refetch();
    } catch (error) { setFeedback(errorMessage(error)); }
  }

  const row = (e: MaalemEarning) => <tr key={e.id} className="border-t border-slate-100">
    <td className="py-3 pr-2">{e.state === 'available' && <button type="button" aria-label={`Choisir ${e.request_number}`} onClick={() => toggle(e.id)} className="text-blue-700">{selected.includes(e.id) ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}</button>}</td>
    <td className="py-3 pr-3"><Link to={`/service-requests/${e.service_request_id}`} className="font-semibold text-blue-700 hover:underline">{e.request_number}</Link><p className="text-xs text-slate-500">{e.service_name || '—'}</p></td>
    <td className="py-3 pr-3 text-xs text-slate-600">{e.state === 'pending' ? `Prévue ${date(e.planned_date)}` : `Clôturée ${date(e.closed_at)}`}</td>
    <td className="py-3 pr-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${stateClass[e.state] ?? ''}`}>{EARNING_STATE_LABELS[e.state]}</span>{e.settled_at && <p className="mt-1 text-[11px] text-slate-500">{date(e.settled_at)}{e.settled_by ? ` · ${e.settled_by}` : ''}</p>}</td>
    <td className="py-3 pr-3 text-right font-bold text-slate-900">{money(e.amount)}</td>
    <td className="py-3 text-right">{e.state === 'available' && <button type="button" disabled={settleState.isLoading} onClick={() => void pay([e.id], e.amount)} className="rounded-md border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">Payer</button>}</td>
  </tr>;

  return <div className="space-y-6 p-4 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-5">
      <div className="flex items-center gap-3"><button type="button" onClick={onBack} aria-label="Retour" className="rounded-md border border-gray-300 bg-white p-2 text-gray-600 hover:bg-blue-50"><ArrowLeft className="h-5 w-5" /></button>
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Paiements Maalems</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-950">{detail.data?.maalem_name || 'Maalem'}</h1></div></div>
      {detail.data && <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-lg bg-amber-50 px-3 py-2 font-semibold text-amber-900">À payer : {money(detail.data.summary.available)}</span>
        <span className="rounded-lg bg-slate-100 px-3 py-2 text-slate-700">À venir : {money(detail.data.summary.pending)}</span>
      </div>}
    </header>
    {feedback && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{feedback}</p>}
    {detail.isLoading && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Chargement…</p>}
    {available.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-3"><button type="button" onClick={() => setSelected(selected.length === available.length ? [] : available.map((e) => e.id))} className="inline-flex items-center gap-2 text-sm font-semibold text-amber-900">{selected.length === available.length ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}Tout choisir ({available.length})</button>
        <span className="text-sm text-amber-900">{selected.length} choisie(s) · <strong>{money(selectedTotal)}</strong></span></div>
      <button type="button" disabled={!selected.length || settleState.isLoading} onClick={() => void pay(selected, selectedTotal)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"><Banknote className="h-4 w-4" />Payer en espèces {selected.length ? money(selectedTotal) : ''}</button>
    </div>}
    <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 flex items-center gap-2 font-bold text-slate-900"><Wallet className="h-5 w-5 text-blue-600" />Missions</h2>
      {earnings.length === 0 ? <p className="py-4 text-sm text-slate-500">Aucune mission avec montant.</p> : <table className="w-full min-w-[640px] text-sm">
        <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="w-8" /><th className="pb-2">Demande</th><th className="pb-2">Date</th><th className="pb-2">État</th><th className="pb-2 text-right">Montant</th><th /></tr></thead>
        <tbody>{earnings.map(row)}</tbody>
      </table>}
    </section>
    {(detail.data?.settlements.length ?? 0) > 0 && <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 font-bold text-slate-900">Historique des paiements</h2>
      <ul className="divide-y divide-slate-100 text-sm">{detail.data!.settlements.map((s) => <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span>{date(s.created_at)} · {s.kind === 'cash' ? `Espèces${s.employee_name ? ` remises par ${s.employee_name}` : ''}` : 'Transféré à ses achats (depuis l’application)'}</span>
        <strong>{money(s.total)}</strong></li>)}</ul>
    </section>}
  </div>;
}
