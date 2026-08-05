import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Box,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  PackageSearch,
  RefreshCw,
  Save,
  Search,
  ShoppingCart,
} from 'lucide-react';
import {
  useGetSlowMovingStockQuery,
  useUpdateSlowMovingStockSettingsMutation,
  type SlowMovingStockRow,
} from '../store/api/slowMovingStockApi';

const numberFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });
const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function errorMessage(error: unknown) {
  const value = error as { data?: { message?: string } | string; error?: string } | undefined;
  if (typeof value?.data === 'object' && value.data?.message) return value.data.message;
  if (typeof value?.data === 'string') return value.data;
  return value?.error || 'Une erreur est survenue. Veuillez réessayer.';
}

function formatDate(value?: string | null) {
  if (!value) return 'Jamais';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

function RotationBadge({ sold }: { sold: number }) {
  if (sold === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
        <AlertCircle className="h-3.5 w-3.5" />
        0 vente sur la période
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
      <AlertTriangle className="h-3.5 w-3.5" />
      Faible rotation
    </span>
  );
}

function ProductImage({ row }: { row: SlowMovingStockRow }) {
  if (!row.image_url) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-gray-400">
        <ImageOff className="h-5 w-5" />
      </div>
    );
  }
  return (
    <img
      src={row.image_url}
      alt=""
      className="h-12 w-12 shrink-0 rounded-lg border border-gray-200 bg-white object-cover"
      loading="lazy"
    />
  );
}

const SlowMovingStockPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [lookbackMonths, setLookbackMonths] = useState(4);
  const [salesThreshold, setSalesThreshold] = useState(3);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(searchInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const { data, error, isLoading, isFetching, refetch } = useGetSlowMovingStockQuery({
    page,
    limit,
    q: query || undefined,
  });
  const [updateSettings, { isLoading: isSaving }] = useUpdateSlowMovingStockSettingsMutation();
  const loadedLookbackMonths = data?.settings.lookbackMonths;
  const loadedSalesThreshold = data?.settings.salesThreshold;

  useEffect(() => {
    if (loadedLookbackMonths == null || loadedSalesThreshold == null) return;
    setLookbackMonths(loadedLookbackMonths);
    setSalesThreshold(loadedSalesThreshold);
  }, [loadedLookbackMonths, loadedSalesThreshold]);

  const settingsAreValid =
    Number.isInteger(lookbackMonths) &&
    lookbackMonths >= 1 &&
    lookbackMonths <= 60 &&
    Number.isFinite(salesThreshold) &&
    salesThreshold >= 0 &&
    salesThreshold <= 100000;

  const periodLabel = useMemo(
    () => formatDate(data?.settings.periodStart),
    [data?.settings.periodStart]
  );
  const zeroSalesRatio = data?.summary.skuCount
    ? (data.summary.zeroSalesCount / data.summary.skuCount) * 100
    : 0;

  const saveSettings = async () => {
    if (!settingsAreValid) return;
    setSaveError('');
    try {
      const normalized = await updateSettings({ lookbackMonths, salesThreshold }).unwrap();
      setLookbackMonths(normalized.lookbackMonths);
      setSalesThreshold(normalized.salesThreshold);
      setPage(1);
      refetch();
    } catch (saveFailure) {
      setSaveError(errorMessage(saveFailure));
    }
  };

  const summaryCards = [
    {
      label: 'Références concernées',
      value: data?.summary.skuCount ?? 0,
      icon: PackageSearch,
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
      iconTone: 'bg-amber-500 text-white',
    },
    {
      label: 'Produits distincts',
      value: data?.summary.productCount ?? 0,
      icon: Box,
      tone: 'border-slate-200 bg-white text-slate-800',
      iconTone: 'bg-slate-800 text-white',
    },
    {
      label: 'Stock total',
      value: numberFormatter.format(data?.summary.totalStock ?? 0),
      icon: BarChart3,
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      iconTone: 'bg-emerald-600 text-white',
    },
    {
      label: '0 vente sur la période',
      value: data?.summary.zeroSalesCount ?? 0,
      icon: ShoppingCart,
      tone: 'border-red-200 bg-red-50 text-red-800',
      iconTone: 'bg-red-500 text-white',
    },
  ];

  return (
    <section className="mx-auto w-full max-w-[1600px] space-y-5" aria-labelledby="slow-stock-title">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-700">
            <span className="h-px w-7 bg-amber-500" />
            Pilotage PDG
          </div>
          <h1 id="slow-stock-title" className="text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">
            Stock à faible rotation
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600 sm:text-base">
            Produits en stock avec peu ou aucune vente sur la période sélectionnée
          </p>
        </div>
        {data?.settings.periodStart && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <CalendarDays className="h-4 w-4 text-amber-600" />
            Période depuis le <strong className="font-semibold text-gray-900">{periodLabel}</strong>
          </div>
        )}
      </header>

      <section className="border-l-4 border-slate-700 bg-white p-4 shadow-sm" aria-label="Paramètres du calcul">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_230px] md:gap-4 lg:grid-cols-[minmax(0,1fr)_180px_180px_auto] lg:items-end">
          <div className="col-span-2 md:col-span-3 lg:col-span-1">
            <h2 className="font-semibold text-gray-900">Règles de détection</h2>
            <p className="mt-1 text-sm text-gray-500">
              Les modifications ne sont appliquées qu’après enregistrement.
            </p>
          </div>
          <label className="block text-sm font-medium text-gray-700">
            Période en mois
            <input
              type="number"
              min={1}
              max={60}
              step={1}
              value={lookbackMonths}
              onChange={(event) => setLookbackMonths(Number(event.target.value))}
              className="mt-1 block h-10 w-full rounded-md border-gray-300 text-gray-900 shadow-sm focus:border-emerald-600 focus:ring-emerald-600"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Ventes maximum
            <input
              type="number"
              min={0}
              max={100000}
              step="any"
              value={salesThreshold}
              onChange={(event) => setSalesThreshold(Number(event.target.value))}
              className="mt-1 block h-10 w-full rounded-md border-gray-300 text-gray-900 shadow-sm focus:border-emerald-600 focus:ring-emerald-600"
            />
          </label>
          <button
            type="button"
            onClick={saveSettings}
            disabled={!settingsAreValid || isSaving}
            className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:col-span-1"
          >
            {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? 'Enregistrement…' : 'Enregistrer et recalculer'}
          </button>
        </div>
        {!settingsAreValid && (
          <p className="mt-3 text-sm font-medium text-red-700">
            La période doit être un entier de 1 à 60 et le seuil un nombre de 0 à 100000.
          </p>
        )}
        {saveError && <p className="mt-3 text-sm font-medium text-red-700">{saveError}</p>}
      </section>

      <div className="flex gap-3 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <p>
          Calcul basé sur les bons <strong>En attente</strong> et les ventes finalisées. Les{' '}
          <strong>brouillons</strong> et <strong>annulations</strong> sont exclus.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4" aria-label="Résumé du stock à faible rotation">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.label} className={`min-h-[72px] border p-2.5 shadow-sm sm:min-h-28 sm:p-4 ${card.tone}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold leading-tight sm:text-sm">{card.label}</p>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md sm:h-8 sm:w-8 ${card.iconTone}`}>
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-xl font-bold tabular-nums sm:mt-3 sm:text-3xl">
                {isLoading ? '—' : card.value}
              </p>
            </article>
          );
        })}
      </section>

      <aside className="hidden items-center gap-5 border-l-4 border-red-400 bg-slate-950 px-5 py-3 text-white shadow-sm sm:flex" aria-label="Signal prioritaire">
        <div className="shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400">Signal prioritaire</p>
          <p className="mt-0.5 text-sm font-semibold">Stock sans mouvement commercial</p>
        </div>
        <div className="h-9 w-px bg-white/20" />
        <p className="min-w-0 flex-1 text-sm text-slate-200">
          <strong className="text-xl tabular-nums text-white">{numberFormatter.format(zeroSalesRatio)} %</strong>{' '}
          des références concernées n’ont enregistré aucune vente sur la période.
        </p>
        <div className="hidden h-2 w-44 overflow-hidden bg-slate-700 xl:block" aria-hidden="true">
          <span className="block h-full bg-red-400" style={{ width: `${Math.min(100, zeroSalesRatio)}%` }} />
        </div>
      </aside>

      <section className="overflow-hidden border border-gray-200 bg-white shadow-sm" aria-label="Références à analyser">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full sm:max-w-md">
            <span className="sr-only">Rechercher une référence ou un produit</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Référence, produit ou variante…"
              className="h-10 w-full rounded-md border-gray-300 pl-9 pr-3 text-sm focus:border-amber-500 focus:ring-amber-500"
            />
          </label>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            {isFetching && !isLoading && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Actualisation
              </span>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Lignes
              <select
                value={limit}
                onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}
                className="h-9 rounded-md border-gray-300 py-1 text-sm focus:border-amber-500 focus:ring-amber-500"
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3 p-4" aria-label="Chargement des références">
            {[1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="h-16 animate-pulse bg-gray-100" />
            ))}
          </div>
        ) : error ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-5 py-10 text-center">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <h3 className="mt-3 font-semibold text-gray-900">Impossible de charger le stock</h3>
            <p className="mt-1 max-w-lg text-sm text-gray-600">{errorMessage(error)}</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-4 inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <RefreshCw className="h-4 w-4" /> Réessayer
            </button>
          </div>
        ) : !data?.data.length ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-5 py-10 text-center">
            <PackageSearch className="h-11 w-11 text-gray-300" />
            <h3 className="mt-3 font-semibold text-gray-900">
              {query ? 'Aucun résultat pour cette recherche' : 'Aucun stock à faible rotation'}
            </h3>
            <p className="mt-1 max-w-lg text-sm text-gray-500">
              {query
                ? 'Essayez une autre référence, désignation ou variante.'
                : 'Toutes les références en stock dépassent actuellement le seuil de ventes configuré.'}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Image</th>
                    <th className="px-4 py-3 font-semibold">Référence</th>
                    <th className="px-4 py-3 font-semibold">Produit</th>
                    <th className="px-4 py-3 text-right font-semibold">Stock</th>
                    <th className="px-4 py-3 text-right font-semibold">Ventes</th>
                    <th className="px-4 py-3 font-semibold">Statut</th>
                    <th className="px-4 py-3 font-semibold">Dernière date en stock</th>
                    <th className="px-4 py-3 font-semibold">Dernière vente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.data.map((row) => (
                    <tr key={`${row.product_id}:${row.variant_id ?? 'parent'}`} className="transition hover:bg-amber-50/40">
                      <td className="px-4 py-3"><ProductImage row={row} /></td>
                      <td className="px-4 py-3 align-middle">
                        <p className="font-bold text-gray-900">{row.product_reference}</p>
                        {row.reference_2 && <p className="mt-0.5 text-xs text-gray-500">Réf. 2 · {row.reference_2}</p>}
                        {row.variant_reference && <p className="mt-0.5 text-xs font-medium text-amber-700">Var. · {row.variant_reference}</p>}
                      </td>
                      <td className="max-w-sm px-4 py-3 align-middle">
                        <p className="font-semibold text-gray-900">{row.designation}</p>
                        {row.variant_name && <p className="mt-1 text-xs text-gray-500">Variante · {row.variant_name}</p>}
                      </td>
                      <td className="px-4 py-3 text-right align-middle text-lg font-bold tabular-nums text-gray-950">
                        {numberFormatter.format(row.stock_current)}
                      </td>
                      <td className="px-4 py-3 text-right align-middle text-lg font-bold tabular-nums text-amber-700">
                        {numberFormatter.format(row.sold_quantity)}
                      </td>
                      <td className="px-4 py-3 align-middle"><RotationBadge sold={row.sold_quantity} /></td>
                      <td className="whitespace-nowrap px-4 py-3 align-middle text-gray-600">{formatDate(row.last_stock_at)}</td>
                      <td className="whitespace-nowrap px-4 py-3 align-middle text-gray-600">{formatDate(row.last_sale_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-gray-200 lg:hidden">
              {data.data.map((row) => (
                <article key={`${row.product_id}:${row.variant_id ?? 'parent'}`} className="p-4">
                  <div className="flex gap-3">
                    <ProductImage row={row} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-xs font-bold uppercase tracking-wide text-amber-700">
                          Réf. {row.product_reference}
                        </p>
                        {row.reference_2 && <span className="shrink-0 text-[11px] text-gray-500">{row.reference_2}</span>}
                      </div>
                      <h3 className="mt-1 line-clamp-2 font-semibold leading-snug text-gray-950">{row.designation}</h3>
                      {row.variant_name && (
                        <p className="mt-1 text-xs text-gray-600">
                          {row.variant_name}{row.variant_reference ? ` · ${row.variant_reference}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 divide-x divide-gray-200 border-y border-gray-200 py-3 text-center">
                    <div>
                      <p className="text-xs font-medium text-gray-500">Stock actuel</p>
                      <p className="mt-1 text-xl font-bold tabular-nums text-gray-950">{numberFormatter.format(row.stock_current)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500">Vendu sur la période</p>
                      <p className="mt-1 text-xl font-bold tabular-nums text-amber-700">{numberFormatter.format(row.sold_quantity)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <RotationBadge sold={row.sold_quantity} />
                    <div className="text-right text-xs text-gray-500">
                      <p>Dernière date en stock · {formatDate(row.last_stock_at)}</p>
                      <p className="mt-1">Dernière vente · {formatDate(row.last_sale_at)}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {data && data.meta.total > 0 && (
          <footer className="flex flex-col gap-3 border-t border-gray-200 bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600">
              Page <strong className="text-gray-900">{data.meta.page}</strong> sur{' '}
              <strong className="text-gray-900">{data.meta.totalPages}</strong> · {data.meta.total} référence{data.meta.total > 1 ? 's' : ''}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || isFetching}
                className="inline-flex h-9 items-center gap-1 rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Précédent
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(data.meta.totalPages, current + 1))}
                disabled={page >= data.meta.totalPages || isFetching}
                className="inline-flex h-9 items-center gap-1 rounded-md border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Suivant <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </footer>
        )}
      </section>
    </section>
  );
};

export default SlowMovingStockPage;
