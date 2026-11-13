import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Clock, Loader2, Users } from 'lucide-react';
import { useGetDailyPresenceQuery } from '../../store/api/pointageApi';
import type { DailyPresenceRow, DailyPresenceStatus } from '../../store/api/pointageApi';
import PointagePhoto from './PointagePhoto';
import PointageRawJournal from './PointageRawJournal';

const statusLabels = { absent: 'Absent', present: 'Présent', termine: 'Travail terminé' };
const statusStyles = { absent: 'bg-rose-50 text-rose-800 ring-rose-200', present: 'bg-blue-50 text-blue-800 ring-blue-200', termine: 'bg-emerald-50 text-emerald-800 ring-emerald-200' };
const anomalyLabels: Record<string, string> = { sortie_sans_entree: 'Sortie sans entrée', sortie_manquante: 'Sortie manquante', sens_inconnu: 'Sens de passage à confirmer' };
export const durationLabel = (minutes: number) => {
  const total = Math.max(0, Math.floor(minutes || 0));
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')}`;
};
const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });

export function DailyPresenceTable({ rows }: { rows: DailyPresenceRow[] }) {
  return <><p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500 sm:hidden">Faites défiler le tableau horizontalement pour voir les horaires et les heures travaillées.</p><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600"><tr>{['Jour', 'Employé', 'Entrée / sortie', 'Présence', 'Temps de travail'].map(label => <th key={label} scope="col" className="whitespace-nowrap px-4 py-3 font-bold">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">
    {rows.map(row => <tr key={row.key} className="align-top hover:bg-slate-50/70">
      <td className="whitespace-nowrap px-4 py-4 font-semibold capitalize text-slate-800">{dateLabel(row.date_pointage)}</td>
      <td className="min-w-[160px] px-4 py-4"><p className="font-semibold text-slate-900">{row.nom_complet || row.cin || `Employé #${row.employe_id}`}</p><p className="mt-1 text-xs text-slate-500">{row.role || row.cin}{row.obligatoire ? ' · Pointage obligatoire' : ''}</p><span className={`mt-2 inline-flex rounded-md px-2 py-1 text-xs font-bold ring-1 ring-inset sm:hidden ${statusStyles[row.statut]}`}>{statusLabels[row.statut]}</span></td>
      <td className="min-w-[200px] px-4 py-3">
        {row.entree ? <div className="space-y-2"><div className="flex items-center gap-3"><div className="min-w-[120px]"><span className="mr-3 text-xs text-slate-500">Entrée</span><time className="font-semibold tabular-nums">{row.entree}</time></div>{row.entree_event_id && row.entree_has_photo && <div className="[&>button>img]:h-9 [&>button>img]:w-9"><PointagePhoto eventId={row.entree_event_id} available /></div>}</div>
          {row.sortie ? <div className="flex items-center gap-3"><div className="min-w-[120px]"><span className="mr-3 text-xs text-slate-500">Sortie</span><time className="font-semibold tabular-nums">{row.sortie}</time></div>{row.sortie_event_id && row.sortie_has_photo && <div className="[&>button>img]:h-9 [&>button>img]:w-9"><PointagePhoto eventId={row.sortie_event_id} available /></div>}</div> : <p className="text-xs text-slate-500">{row.anomalies.includes('sortie_manquante') ? 'Sortie manquante' : row.statut === 'present' ? 'Sortie attendue' : 'Aucune sortie enregistrée'}</p>}
        </div> : <div><p className="text-xs text-slate-500">Aucune entrée enregistrée</p>{row.sortie && <p className="mt-1 text-xs text-amber-800">Sortie reçue : <time className="tabular-nums">{row.sortie}</time></p>}</div>}
      </td>
      <td className="min-w-[170px] px-4 py-4"><span className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-bold ring-1 ring-inset ${statusStyles[row.statut]}`}>{statusLabels[row.statut]}</span>
        {row.anomalies.map(anomaly => <p key={anomaly} className="mt-2 text-xs text-amber-800">{anomalyLabels[anomaly] || anomaly}</p>)}
        {row.absence_saisie && <p title={row.absence_saisie.motif || undefined} className="mt-2 text-xs text-slate-500">Absence saisie : {row.absence_saisie.type_absence === 'totale' ? 'journée entière' : 'partielle'}</p>}
      </td>
      <td className="whitespace-nowrap px-4 py-4"><p className="font-bold tabular-nums text-slate-900">{durationLabel(row.temps_travail_minutes)}</p>{row.temps_en_cours && <p className="mt-1 text-xs text-blue-700">En cours</p>}</td>
    </tr>)}
  </tbody></table></div></>;
}

export default function PointagePanel({ month, onMonthChange, canConfigure = false }: { month: string; onMonthChange: (month: string) => void; canConfigure?: boolean }) {
  const [day, setDay] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [status, setStatus] = useState<DailyPresenceStatus | ''>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showRaw, setShowRaw] = useState(false);
  useEffect(() => { setDay(''); setPage(1); }, [month]);
  const { currentData: data, isFetching, isError, refetch } = useGetDailyPresenceQuery({ month, day: day.startsWith(month) ? day || undefined : undefined, employe_id: employeeId ? Number(employeeId) : undefined, status: status || undefined, search: search.trim() || undefined, page }, { pollingInterval: 30000 });
  const filter = (change: () => void) => { change(); setPage(1); };
  const clear = () => { setDay(''); setEmployeeId(''); setStatus(''); setSearch(''); setPage(1); };
  const filtered = Boolean(day || employeeId || status || search);
  const inputClass = 'mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900';
  const summary = data?.summary;
  return <div className="space-y-4">
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Présences quotidiennes">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 sm:p-5"><div><h2 className="font-bold text-slate-900">Présences du mois</h2><p className="mt-1 text-sm text-slate-600">Une ligne par employé et par jour · {data?.timezone || 'Africa/Casablanca'}</p></div><button type="button" disabled={isFetching} onClick={() => refetch()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">{isFetching && <Loader2 size={14} className="animate-spin" />}Actualiser</button></div>
      <div className="grid gap-3 border-b border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs font-semibold text-slate-600">Mois<input aria-label="Mois des présences" type="month" value={month} max={data?.today.slice(0, 7)} onChange={event => { if (event.target.value) { setDay(''); setPage(1); onMonthChange(event.target.value); } }} className={inputClass} /></label>
        <label className="text-xs font-semibold text-slate-600">Jour<input aria-label="Jour des présences" type="date" min={`${month}-01`} max={data?.today?.startsWith(month) ? data.today : `${month}-${new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()}`} value={day} onChange={event => filter(() => setDay(event.target.value))} className={inputClass} /></label>
        <label className="text-xs font-semibold text-slate-600">Employé<select value={employeeId} onChange={event => filter(() => setEmployeeId(event.target.value))} className={inputClass}><option value="">Tous les employés</option>{data?.employees.map(employee => <option key={employee.id} value={employee.id}>{employee.nom_complet || employee.cin}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">Présence<select value={status} onChange={event => filter(() => setStatus(event.target.value as DailyPresenceStatus | ''))} className={inputClass}><option value="">Tous les statuts</option><option value="absent">Absent</option><option value="present">Présent</option><option value="termine">Travail terminé</option></select></label>
        <label className="text-xs font-semibold text-slate-600">Recherche<input type="search" value={search} onChange={event => filter(() => setSearch(event.target.value))} placeholder="Nom ou CIN…" className={inputClass} /></label>
      </div>
      {filtered && <div className="border-b border-slate-100 px-4 py-2"><button type="button" onClick={clear} className="text-xs font-semibold text-blue-700 underline">Effacer les filtres</button></div>}
      {isError ? <p role="alert" className="p-6 text-sm text-red-700">Impossible de charger les présences. <button type="button" onClick={() => refetch()} className="underline">Réessayer</button></p> : !data ? <p role="status" className="p-6 text-sm text-slate-600">Chargement des présences…</p> : <>
        <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 border-b border-slate-200 lg:grid-cols-4 lg:divide-y-0">
          {[{ label: 'Absents', value: summary?.absent || 0, style: 'text-rose-700', icon: Users }, { label: 'Présents', value: summary?.present || 0, style: 'text-blue-700', icon: CalendarDays }, { label: 'Travail terminé', value: summary?.termine || 0, style: 'text-emerald-700', icon: CheckCircle2 }, { label: 'Temps de travail', value: durationLabel(summary?.temps_travail_minutes || 0), style: 'text-slate-900', icon: Clock }].map(metric => <div key={metric.label} className="px-4 py-4"><p className="flex items-center gap-2 text-xs font-semibold text-slate-500"><metric.icon size={14} />{metric.label}</p><p className={`mt-2 text-xl font-bold tabular-nums ${metric.style}`}>{metric.value}</p></div>)}
        </div>
        {data.unassigned_count > 0 && <p className="border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">{data.unassigned_count} passage(s) sans employé associé. <button type="button" onClick={() => setShowRaw(true)} className="font-semibold underline">Consulter les passages détaillés</button><> · <Link to="/employees/pointage-settings" className="font-semibold underline">Associer les identifiants</Link></></p>}
        {data.data.length ? <DailyPresenceTable rows={data.data} /> : <div className="p-8 text-center"><Users className="mx-auto h-8 w-8 text-slate-400" /><p className="mt-3 font-semibold text-slate-800">Aucune présence pour cette sélection</p><p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">{filtered ? 'Essayez un autre jour, un autre employé ou effacez les filtres.' : 'Les employés avec « Pointage obligatoire » apparaissent chaque jour à partir de l’activation. Les passages associés apparaissent également ici.'}</p>{canConfigure && <Link to="/employees" className="mt-4 inline-block text-sm font-semibold text-blue-700 underline">Choisir les employés obligés de pointer</Link>}</div>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm"><span className="text-slate-600">{data.pagination.total} journée(s) employé · Page {data.pagination.page}</span><div className="flex gap-3"><button type="button" disabled={page <= 1 || isFetching} onClick={() => setPage(value => value - 1)} className="rounded border border-slate-300 px-3 py-1.5 disabled:opacity-40">Précédent</button><button type="button" disabled={isFetching || page * data.pagination.limit >= data.pagination.total} onClick={() => setPage(value => value + 1)} className="rounded border border-slate-300 px-3 py-1.5 disabled:opacity-40">Suivant</button></div></div>
      </>}
    </section>
    <div className="flex flex-wrap items-center justify-between gap-3 px-1"><p className="max-w-3xl text-xs leading-relaxed text-slate-500">Absent avant l’entrée, présent pendant le travail, puis travail terminé après la sortie. Les heures suivent les paires entrée/sortie ; une sortie manquante reste signalée.</p><div className="flex flex-wrap gap-4"><Link to="/employees/pointage-settings" className="whitespace-nowrap text-sm font-semibold text-blue-700 underline">Associer un identifiant</Link><button type="button" aria-expanded={showRaw} onClick={() => setShowRaw(value => !value)} className="whitespace-nowrap text-sm font-semibold text-blue-700 underline">{showRaw ? 'Masquer les passages détaillés' : 'Passages détaillés'}</button></div></div>
    {showRaw && <PointageRawJournal key={month} month={month} />}
  </div>;
}
