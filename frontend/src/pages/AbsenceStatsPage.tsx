import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AbsenceLoadError from '../components/absences/AbsenceLoadError';
import {
  AlertTriangle, ArrowLeft, BarChart3, CalendarDays, CalendarRange, Clock, Loader2,
  TrendingDown, UserRound, Users,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  useGetAbsenceEmployeesQuery,
  useGetAbsenceStatsQuery,
  useGetMyAbsencePermissionsQuery,
} from '../store/api/absencesApi';

const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const monthsAgoKey = (count: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - count);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const shortMonthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
};

const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' });

const fmtMAD = (n: number) => `${Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DH`;

const displayName = (e: { nom_complet?: string | null; cin?: string | null; employe_id?: number }) =>
  e.nom_complet || e.cin || `#${e.employe_id ?? '—'}`;

const initials = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || '?';

const AbsenceStatsPage: React.FC = () => {
  const { data: permissions, isLoading: permissionsLoading, isError: permissionsError, refetch: retryPermissions } = useGetMyAbsencePermissionsQuery();
  const canSee = Boolean(permissions?.statistiques);

  const [from, setFrom] = useState(monthsAgoKey(5));
  const [to, setTo] = useState(currentMonthKey());
  const [employeId, setEmployeId] = useState<number | ''>('');

  const { data: employees = [], isError: employeesError, refetch: retryEmployees } = useGetAbsenceEmployeesQuery(undefined, { skip: !canSee });
  const { data, isLoading, isFetching, isError, refetch } = useGetAbsenceStatsQuery(
    { from, to, employe_id: employeId === '' ? undefined : employeId },
    { skip: !canSee },
  );

  const monthSeries = useMemo(
    () => (data?.byMonth || []).map((row) => ({
      ...row,
      label: shortMonthLabel(row.month),
    })),
    [data?.byMonth],
  );

  const ranking = data?.byEmployee || [];
  const maxAbsences = ranking.reduce((max, row) => Math.max(max, row.total_absences), 0) || 1;

  const summary = data?.summary;
  // Taux d'absentéisme : jours d'absence rapportés au volume théorique
  // (26 jours ouvrables par mois x effectif x nombre de mois analysés).
  const absenteeismRate = useMemo(() => {
    if (!summary || !summary.effectif || monthSeries.length === 0) return 0;
    const theoretical = summary.effectif * 26 * monthSeries.length;
    if (theoretical <= 0) return 0;
    return Math.round((summary.total_absences / theoretical) * 1000) / 10;
  }, [summary, monthSeries.length]);

  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-12 text-sm text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Vérification des accès…
      </div>
    );
  }

  if (permissionsError) return <AbsenceLoadError message="Impossible de vérifier vos accès." onRetry={retryPermissions} />;

  if (!canSee) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-md rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-10 w-10 text-red-500" />
          <h2 className="mt-3 text-xl font-bold text-red-700">Accès refusé</h2>
          <p className="mt-2 text-sm text-gray-600">
            Les statistiques d’absences sont réservées au PDG et aux employés explicitement autorisés.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full space-y-5 bg-slate-50/70 p-4 text-slate-900 sm:p-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-blue-700"><BarChart3 className="h-4 w-4" /> Ressources humaines · Analyse</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Statistiques des absences</h1>
          <p className="mt-1 text-sm text-slate-600">Suivez l’assiduité de votre équipe et l’évolution des retenues.</p>
        </div>
        {permissions?.gestion && <Link to="/absences" className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /> Pointage & absences</Link>}
      </header>
        <section aria-label="Filtres des statistiques" className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4 [&_input]:w-full [&_input]:min-w-0 [&_select]:w-full">
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase text-gray-500">Du mois</label>
            <input aria-label="Du mois" type="month" value={from} onChange={(e) => setFrom(e.target.value || monthsAgoKey(5))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase text-gray-500">Au mois</label>
            <input aria-label="Au mois" type="month" value={to} onChange={(e) => setTo(e.target.value || currentMonthKey())} className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase text-gray-500">Employé</label>
            <select
              aria-label="Employé"
              value={employeId}
              onChange={(e) => setEmployeId(e.target.value === '' ? '' : Number(e.target.value))}
              className="min-w-[180px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">Tous les employés</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.nom_complet || employee.cin}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end"><button type="button" onClick={() => { setFrom(monthsAgoKey(5)); setTo(currentMonthKey()); setEmployeId(''); }} className="rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-blue-600">Réinitialiser les filtres</button></div>
        </section>
      {employeesError && <AbsenceLoadError message="La liste des employés n’est pas disponible." onRetry={retryEmployees} />}

      {isError ? <AbsenceLoadError message="Les statistiques n’ont pas pu être chargées. Réessayez pour obtenir des données à jour." onRetry={refetch} /> : isLoading ? (
        <div className="flex items-center justify-center gap-2 p-16 text-sm text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Calcul des statistiques…
        </div>
      ) : !summary ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
          Aucune donnée disponible.
        </div>
      ) : (
        <>
          {/* Bandeau KPI */}
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CalendarRange className="h-4 w-4 text-slate-500" />
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {shortMonthLabel(from)} → {shortMonthLabel(to)}
                </p>
              </div>
              {isFetching && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            </div>
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Kpi icon={CalendarDays} label="Absences totales" value={String(summary.total_absences)} hint={`${summary.jours_concernes} jour(s) concernés`} accent="bg-blue-50 text-blue-700" />
              <Kpi icon={CalendarRange} label="Journées entières" value={String(summary.total_completes)} hint={`${fmtMAD(summary.penalite_jour)} / jour`} accent="bg-blue-50 text-blue-700" />
              <Kpi icon={Clock} label="Retards / partielles" value={String(summary.total_partielles)} hint="Calcul au prorata horaire" accent="bg-amber-50 text-amber-700" />
              <Kpi icon={TrendingDown} label="Retenue sur salaires" value={fmtMAD(summary.total_retenue)} hint="Déduite des charges" accent="bg-teal-50 text-teal-700" />
              <Kpi icon={Users} label="Taux d’absentéisme" value={`${absenteeismRate} %`} hint={`${summary.employes_concernes}/${summary.effectif} employés concernés`} accent="bg-slate-100 text-slate-600" />
            </dl>
            <p className="mt-3 text-[11px] text-slate-500">Taux estimé sur une base de 26 jours ouvrables par mois et par employé.</p>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            {/* Évolution mensuelle */}
            <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 xl:col-span-2">
              <div className="mb-4 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900">Évolution mensuelle</h2>
              </div>
              <p className="mb-4 text-xs text-slate-500">Nombre d’absences à gauche · retenues en DH à droite</p>
              {monthSeries.length === 0 ? (
                <p className="py-16 text-center text-sm text-gray-500">Aucune absence sur la période.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={monthSeries} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                    <YAxis yAxisId="left" tick={{ fontSize: 12 }} stroke="#9ca3af" allowDecimals={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="#0f766e" tickFormatter={(value) => Number(value).toLocaleString('fr-FR', { notation: 'compact' })} />
                    <Tooltip
                      formatter={((value: number, name: string) =>
                        [name === 'Retenue' ? fmtMAD(value) : String(value), name]) as never}
                      contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="left" dataKey="total_completes" name="Journées entières" stackId="a" fill="#2563eb" radius={[0, 0, 0, 0]} maxBarSize={42} />
                    <Bar yAxisId="left" dataKey="total_partielles" name="Partielles" stackId="a" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="total_retenue" name="Retenue" stroke="#0f766e" strokeWidth={2.5} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Répartition par jour de semaine */}
            <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900">Répartition par jour</h2>
              </div>
              <p className="mb-4 text-xs text-slate-500">Nombre d’absences par jour de la semaine</p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.byWeekday} layout="vertical" margin={{ left: 0, right: 12, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="weekday" width={65} tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
                  <Bar name="Absences" dataKey="total_absences" fill="#2563eb" radius={[0, 4, 4, 0]} maxBarSize={20} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            {/* Classement complet */}
            <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:col-span-2">
              <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-4">
                <Users className="h-4 w-4 text-blue-600" />
                <h2 className="text-sm font-black text-gray-900">Absences par employé</h2>
              </div>
              {ranking.length === 0 ? (
                <p className="py-16 text-center text-sm text-gray-500">Aucun employé absent sur la période.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {ranking.map((row, index) => {
                    const name = displayName(row);
                    const width = Math.max(4, Math.round((row.total_absences / maxAbsences) * 100));
                    return (
                      <div key={row.employe_id} className="flex items-center gap-3 px-4 py-4 hover:bg-slate-50 sm:px-5">
                        <span className="hidden w-6 flex-none text-center text-xs font-semibold text-slate-500 sm:block">{index + 1}</span>
                        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-gray-100 text-xs font-black text-gray-600">
                          {initials(name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col justify-between gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                            <p className="truncate text-sm font-bold text-gray-900">{name}</p>
                            <p className="flex-none text-[11px] text-gray-500">
                              dernière : {row.derniere_absence ? new Date(`${row.derniere_absence}T00:00:00`).toLocaleDateString('fr-FR') : '—'}
                            </p>
                          </div>
                          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full rounded-full bg-blue-500" style={{ width: `${width}%` }} />
                          </div>
                          <p className="mt-1.5 text-[11px] text-slate-500">{row.total_completes} journée(s) · {row.total_partielles} partielle(s)</p>
                        </div>
                        <div className="flex-none text-right">
                          <p className="text-sm font-bold text-gray-900">{row.total_absences} <span className="text-[11px] font-normal text-slate-500">abs.</span></p>
                          <p className="text-xs font-semibold text-slate-600">{fmtMAD(row.total_retenue)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-4">
              {/* Journées critiques */}
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-4">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <h2 className="text-sm font-bold text-gray-900">Journées les plus concernées</h2>
                </div>
                {data.topDays.length === 0 ? (
                  <p className="py-10 text-center text-sm text-gray-500">Aucune journée à signaler.</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {data.topDays.map((day) => (
                      <li key={day.date_absence} className="flex items-center justify-between gap-3 px-5 py-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold capitalize text-gray-900">{dayLabel(day.date_absence)}</span>
                          <span className="text-xs text-rose-700">{fmtMAD(day.total_retenue)}</span>
                        </span>
                        <span className="flex-none rounded-lg bg-red-50 px-2.5 py-1 text-xs font-black text-red-700">
                          {day.total_absences} abs.
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Dernières absences */}
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-4">
                  <TrendingDown className="h-4 w-4 text-rose-600" />
                  <h2 className="text-sm font-black text-gray-900">Dernières absences</h2>
                </div>
                {data.recent.length === 0 ? (
                  <p className="py-10 text-center text-sm text-gray-500">Rien à afficher.</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {data.recent.map((absence) => (
                      <li key={absence.id} className="flex items-center gap-3 px-5 py-3">
                        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                          <UserRound className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-gray-900">{absence.nom_complet || absence.cin}</span>
                          <span className="block text-xs text-gray-500">
                            {new Date(`${absence.date_absence}T00:00:00`).toLocaleDateString('fr-FR')} ·{' '}
                            {absence.type_absence === 'totale' ? 'journée entière' : `entrée ${absence.heure_entree}`}
                          </span>
                        </span>
                        <span className="flex-none text-xs font-black text-rose-700">{fmtMAD(absence.montant_retenue)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

const Kpi: React.FC<{ icon: typeof CalendarDays; label: string; value: string; hint: string; accent: string }> = ({ icon: Icon, label, value, hint, accent }) => (
  <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <dt className="flex items-start justify-between gap-2 text-xs font-semibold text-slate-600">{label}<span className={`rounded-lg p-2 ${accent}`}><Icon className="h-4 w-4" /></span></dt>
    <dd className="mt-2">
      <strong className="block break-words text-2xl font-bold tracking-tight text-slate-900">{value}</strong>
      <span className="mt-2 block text-[11px] text-slate-500">{hint}</span>
    </dd>
  </div>
);

export default AbsenceStatsPage;
