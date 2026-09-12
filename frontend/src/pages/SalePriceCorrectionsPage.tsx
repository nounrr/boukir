import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign, ImageOff, Loader2, RefreshCw, Search, Sparkles } from 'lucide-react';
import { type HistoricalSalePrice, type SalePriceCorrectionRow, type SalePriceSource, useGetSalePriceCorrectionsQuery, useUpdateSalePriceCorrectionsMutation } from '../store/api/productsApi';
import { showConfirmation, showError, showSuccess } from '../utils/notifications';
import { toBackendUrl } from '../utils/url';

type CorrectionTab = 'pending' | 'processed';
type Decision = { prixVente: number; prixVente2: number };
const money = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantity = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const rowKey = (row: Pick<SalePriceCorrectionRow, 'product_id' | 'variant_id'>) => `${row.product_id}:${row.variant_id ?? 'base'}`;
const samePrice = (a: number, b: number) => Math.abs(Number(a) - Number(b)) < 0.005;
const sourceLabels: Record<SalePriceSource, string> = { snapshot: 'Snapshot FIFO', variant: 'Catalogue variante', product: 'Catalogue produit' };

const PriceCandidate: React.FC<{ candidate: HistoricalSalePrice; selected: boolean; tone: 'indigo' | 'amber'; disabled?: boolean; onSelect: () => void }> = ({ candidate, selected, tone, disabled, onSelect }) => {
  const active = tone === 'indigo' ? 'border-indigo-500 bg-indigo-50 text-indigo-950 ring-indigo-100' : 'border-amber-500 bg-amber-50 text-amber-950 ring-amber-100';
  const dot = tone === 'indigo' ? 'border-indigo-600 bg-indigo-600' : 'border-amber-600 bg-amber-500';
  return (
    <button type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={onSelect}
      className={`group flex w-full min-w-[175px] items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-default ${selected ? `${active} ring-2` : 'border-stone-200 bg-white text-stone-700 hover:border-stone-400'}`}>
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${selected ? dot : 'border-stone-300 bg-white'}`}>{selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}</span>
      <span className="min-w-0 flex-1"><span className="block whitespace-nowrap text-sm font-bold tabular-nums">{money.format(candidate.price)} DH</span><span className="block text-[10px] text-stone-500">Qté {quantity.format(candidate.quantity_sold)}</span></span>
      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${selected ? 'bg-white/80' : 'bg-stone-100'}`}>{candidate.usage_count} utilisation{candidate.usage_count > 1 ? 's' : ''}</span>
    </button>
  );
};

const CurrentPrice: React.FC<{ value: number; source: SalePriceSource }> = ({ value, source }) => (
  <div className="min-w-[126px]"><span className="block text-base font-bold tabular-nums text-stone-900">{money.format(value)} <span className="text-xs font-medium text-stone-400">DH</span></span><span className="mt-1 inline-flex rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">{sourceLabels[source]}</span></div>
);

const KeepCurrentPrice: React.FC<{ selected: boolean; disabled: boolean; tone: 'indigo' | 'amber'; value: number; onSelect: () => void }> = ({ selected, disabled, tone, value, onSelect }) => (
  <button type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={onSelect}
    className={`flex w-full items-center gap-2 rounded-md border border-dashed px-2.5 py-1.5 text-left text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 disabled:cursor-default ${selected ? 'border-emerald-400 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100' : tone === 'indigo' ? 'border-indigo-200 text-indigo-700 hover:bg-indigo-50' : 'border-amber-200 text-amber-800 hover:bg-amber-50'}`}>
    {selected ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-current opacity-50" />}
    Garder l’actuel · <span className="tabular-nums">{money.format(value)} DH</span>
  </button>
);

const SalePriceCorrectionsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<CorrectionTab>('pending');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const limit = 30;
  useEffect(() => { const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300); return () => window.clearTimeout(timer); }, [search]);

  const { data, isLoading, isFetching, isError, error, refetch } = useGetSalePriceCorrectionsQuery({ page, limit, q: query || undefined, status: activeTab });
  const [applyCorrections, { isLoading: isSaving }] = useUpdateSalePriceCorrectionsMutation();
  const rows = data?.data || [];
  const meta = data?.meta;

  useEffect(() => {
    if (!rows.length) return;
    setDecisions((previous) => {
      const next = { ...previous };
      for (const row of rows) if (!next[rowKey(row)]) next[rowKey(row)] = activeTab === 'pending'
        ? { prixVente: row.high_prices[0]?.price ?? row.current_prix_vente, prixVente2: row.low_prices[0]?.price ?? row.current_prix_vente_2 }
        : { prixVente: row.current_prix_vente, prixVente2: row.current_prix_vente_2 };
      return next;
    });
  }, [activeTab, rows]);

  const pendingDecisions = useMemo(() => activeTab === 'pending' ? rows.map((row) => ({ row, decision: decisions[rowKey(row)] })).filter((item): item is { row: SalePriceCorrectionRow; decision: Decision } => Boolean(item.decision)) : [], [activeTab, decisions, rows]);
  const changedCount = pendingDecisions.filter(({ row, decision }) => !samePrice(row.current_prix_vente, decision.prixVente) || !samePrice(row.current_prix_vente_2, decision.prixVente2)).length;
  const updateDecision = (row: SalePriceCorrectionRow, patch: Partial<Decision>) => setDecisions((previous) => ({ ...previous, [rowKey(row)]: { prixVente: previous[rowKey(row)]?.prixVente ?? row.current_prix_vente, prixVente2: previous[rowKey(row)]?.prixVente2 ?? row.current_prix_vente_2, ...patch } }));

  const submit = async () => {
    if (!pendingDecisions.length || isSaving) return;
    const confirmation = await showConfirmation(`${pendingDecisions.length} décision(s) seront traitée(s), dont ${changedCount} avec modification de prix.`, 'Corriger les prix de vente ?');
    if (!confirmation.isConfirmed) return;
    try {
      await applyCorrections({ corrections: pendingDecisions.map(({ row, decision }) => ({ product_id: row.product_id, variant_id: row.variant_id, action: samePrice(row.current_prix_vente, decision.prixVente) && samePrice(row.current_prix_vente_2, decision.prixVente2) ? 'confirm' : 'apply', prix_vente: decision.prixVente, prix_vente_2: decision.prixVente2, expected_prix_vente: row.current_prix_vente, expected_prix_vente_2: row.current_prix_vente_2 })) }).unwrap();
      setDecisions({}); showSuccess(`${pendingDecisions.length} ligne(s) traitée(s)`); await refetch();
    } catch (submitError) {
      const apiError = submitError as { status?: number; data?: { message?: string } };
      showError(apiError.data?.message || 'Impossible d’appliquer les corrections.', apiError.status === 409 ? 'Prix modifiés entre-temps' : 'Échec de la correction');
      if (apiError.status === 409) { setDecisions({}); await refetch(); }
    }
  };

  return (
    <main className="min-h-full bg-stone-50 pb-40 lg:pb-12">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-[1800px] px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div><div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700"><CircleDollarSign className="h-4 w-4" /> Catalogue · aide à la décision</div><h1 className="text-2xl font-bold tracking-tight text-stone-950">Assistant de correction des prix</h1><p className="mt-1 max-w-3xl text-sm text-stone-500">Comparez les prix actuels aux ventes réellement pratiquées. Les prix historiques sont ramenés à l’unité de base.</p></div>
            <div className="flex flex-wrap items-center gap-2"><div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-right"><span className="block text-[10px] font-bold uppercase tracking-wide text-stone-400">Décisions de la page</span><span className="text-sm font-bold tabular-nums text-stone-800">{pendingDecisions.length} prêtes · {changedCount} modifications</span></div>{activeTab === 'pending' ? <button type="button" onClick={() => void submit()} disabled={!pendingDecisions.length || isSaving} className="inline-flex h-11 items-center gap-2 rounded-lg bg-emerald-700 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Corriger</button> : null}</div>
          </div>
          <div className="mt-5 flex flex-col gap-3 border-t border-stone-100 pt-4 md:flex-row md:items-center md:justify-between">
            <nav className="flex gap-1" aria-label="État des corrections">{([{ id: 'pending', label: 'À corriger' }, { id: 'processed', label: 'Traités' }] as const).map((tab) => <button key={tab.id} type="button" onClick={() => { setActiveTab(tab.id); setPage(1); setDecisions({}); }} className={`relative px-4 py-2 text-sm font-bold transition ${activeTab === tab.id ? 'text-stone-950' : 'text-stone-500 hover:text-stone-800'}`}>{tab.label}{activeTab === tab.id ? <span className="absolute inset-x-2 -bottom-[17px] h-0.5 bg-emerald-600" /> : null}</button>)}</nav>
            <div className="flex items-center gap-2"><label className="relative block w-full md:w-80"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ID, référence, produit, variante…" className="h-10 w-full rounded-lg border-stone-300 bg-stone-50 pl-9 pr-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-500 focus:ring-emerald-500" /></label><button type="button" onClick={() => void refetch()} disabled={isFetching} aria-label="Actualiser" className="flex h-10 w-10 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-600 transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /></button></div>
          </div>
        </div>
      </header>

      {activeTab === 'pending' && rows.length > 0 ? (
        <div className="sticky top-0 z-30 hidden border-b border-stone-200 bg-white/95 shadow-sm backdrop-blur lg:block">
          <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4 px-6 py-2.5">
            <p className="text-sm text-stone-600"><span className="font-bold text-stone-900">{pendingDecisions.length} décision(s)</span> sur cette page · {changedCount} prix à modifier</p>
            <button type="button" onClick={() => void submit()} disabled={!pendingDecisions.length || isSaving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-50">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Corriger les décisions</button>
          </div>
        </div>
      ) : null}

      <section className="mx-auto max-w-[1800px] px-4 py-5 sm:px-6">
        {isLoading ? <div className="flex min-h-72 items-center justify-center rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-500"><Loader2 className="mr-2 h-5 w-5 animate-spin text-emerald-600" /> Chargement des prix et de l’historique…</div>
          : isError ? <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-red-200 bg-white p-8 text-center"><AlertCircle className="h-8 w-8 text-red-500" /><h2 className="mt-3 font-bold text-stone-900">Impossible de charger les corrections</h2><p className="mt-1 text-sm text-stone-500">{(error as { data?: { message?: string } })?.data?.message || 'Réessayez dans quelques instants.'}</p><button type="button" onClick={() => void refetch()} className="mt-4 rounded-lg bg-stone-900 px-4 py-2 text-sm font-bold text-white">Réessayer</button></div>
            : rows.length === 0 ? <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-stone-200 bg-white p-8 text-center"><CheckCircle2 className="h-9 w-9 text-emerald-600" /><h2 className="mt-3 font-bold text-stone-900">{query ? 'Aucun résultat' : activeTab === 'pending' ? 'Tout est traité' : 'Aucune correction traitée'}</h2><p className="mt-1 text-sm text-stone-500">{query ? 'Modifiez votre recherche pour retrouver un produit.' : activeTab === 'pending' ? 'Les produits corrigés se trouvent dans l’onglet Traités.' : 'Les décisions validées apparaîtront ici.'}</p></div>
              : <><p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-stone-500 2xl:hidden"><ChevronRight className="h-3.5 w-3.5" /> Faites glisser le tableau horizontalement pour voir toutes les décisions.</p><div className={`overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm ${isFetching ? 'opacity-70' : ''}`}><table className="w-full min-w-[1160px] table-fixed border-collapse"><thead className="bg-stone-100/80 text-left text-[11px] font-bold uppercase tracking-wide text-stone-500"><tr><th className="sticky left-0 z-20 w-[300px] border-b border-r border-stone-200 bg-stone-100 px-4 py-3 shadow-[3px_0_6px_-5px_rgba(0,0,0,0.45)]">Produit / variante</th><th className="w-[130px] border-b border-stone-200 px-3 py-3">Prix vente actuel</th><th className="w-[130px] border-b border-stone-200 px-3 py-3">Prix vente 2 actuel</th><th className="w-[210px] border-b border-l border-indigo-100 bg-indigo-50/60 px-3 py-3 text-indigo-800">Prix vente · valeurs hautes</th><th className="w-[210px] border-b border-l border-amber-100 bg-amber-50/60 px-3 py-3 text-amber-800">Prix vente 2 · valeurs basses</th><th className="w-[180px] border-b border-stone-200 px-3 py-3">Décision</th></tr></thead>
                <tbody className="divide-y divide-stone-200">{rows.map((row) => { const decision = decisions[rowKey(row)] || { prixVente: row.current_prix_vente, prixVente2: row.current_prix_vente_2 }; const unchanged = samePrice(row.current_prix_vente, decision.prixVente) && samePrice(row.current_prix_vente_2, decision.prixVente2); return <tr key={rowKey(row)} className="align-top transition hover:bg-stone-50/70">
                  <td className="sticky left-0 z-10 border-r border-stone-200 bg-white px-4 py-4 shadow-[3px_0_6px_-5px_rgba(0,0,0,0.45)]"><div className="flex gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-stone-200 bg-stone-100">{row.image_url ? <img src={toBackendUrl(row.image_url)} alt="" className="h-full w-full object-cover" /> : <ImageOff className="h-5 w-5 text-stone-400" />}</div><div className="min-w-0"><p className="font-bold leading-5 text-stone-900">{row.designation}</p>{row.variant_name ? <p className="mt-0.5 text-sm font-semibold text-indigo-700">{row.variant_name}</p> : <p className="mt-0.5 text-xs text-stone-400">Produit sans variante</p>}<p className="mt-1 text-[11px] tabular-nums text-stone-500">ID {row.product_id}{row.reference ? ` · Réf. ${row.reference}` : ''}{row.variant_reference ? ` · Var. ${row.variant_reference}` : ''}</p></div></div></td>
                  <td className="px-3 py-4"><CurrentPrice value={row.current_prix_vente} source={row.current_prix_vente_source} /></td><td className="px-3 py-4"><CurrentPrice value={row.current_prix_vente_2} source={row.current_prix_vente_2_source} /></td>
                  <td className="border-l border-indigo-100 bg-indigo-50/20 px-3 py-3"><div role="radiogroup" aria-label={`Prix vente de ${row.designation}`} className="space-y-1.5"><KeepCurrentPrice tone="indigo" value={row.current_prix_vente} selected={samePrice(decision.prixVente, row.current_prix_vente) && !row.high_prices.some((candidate) => samePrice(candidate.price, row.current_prix_vente))} disabled={activeTab === 'processed' || isSaving} onSelect={() => updateDecision(row, { prixVente: row.current_prix_vente })} />{row.high_prices.length ? row.high_prices.map((candidate) => <PriceCandidate key={candidate.price} candidate={candidate} tone="indigo" selected={samePrice(decision.prixVente, candidate.price)} disabled={activeTab === 'processed' || isSaving} onSelect={() => updateDecision(row, { prixVente: candidate.price })} />) : <p className="px-1 text-xs leading-5 text-stone-500">Aucune vente exploitable. Le prix actuel sera conservé.</p>}</div></td>
                  <td className="border-l border-amber-100 bg-amber-50/20 px-3 py-3"><div role="radiogroup" aria-label={`Prix vente 2 de ${row.designation}`} className="space-y-1.5"><KeepCurrentPrice tone="amber" value={row.current_prix_vente_2} selected={samePrice(decision.prixVente2, row.current_prix_vente_2) && !row.low_prices.some((candidate) => samePrice(candidate.price, row.current_prix_vente_2))} disabled={activeTab === 'processed' || isSaving} onSelect={() => updateDecision(row, { prixVente2: row.current_prix_vente_2 })} />{row.low_prices.length ? row.low_prices.map((candidate) => <PriceCandidate key={candidate.price} candidate={candidate} tone="amber" selected={samePrice(decision.prixVente2, candidate.price)} disabled={activeTab === 'processed' || isSaving} onSelect={() => updateDecision(row, { prixVente2: candidate.price })} />) : <p className="px-1 text-xs leading-5 text-stone-500">Aucune vente exploitable. Le prix actuel sera conservé.</p>}</div></td>
                  <td className="px-3 py-3">{activeTab === 'processed' ? <div className="inline-flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs font-bold leading-4 text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Prix actuels corrects</div> : <div className="space-y-2"><button type="button" onClick={() => updateDecision(row, { prixVente: row.current_prix_vente, prixVente2: row.current_prix_vente_2 })} disabled={isSaving} aria-pressed={unchanged} className={`flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-bold leading-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 ${unchanged ? 'border-emerald-300 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100' : 'border-stone-300 bg-white text-stone-700 hover:border-emerald-400 hover:bg-emerald-50'}`}><CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${unchanged ? 'text-emerald-600' : 'text-stone-400'}`} /> Prix actuels corrects</button>{!unchanged ? <div className="space-y-1 px-1 text-xs"><p className="font-bold text-stone-800">Modification prête</p>{!samePrice(row.current_prix_vente, decision.prixVente) ? <p className="tabular-nums text-indigo-700">PV1 → {money.format(decision.prixVente)} DH</p> : null}{!samePrice(row.current_prix_vente_2, decision.prixVente2) ? <p className="tabular-nums text-amber-700">PV2 → {money.format(decision.prixVente2)} DH</p> : null}<p className="flex items-center gap-1 pt-1 font-semibold text-emerald-700"><Check className="h-3.5 w-3.5" /> Catalogue et stock liés</p></div> : <p className="px-1 text-[11px] leading-4 text-emerald-700">Confirmer sans modifier les prix.</p>}</div>}</td>
                </tr>; })}</tbody></table></div></>}

        {meta && meta.totalPages > 1 ? <div className="mt-4 flex items-center justify-between text-sm text-stone-500"><span>{meta.total} entité(s) · page {meta.page} sur {meta.totalPages}</span><div className="flex gap-2"><button type="button" disabled={page <= 1 || isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))} className="inline-flex h-9 items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 font-semibold text-stone-700 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Précédent</button><button type="button" disabled={page >= meta.totalPages || isFetching} onClick={() => setPage((value) => value + 1)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 font-semibold text-stone-700 disabled:opacity-40">Suivant <ChevronRight className="h-4 w-4" /></button></div></div> : null}
      </section>
      {activeTab === 'pending' && rows.length > 0 ? <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom)+0.75rem)] left-1/2 z-[60] flex -translate-x-1/2 items-center gap-4 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-xl lg:hidden"><span className="whitespace-nowrap text-xs font-bold text-stone-700">{pendingDecisions.length} décision(s)</span><button type="button" onClick={() => void submit()} disabled={!pendingDecisions.length || isSaving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-50">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Corriger</button></div> : null}
    </main>
  );
};

export default SalePriceCorrectionsPage;
