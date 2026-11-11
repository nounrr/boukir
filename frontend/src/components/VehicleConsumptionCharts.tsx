import { useEffect, useMemo, useState } from 'react';
import { MoveHorizontal, TrendingUp, Truck } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Text, Tooltip, XAxis, YAxis } from 'recharts';
import { useGetVehicleConsumptionQuery } from '../store/api/bonsApi';
import type { VehicleConsumptionArgs } from '../store/api/bonsApi';

type Group = VehicleConsumptionArgs['groupBy'];
const money = (value: number) => new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ' DH';
const compact = (value: number) => new Intl.NumberFormat('fr-MA', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const chargeColor = '#d97706';
const categoryTick = { fill: '#475569', fontSize: 11 };
const amountTick = { fill: '#64748b', fontSize: 11 };
const categoryAxisLine = { stroke: '#cbd5e1' };
const vehicleColumnWidth = 78;

function ConsumptionTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload?: { label: string; amount: number } }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="w-max max-w-56 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-xl">
      <p className="mb-2 break-words font-semibold text-slate-900">{point.label}</p>
      <p className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-slate-600">
        <span>Montant</span>
        <span className="whitespace-nowrap font-semibold tabular-nums text-amber-700">{money(point.amount)}</span>
      </p>
    </div>
  );
}

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
  const [vehicleViewport, setVehicleViewport] = useState<HTMLDivElement | null>(null);
  const [canScrollVehicles, setCanScrollVehicles] = useState(false);
  const validRange = Boolean(filters.dateFrom && filters.dateTo && filters.dateFrom <= filters.dateTo);
  const { currentData: data, isFetching, isError, error, refetch } = useGetVehicleConsumptionQuery(filters, { skip: !validRange });
  const errorMessage = error && 'data' in error && error.data && typeof error.data === 'object' && 'message' in error.data
    ? String(error.data.message) : 'Impossible de charger les graphiques. Réessayez dans un instant.';
  const periods = useMemo(() => (data?.periods ?? []).map(row => ({ ...row, label: periodLabel(row.period, filters.groupBy) })), [data, filters.groupBy]);
  const vehicles = useMemo(() => {
    const rows = data?.vehicles ?? [];
    const nameCounts = new Map<string, number>();
    for (const row of rows) nameCounts.set(row.name, (nameCounts.get(row.name) ?? 0) + 1);

    return rows.map(row => ({
      ...row,
      label: `${row.name}${row.immatriculation ? ` · ${row.immatriculation}` : ''}`,
      axisDetail: (nameCounts.get(row.name) ?? 0) > 1
        ? row.immatriculation || (row.vehicule_id == null ? '' : `#${row.vehicule_id}`)
        : '',
    }));
  }, [data]);
  const vehicleChartMinWidth = 62 + vehicles.length * vehicleColumnWidth;

  useEffect(() => {
    if (!vehicleViewport) return;
    const updateScrollHint = () => setCanScrollVehicles(vehicleViewport.clientWidth < vehicleChartMinWidth);
    const observer = new ResizeObserver(updateScrollHint);
    updateScrollHint();
    observer.observe(vehicleViewport);
    return () => observer.disconnect();
  }, [vehicleViewport, vehicleChartMinWidth]);

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
        <figure className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/50 p-3 sm:p-4">
          <figcaption className="mb-4">
            <div className="flex items-center gap-2">
              <Truck className="shrink-0 text-amber-600" size={18} aria-hidden="true" />
              <h3 className="font-semibold text-slate-900">Consommation par véhicule</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">Total par véhicule sur la période sélectionnée · DH</p>
          </figcaption>
          <div
            ref={setVehicleViewport}
            className="overflow-x-auto"
            role="img"
            aria-label="Graphique en colonnes avec les véhicules sur l’axe horizontal et les montants en DH sur l’axe vertical"
            tabIndex={canScrollVehicles ? 0 : undefined}
          >
            <div className="h-[280px]" style={{ minWidth: vehicleChartMinWidth }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vehicles} margin={{ top: 8, right: 8, bottom: 4, left: 0 }} accessibilityLayer>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    height={38}
                    interval={0}
                    tickLine={false}
                    axisLine={categoryAxisLine}
                    tick={({ x, y, index }) => {
                      const vehicle = vehicles[index];
                      if (!vehicle) return null;

                      return (
                        <g>
                          <Text x={x} y={y} width={vehicleColumnWidth - 6} maxLines={vehicle.axisDetail ? 1 : 2} verticalAnchor="start" textAnchor="middle" style={categoryTick}>
                            {vehicle.name}
                          </Text>
                          {vehicle.axisDetail && (
                            <Text x={x} y={y} dy={13} width={vehicleColumnWidth - 6} maxLines={1} verticalAnchor="start" textAnchor="middle" style={amountTick}>
                              {vehicle.axisDetail}
                            </Text>
                          )}
                        </g>
                      );
                    }}
                  />
                  <YAxis width={54} tickFormatter={compact} tick={amountTick} tickLine={false} axisLine={false} />
                  <Tooltip content={<ConsumptionTooltip />} cursor={{ fill: '#e2e8f0', opacity: 0.35 }} />
                  <Bar dataKey="amount" name="Consommation" fill={chargeColor} radius={[3, 3, 0, 0]} maxBarSize={34} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          {canScrollVehicles && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
              <MoveHorizontal size={14} className="shrink-0" aria-hidden="true" />
              Faites défiler horizontalement pour voir tous les véhicules.
            </p>
          )}
          <details className="mt-3 text-xs text-slate-600"><summary className="cursor-pointer font-medium">Voir les montants par véhicule</summary>
            <div className="mt-2 max-h-56 overflow-auto"><table className="w-full text-left"><thead><tr><th className="py-2">Véhicule</th><th className="text-right">Montant</th></tr></thead><tbody>{vehicles.map(row => <tr key={row.vehicule_id ?? 'unassigned'} className="border-t border-slate-200"><td className="py-2 pr-2">{row.label}</td><td className="whitespace-nowrap text-right tabular-nums">{money(row.amount)}</td></tr>)}</tbody></table></div>
          </details>
        </figure>
        <figure className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/50 p-3 sm:p-4">
          <figcaption className="mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="shrink-0 text-amber-600" size={18} aria-hidden="true" />
              <h3 className="font-semibold text-slate-900">Consommation totale des véhicules</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">Évolution {filters.groupBy === 'day' ? 'par jour' : filters.groupBy === 'month' ? 'par mois' : 'par année'} · DH</p>
          </figcaption>
          <div className="h-[280px] w-full" role="img" aria-label="Évolution de la consommation totale des véhicules en DH">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={periods} margin={{ top: 8, right: 16, bottom: 4, left: 0 }} accessibilityLayer>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" height={38} tick={categoryTick} minTickGap={20} tickLine={false} axisLine={categoryAxisLine} />
                <YAxis width={54} tickFormatter={compact} tick={amountTick} tickLine={false} axisLine={false} />
                <Tooltip content={<ConsumptionTooltip />} cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} />
                <Line
                  type="monotone"
                  dataKey="amount"
                  name="Consommation totale"
                  stroke={chargeColor}
                  strokeWidth={3}
                  dot={periods.length <= 31 ? { r: 4, fill: '#fff', strokeWidth: 2 } : false}
                  activeDot={{ r: 6, fill: chargeColor, stroke: '#fff', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <details className="mt-3 text-xs text-slate-600"><summary className="cursor-pointer font-medium">Voir les montants par période</summary>
            <div className="mt-2 max-h-56 overflow-auto"><table className="w-full text-left"><thead><tr><th className="py-2">Période</th><th className="text-right">Montant</th></tr></thead><tbody>{periods.map(row => <tr key={row.period} className="border-t border-slate-200"><td className="py-2 pr-2">{row.label}</td><td className="whitespace-nowrap text-right tabular-nums">{money(row.amount)}</td></tr>)}</tbody></table></div>
          </details>
        </figure>
      </div>}
  </section>;
}
