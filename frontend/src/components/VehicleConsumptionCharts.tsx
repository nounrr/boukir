import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useGetVehicleConsumptionQuery } from '../store/api/bonsApi';
import type { VehicleConsumptionArgs } from '../store/api/bonsApi';

type Group = VehicleConsumptionArgs['groupBy'];
const money = (value: number) => new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ' DH';
const compact = (value: number) => new Intl.NumberFormat('fr-MA', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

function defaultRange(groupBy: Group): VehicleConsumptionArgs {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const year = Number(today.slice(0, 4));
  return {
    groupBy,
    dateFrom: groupBy === 'day' ? `${today.slice(0, 7)}-01` : `${groupBy === 'year' ? year - 4 : year}-01-01`,
    dateTo: today,
  };
}

function periodLabel(value: string, group: Group) {
  if (group === 'year') return value;
  const date = new Date(`${group === 'month' ? `${value}-01` : value}T12:00:00`);
  return date.toLocaleDateString('fr-FR', group === 'month'
    ? { month: 'short', year: 'numeric' } : { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function VehicleConsumptionCharts() {
  const [filters, setFilters] = useState<VehicleConsumptionArgs>(() => defaultRange('month'));
  const validRange = Boolean(filters.dateFrom && filters.dateTo && filters.dateFrom <= filters.dateTo);
  const { currentData: data, isFetching, isError, error, refetch } = useGetVehicleConsumptionQuery(filters, { skip: !validRange });
  const errorMessage = error && 'data' in error && error.data && typeof error.data === 'object' && 'message' in error.data
    ? String(error.data.message) : 'Impossible de charger les graphiques. Réessayez dans un instant.';
  const periods = useMemo(() => (data?.periods ?? []).map(row => ({ ...row, label: periodLabel(row.period, filters.groupBy) })), [data, filters.groupBy]);
  const vehicles = useMemo(() => (data?.vehicles ?? []).map(row => ({
    ...row, label: `${row.name}${row.immatriculation ? ` · ${row.immatriculation}` : ''}`,
  })), [data]);
  const inputClass = 'mt-1 min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

  return <section className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="vehicle-consumption-title">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 id="vehicle-consumption-title" className="text-lg font-bold text-gray-900">Consommation des véhicules</h2>
        <p className="mt-1 text-xs text-gray-500">Montants des bons véhicule en DH, hors brouillons, bons refusés et annulés.</p>
      </div>
      {data && validRange && !isFetching && <div className="text-right">
        <p className="text-xs font-medium text-gray-500">Total sur la période</p>
        <p className="text-xl font-bold text-blue-700">{money(data.total)}</p>
        <p className="text-xs text-gray-500">{data.count} bon{data.count > 1 ? 's' : ''}</p>
      </div>}
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:max-w-2xl">
      <label className="text-xs font-semibold text-gray-600">Regrouper par
        <select value={filters.groupBy} onChange={event => setFilters(defaultRange(event.target.value as Group))} className={inputClass}>
          <option value="day">Jour</option><option value="month">Mois</option><option value="year">Année</option>
        </select>
      </label>
      <label className="text-xs font-semibold text-gray-600">Du
        <input type="date" value={filters.dateFrom} onChange={event => setFilters(previous => ({ ...previous, dateFrom: event.target.value }))} className={inputClass} />
      </label>
      <label className="text-xs font-semibold text-gray-600">Au
        <input type="date" value={filters.dateTo} onChange={event => setFilters(previous => ({ ...previous, dateTo: event.target.value }))} className={inputClass} />
      </label>
    </div>
    {!validRange ? <p role="alert" className="mt-4 text-sm text-orange-700">Choisissez une date de fin supérieure ou égale à la date de début.</p>
      : isFetching ? <div role="status" className="mt-5 flex h-64 items-center justify-center rounded-lg bg-gray-50 text-sm text-gray-500">Chargement des graphiques…</div>
      : isError ? <div role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-700">{errorMessage}
        <button type="button" onClick={() => void refetch()} className="ml-2 font-semibold underline">Réessayer</button>
      </div>
      : !data?.count ? <p className="mt-5 rounded-lg bg-gray-50 p-6 text-center text-sm text-gray-500">Aucun bon véhicule sur cette période.</p>
      : <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-blue-100 p-3 sm:p-4">
          <h3 className="font-semibold text-gray-900">Total de toutes les voitures</h3>
          <p className="mt-1 text-xs text-gray-500">Évolution {filters.groupBy === 'day' ? 'par jour' : filters.groupBy === 'month' ? 'par mois' : 'par année'} · DH</p>
          <div className="mt-4 h-72 w-full" role="img" aria-label="Évolution de la consommation totale des véhicules en DH">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={periods} margin={{ top: 10, right: 12, bottom: 6, left: 0 }} accessibilityLayer>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={30} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} width={56} tickLine={false} axisLine={false} />
                <Tooltip formatter={value => [money(Number(value)), 'Consommation']} />
                <Area type="linear" dataKey="amount" stroke="#2563eb" fill="#dbeafe" strokeWidth={2} dot={periods.length === 1 ? { r: 4 } : false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-3 text-xs text-gray-600"><summary className="cursor-pointer font-medium">Voir les montants par période</summary>
            <div className="mt-2 max-h-56 overflow-auto"><table className="w-full text-left"><thead><tr><th className="py-2">Période</th><th className="text-right">Montant</th></tr></thead><tbody>{periods.map(row => <tr key={row.period} className="border-t border-gray-100"><td className="py-2">{row.label}</td><td className="text-right tabular-nums">{money(row.amount)}</td></tr>)}</tbody></table></div>
          </details>
        </div>
        <div className="min-w-0 rounded-lg border border-teal-100 p-3 sm:p-4">
          <h3 className="font-semibold text-gray-900">Consommation de chaque voiture</h3>
          <p className="mt-1 text-xs text-gray-500">Total par véhicule sur la période sélectionnée · DH</p>
          <div className="mt-4 max-h-96 overflow-y-auto" role="img" aria-label="Comparaison de la consommation de chaque véhicule en DH">
            <div style={{ height: Math.max(288, vehicles.length * 42) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={vehicles} margin={{ top: 8, right: 16, bottom: 6, left: 0 }} accessibilityLayer>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                  <XAxis type="number" tickFormatter={compact} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="label" width={125} tick={{ fontSize: 11 }} interval={0} tickLine={false} axisLine={false} />
                  <Tooltip formatter={value => [money(Number(value)), 'Consommation']} cursor={{ fill: '#f0fdfa' }} />
                  <Bar dataKey="amount" fill="#0d9488" radius={[0, 4, 4, 0]} maxBarSize={24} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <details className="mt-3 text-xs text-gray-600"><summary className="cursor-pointer font-medium">Voir les montants par voiture</summary>
            <div className="mt-2 max-h-56 overflow-auto"><table className="w-full text-left"><thead><tr><th className="py-2">Voiture</th><th className="text-right">Montant</th></tr></thead><tbody>{vehicles.map(row => <tr key={row.vehicule_id ?? 'unassigned'} className="border-t border-gray-100"><td className="py-2 pr-2">{row.label}</td><td className="whitespace-nowrap text-right tabular-nums">{money(row.amount)}</td></tr>)}</tbody></table></div>
          </details>
        </div>
      </div>}
  </section>;
}
