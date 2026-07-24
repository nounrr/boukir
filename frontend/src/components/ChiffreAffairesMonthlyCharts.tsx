import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarRange, CheckCircle2, ReceiptText, TrendingUp, WalletCards } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useGetChiffreAffairesStatsQuery } from '../store/api/statsApi';

interface ChiffreAffairesMonthlyChartsProps {
  compact?: boolean;
}

interface MonthlyRevenuePoint {
  monthKey: string;
  monthLabel: string;
  monthLongLabel: string;
  normalRevenue: number;
  netRevenue: number;
  charges: number;
  chargePercentage: number;
  isAlert: boolean;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload?: MonthlyRevenuePoint;
  }>;
}

const ALERT_THRESHOLD = 5;

const amountFormatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

const percentageFormatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const getLocalMonthKey = (date: Date = new Date()): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const getStartOfCurrentYear = (): string => `${new Date().getFullYear()}-01`;

const getLastDayOfMonth = (monthKey: string): string => {
  const [year, month] = monthKey.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${monthKey}-${String(lastDay).padStart(2, '0')}`;
};

const getMonthKeys = (startMonth: string, endMonth: string): string[] => {
  const [startYear, startMonthNumber] = startMonth.split('-').map(Number);
  const [endYear, endMonthNumber] = endMonth.split('-').map(Number);
  const cursor = new Date(startYear, startMonthNumber - 1, 1);
  const end = new Date(endYear, endMonthNumber - 1, 1);
  const monthKeys: string[] = [];

  while (cursor <= end) {
    monthKeys.push(getLocalMonthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return monthKeys;
};

const formatMonth = (monthKey: string, format: 'short' | 'long'): string => {
  const [year, month] = monthKey.split('-').map(Number);
  const value = new Date(year, month - 1, 1).toLocaleDateString('fr-FR', {
    month: format,
    year: 'numeric',
  });
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const formatAmount = (amount: number): string => `${amountFormatter.format(amount)} DH`;

const formatAxisAmount = (amount: number): string => {
  const absoluteAmount = Math.abs(amount);
  if (absoluteAmount >= 1_000_000) {
    return `${percentageFormatter.format(amount / 1_000_000)} M`;
  }
  if (absoluteAmount >= 1_000) {
    return `${percentageFormatter.format(amount / 1_000)} k`;
  }
  return amountFormatter.format(amount);
};

const RevenueChargesTooltip: React.FC<ChartTooltipProps> = ({ active, payload }) => {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="min-w-[13rem] rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-xl">
      <p className="mb-2 font-semibold text-slate-900">{point.monthLongLabel}</p>
      <div className="space-y-1.5">
        <p className="flex items-center justify-between gap-4 text-slate-600">
          <span>CA normal</span>
          <span className="font-semibold tabular-nums text-blue-700">{formatAmount(point.normalRevenue)}</span>
        </p>
        <p className="flex items-center justify-between gap-4 text-slate-600">
          <span>Charges nettes</span>
          <span className="font-semibold tabular-nums text-amber-700">{formatAmount(point.charges)}</span>
        </p>
      </div>
    </div>
  );
};

const ChargeTooltip: React.FC<ChartTooltipProps> = ({ active, payload }) => {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="min-w-[13rem] rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-xl">
      <p className="mb-2 font-semibold text-slate-900">{point.monthLongLabel}</p>
      <p className="flex items-center justify-between gap-4 text-slate-600">
        <span>Taux de charges</span>
        <span className={`font-bold tabular-nums ${point.isAlert ? 'text-rose-700' : 'text-amber-700'}`}>
          {percentageFormatter.format(point.chargePercentage)} %
        </span>
      </p>
      <p className="mt-1.5 flex items-center justify-between gap-4 text-slate-600">
        <span>Montant</span>
        <span className="font-semibold tabular-nums text-slate-900">{formatAmount(point.charges)}</span>
      </p>
    </div>
  );
};

const ChiffreAffairesMonthlyCharts: React.FC<ChiffreAffairesMonthlyChartsProps> = ({ compact = false }) => {
  const [startMonth, setStartMonth] = useState(getStartOfCurrentYear);
  const [endMonth, setEndMonth] = useState(getLocalMonthKey);
  const hasValidRange = Boolean(startMonth && endMonth && startMonth <= endMonth);

  const queryArgs = useMemo(
    () => ({
      filterType: 'period' as const,
      startDate: `${startMonth}-01`,
      endDate: getLastDayOfMonth(endMonth),
    }),
    [endMonth, startMonth]
  );

  const { data, isLoading, isFetching, error } = useGetChiffreAffairesStatsQuery(queryArgs, {
    skip: !hasValidRange,
  });

  const monthlyData = useMemo<MonthlyRevenuePoint[]>(() => {
    if (!hasValidRange) return [];

    const totalsByMonth = new Map<string, { normalRevenue: number; netRevenue: number; charges: number }>();
    getMonthKeys(startMonth, endMonth).forEach((monthKey) => {
      totalsByMonth.set(monthKey, { normalRevenue: 0, netRevenue: 0, charges: 0 });
    });

    (data?.dailyData ?? []).forEach((row) => {
      const monthKey = String(row.date).slice(0, 7);
      const current = totalsByMonth.get(monthKey);
      if (!current) return;

      const charges = Number(row.totalCharges ?? 0);
      const netRevenue = Number(row.chiffreAffaires ?? 0);
      current.charges += charges;
      current.netRevenue += netRevenue;
      current.normalRevenue += Number(row.chiffreAffairesSansCharges ?? netRevenue + charges);
    });

    return Array.from(totalsByMonth.entries()).map(([monthKey, totals]) => {
      const chargePercentage =
        totals.normalRevenue > 0 ? (totals.charges / totals.normalRevenue) * 100 : 0;
      return {
        monthKey,
        monthLabel: formatMonth(monthKey, 'short'),
        monthLongLabel: formatMonth(monthKey, 'long'),
        ...totals,
        chargePercentage,
        isAlert: totals.normalRevenue > 0 && totals.charges > totals.normalRevenue * (ALERT_THRESHOLD / 100),
      };
    });
  }, [data?.dailyData, endMonth, hasValidRange, startMonth]);

  const totals = useMemo(
    () =>
      monthlyData.reduce(
        (accumulator, point) => ({
          normalRevenue: accumulator.normalRevenue + point.normalRevenue,
          netRevenue: accumulator.netRevenue + point.netRevenue,
          charges: accumulator.charges + point.charges,
        }),
        { normalRevenue: 0, netRevenue: 0, charges: 0 }
      ),
    [monthlyData]
  );

  const overallChargePercentage =
    totals.normalRevenue > 0 ? (totals.charges / totals.normalRevenue) * 100 : 0;
  const alertMonths = monthlyData.filter((point) => point.isAlert);
  const rangeLabel = hasValidRange
    ? `De ${formatMonth(startMonth, 'long')} à ${formatMonth(endMonth, 'long')}`
    : 'Sélectionnez une période valide';

  const errorMessage = useMemo(() => {
    const apiError = error as { status?: number; data?: { message?: string }; error?: string } | undefined;
    if (!apiError) return null;
    if (apiError.status === 401) return 'Non autorisé. Veuillez vous reconnecter.';
    return apiError.data?.message || apiError.error || "Impossible de charger l'analyse mensuelle.";
  }, [error]);

  const chartHeight = compact ? 280 : 320;

  return (
    <section
      className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${compact ? 'p-4' : 'p-4 sm:p-6'}`}
      aria-labelledby="monthly-revenue-title"
    >
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
            <TrendingUp size={16} aria-hidden="true" />
            Pilotage mensuel
          </div>
          <h2 id="monthly-revenue-title" className={`${compact ? 'text-lg' : 'text-xl'} font-bold tracking-tight text-slate-950`}>
            CA normal, CA net et poids des charges
          </h2>
          <p className="mt-1 text-sm text-slate-600">{rangeLabel}</p>
        </div>

        <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-auto">
          <div>
            <label htmlFor="ca-chart-start-month" className="mb-1 block text-xs font-semibold text-slate-700">
              Du mois
            </label>
            <div className="relative">
              <CalendarRange className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={17} aria-hidden="true" />
              <input
                id="ca-chart-start-month"
                type="month"
                value={startMonth}
                max={endMonth}
                onChange={(event) => setStartMonth(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 xl:w-44"
              />
            </div>
          </div>
          <div>
            <label htmlFor="ca-chart-end-month" className="mb-1 block text-xs font-semibold text-slate-700">
              Au mois
            </label>
            <div className="relative">
              <CalendarRange className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={17} aria-hidden="true" />
              <input
                id="ca-chart-end-month"
                type="month"
                value={endMonth}
                min={startMonth}
                onChange={(event) => setEndMonth(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 xl:w-44"
              />
            </div>
          </div>
        </div>
      </div>

      {!hasValidRange && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          Le mois de début doit être antérieur ou égal au mois de fin.
        </div>
      )}

      {errorMessage && hasValidRange && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          {errorMessage}
        </div>
      )}

      {(isLoading || isFetching) && hasValidRange && (
        <div className="mt-5 space-y-4" aria-live="polite" aria-busy="true">
          <p className="text-sm font-medium text-slate-600">Chargement de l'analyse mensuelle…</p>
          <div className="grid animate-pulse grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-20 rounded-lg bg-slate-100" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="h-64 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-64 animate-pulse rounded-lg bg-slate-100" />
          </div>
        </div>
      )}

      {!isLoading && !isFetching && !errorMessage && hasValidRange && (
        <>
          <div className={`mt-5 grid grid-cols-2 gap-3 ${compact ? 'xl:grid-cols-4' : 'lg:grid-cols-4'}`}>
            <div className="border-l-4 border-blue-500 bg-blue-50/70 p-3">
              <p className="text-xs font-semibold text-blue-700">CA normal</p>
              <p className="mt-1 break-words text-lg font-bold tabular-nums text-blue-950">{formatAmount(totals.normalRevenue)}</p>
              <p className="mt-0.5 text-xs text-blue-700">Avant charges</p>
            </div>
            <div className="border-l-4 border-emerald-500 bg-emerald-50/70 p-3">
              <p className="text-xs font-semibold text-emerald-700">CA net</p>
              <p className="mt-1 break-words text-lg font-bold tabular-nums text-emerald-950">{formatAmount(totals.netRevenue)}</p>
              <p className="mt-0.5 text-xs text-emerald-700">Après charges</p>
            </div>
            <div className="border-l-4 border-amber-500 bg-amber-50/70 p-3">
              <p className="text-xs font-semibold text-amber-700">Charges nettes</p>
              <p className="mt-1 break-words text-lg font-bold tabular-nums text-amber-950">{formatAmount(totals.charges)}</p>
              <p className="mt-0.5 text-xs text-amber-700">Sur la période</p>
            </div>
            <div className={`border-l-4 p-3 ${overallChargePercentage > ALERT_THRESHOLD ? 'border-rose-500 bg-rose-50/70' : 'border-slate-400 bg-slate-50'}`}>
              <p className={`text-xs font-semibold ${overallChargePercentage > ALERT_THRESHOLD ? 'text-rose-700' : 'text-slate-700'}`}>
                Taux global des charges
              </p>
              <p className={`mt-1 text-lg font-bold tabular-nums ${overallChargePercentage > ALERT_THRESHOLD ? 'text-rose-950' : 'text-slate-950'}`}>
                {percentageFormatter.format(overallChargePercentage)} %
              </p>
              <p className={`mt-0.5 text-xs ${overallChargePercentage > ALERT_THRESHOLD ? 'text-rose-700' : 'text-slate-600'}`}>
                Seuil d'alerte : {ALERT_THRESHOLD} %
              </p>
            </div>
          </div>

          {alertMonths.length > 0 ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4" role="alert">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 shrink-0 text-rose-600" size={20} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="font-semibold text-rose-950">
                    Alerte PDG · {alertMonths.length} mois au-dessus du seuil de {ALERT_THRESHOLD} %
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {alertMonths.map((point) => (
                      <span key={point.monthKey} className="rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-800">
                        {point.monthLongLabel} · <strong>{percentageFormatter.format(point.chargePercentage)} %</strong> · {formatAmount(point.charges)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
              <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={19} aria-hidden="true" />
              <div>
                <p className="font-semibold">Charges maîtrisées</p>
                <p className="mt-0.5 text-emerald-800">Aucun mois ne dépasse {ALERT_THRESHOLD} % du chiffre d'affaires normal.</p>
              </div>
            </div>
          )}

          <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-2">
            <figure className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/50 p-3 sm:p-4">
              <figcaption className="mb-4">
                <div className="flex items-center gap-2">
                  <WalletCards className="text-blue-600" size={18} aria-hidden="true" />
                  <h3 className="font-semibold text-slate-900">CA normal vs charges nettes</h3>
                </div>
                <p className="mt-1 text-xs text-slate-500">Poids mensuel des charges face au chiffre d'affaires normal, en dirhams</p>
              </figcaption>
              <div style={{ height: chartHeight }} role="img" aria-label="Graphique en barres comparant le chiffre d'affaires normal et les charges nettes par mois">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="monthLabel" tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
                    <YAxis width={54} tickFormatter={formatAxisAmount} tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip content={<RevenueChargesTooltip />} cursor={{ fill: '#e2e8f0', opacity: 0.35 }} />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    <Bar dataKey="normalRevenue" name="CA normal" fill="#2563eb" radius={[3, 3, 0, 0]} maxBarSize={34} />
                    <Bar dataKey="charges" name="Charges nettes" fill="#d97706" radius={[3, 3, 0, 0]} maxBarSize={34} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </figure>

            <figure className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/50 p-3 sm:p-4">
              <figcaption className="mb-4">
                <div className="flex items-center gap-2">
                  <ReceiptText className="text-amber-600" size={18} aria-hidden="true" />
                  <h3 className="font-semibold text-slate-900">Poids des charges</h3>
                </div>
                <p className="mt-1 text-xs text-slate-500">Part des charges nettes dans le CA normal</p>
              </figcaption>
              <div style={{ height: chartHeight }} role="img" aria-label="Courbe du pourcentage mensuel des charges avec seuil d'alerte à cinq pour cent">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="monthLabel" tick={{ fill: '#475569', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
                    <YAxis
                      width={46}
                      domain={[0, (dataMax: number) => Math.max(ALERT_THRESHOLD + 1, Math.ceil(dataMax + 1))]}
                      tickFormatter={(value: number) => `${percentageFormatter.format(value)} %`}
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<ChargeTooltip />} cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    <ReferenceLine
                      y={ALERT_THRESHOLD}
                      stroke="#e11d48"
                      strokeDasharray="6 4"
                      strokeWidth={2}
                      label={{ value: 'Seuil 5 %', position: 'insideTopRight', fill: '#be123c', fontSize: 11 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="chargePercentage"
                      name="Taux de charges"
                      stroke="#d97706"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#fff', stroke: '#d97706', strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: '#d97706', stroke: '#fff', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </figure>
          </div>
        </>
      )}
    </section>
  );
};

export default ChiffreAffairesMonthlyCharts;
