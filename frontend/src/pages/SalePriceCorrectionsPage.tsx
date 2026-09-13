import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Check, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign, Eraser, ImageOff, Loader2, RefreshCw, RotateCcw, Search, Sparkles, Wand2 } from 'lucide-react';
import { type HistoricalSalePrice, type SalePriceCorrectionRow, type SalePriceSource, useGetSalePriceCorrectionsQuery, useResetSalePriceCorrectionsMutation, useUpdateSalePriceCorrectionsMutation } from '../store/api/productsApi';
import { showConfirmation, showError, showSuccess } from '../utils/notifications';
import { toBackendUrl } from '../utils/url';

type CorrectionTab = 'pending' | 'processed';
type RowFilter = 'all' | 'todo' | 'ready';
type Side = 'pv1' | 'pv2';
type Tone = 'indigo' | 'amber';
// `keep` est un choix explicite, distinct d'un prix qui vaudrait la même chose que l'actuel.
type Choice = { kind: 'keep' } | { kind: 'price'; value: number };
type Decision = { pv1?: Choice; pv2?: Choice };

const KEEP: Choice = { kind: 'keep' };
const money = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantity = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const rowKey = (row: Pick<SalePriceCorrectionRow, 'product_id' | 'variant_id'>) => `${row.product_id}:${row.variant_id ?? 'base'}`;
const samePrice = (a: number, b: number) => Math.abs(Number(a) - Number(b)) < 0.005;
const sourceLabels: Record<SalePriceSource, string> = { snapshot: 'Snapshot FIFO', variant: 'Catalogue variante', product: 'Catalogue produit' };
const resolvePrice = (choice: Choice | undefined, current: number) => (!choice ? null : choice.kind === 'keep' ? current : choice.value);
const isReady = (decision?: Decision) => Boolean(decision?.pv1 && decision?.pv2);
const isStarted = (decision?: Decision) => Boolean(decision?.pv1 || decision?.pv2);
const correctedAt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const formatCorrectedAt = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : correctedAt.format(date);
};
// PV1 = 1·2·3, PV2 = 4·5·6, 0 = garder les deux.
const PV1_KEYS = ['1', '2', '3'] as const;
const PV2_KEYS = ['4', '5', '6'] as const;

const Kbd: React.FC<{ children: React.ReactNode; muted?: boolean }> = ({ children, muted }) => (
  <kbd className={`inline-flex h-4 min-w-[1rem] items-center justify-center rounded border px-1 font-sans text-[10px] font-bold leading-none ${muted ? 'border-stone-300 bg-stone-100 text-stone-500' : 'border-stone-300 bg-white text-stone-600'}`}>{children}</kbd>
);

const PriceCandidate = React.memo<{ candidate: HistoricalSalePrice; shortcut: string; selected: boolean; tone: Tone; disabled?: boolean; onSelect: () => void }>(({ candidate, shortcut, selected, tone, disabled, onSelect }) => {
  const active = tone === 'indigo' ? 'border-indigo-500 bg-indigo-50 text-indigo-950 ring-indigo-200' : 'border-amber-500 bg-amber-50 text-amber-950 ring-amber-200';
  const dot = tone === 'indigo' ? 'border-indigo-600 bg-indigo-600' : 'border-amber-600 bg-amber-500';
  return (
    <button
      type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={onSelect}
      className={`group flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 disabled:cursor-default disabled:opacity-60 ${selected ? `${active} ring-2` : 'border-stone-200 bg-white text-stone-700 hover:border-stone-400 hover:bg-stone-50'}`}
    >
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${selected ? dot : 'border-stone-300 bg-white'}`}>{selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}</span>
      <span className="min-w-0 flex-1">
        <span className="block whitespace-nowrap text-sm font-bold tabular-nums">{money.format(candidate.price)} DH</span>
        <span className="block text-[10px] text-stone-500">{candidate.usage_count} vente{candidate.usage_count > 1 ? 's' : ''} · qté {quantity.format(candidate.quantity_sold)}</span>
      </span>
      <Kbd muted={!selected}>{shortcut}</Kbd>
    </button>
  );
});
PriceCandidate.displayName = 'PriceCandidate';

const KeepOption = React.memo<{ selected: boolean; disabled?: boolean; value: number; onSelect: () => void }>(({ selected, disabled, value, onSelect }) => (
  <button
    type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={onSelect}
    className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 disabled:cursor-default disabled:opacity-60 ${selected ? 'border-emerald-500 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-200' : 'border-dashed border-stone-300 bg-white text-stone-600 hover:border-emerald-400 hover:bg-emerald-50/60'}`}
  >
    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-emerald-600 bg-emerald-600' : 'border-stone-300 bg-white'}`}>{selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}</span>
    <span className="min-w-0 flex-1">
      <span className="block whitespace-nowrap text-sm font-bold tabular-nums">{money.format(value)} DH</span>
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-stone-500">Garder l’actuel</span>
    </span>
  </button>
));
KeepOption.displayName = 'KeepOption';

const CurrentPrice = React.memo<{ value: number; source: SalePriceSource }>(({ value, source }) => (
  <div>
    <span className="block text-base font-bold tabular-nums text-stone-900">{money.format(value)} <span className="text-xs font-medium text-stone-400">DH</span></span>
    <span className="mt-1 inline-flex rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">{sourceLabels[source]}</span>
  </div>
));
CurrentPrice.displayName = 'CurrentPrice';

const ChoiceColumn: React.FC<{ label: string; tone: Tone; current: number; choice?: Choice; candidates: HistoricalSalePrice[]; shortcuts: readonly string[]; disabled: boolean; onSelect: (choice: Choice) => void }> = ({ label, tone, current, choice, candidates, shortcuts, disabled, onSelect }) => (
  <div role="radiogroup" aria-label={label} className="space-y-1.5">
    <KeepOption value={current} selected={choice?.kind === 'keep'} disabled={disabled} onSelect={() => onSelect(KEEP)} />
    {candidates.length ? candidates.map((candidate, index) => (
      <PriceCandidate
        key={candidate.price} candidate={candidate} tone={tone} shortcut={shortcuts[index] ?? '·'} disabled={disabled}
        selected={choice?.kind === 'price' && samePrice(choice.value, candidate.price)}
        onSelect={() => onSelect({ kind: 'price', value: candidate.price })}
      />
    )) : <p className="px-1 text-[11px] leading-4 text-stone-400">Aucune vente exploitable.</p>}
  </div>
);

type CorrectionRowProps = {
  row: SalePriceCorrectionRow;
  index: number;
  decision?: Decision;
  focused: boolean;
  checked: boolean;
  readOnly: boolean;
  saving: boolean;
  onSelect: (key: string, side: Side, choice: Choice) => void;
  onKeepBoth: (key: string) => void;
  onClear: (key: string) => void;
  onFocus: (key: string) => void;
  onToggleCheck: (key: string, index: number, shiftKey: boolean) => void;
  registerRow: (key: string, element: HTMLTableRowElement | null) => void;
};

const CorrectionRow = React.memo<CorrectionRowProps>(({ row, index, decision, focused, checked, readOnly, saving, onSelect, onKeepBoth, onClear, onFocus, onToggleCheck, registerRow }) => {
  const key = rowKey(row);
  const pv1 = resolvePrice(decision?.pv1, row.current_prix_vente);
  const pv2 = resolvePrice(decision?.pv2, row.current_prix_vente_2);
  const ready = pv1 !== null && pv2 !== null;
  const changed = ready && (!samePrice(pv1, row.current_prix_vente) || !samePrice(pv2, row.current_prix_vente_2));
  const rail = readOnly ? (checked ? 'bg-indigo-500' : 'bg-emerald-500') : ready ? (changed ? 'bg-indigo-500' : 'bg-emerald-500') : isStarted(decision) ? 'bg-amber-400' : 'bg-stone-200';
  const rowTint = readOnly ? (checked ? 'bg-indigo-50' : 'bg-white hover:bg-stone-50') : focused ? 'bg-stone-100' : 'bg-white hover:bg-stone-50';

  return (
    <tr
      ref={(element) => registerRow(key, element)}
      onMouseDown={() => onFocus(key)} onFocusCapture={() => onFocus(key)}
      className={`align-top transition-colors ${rowTint}`}
    >
      <td className="sticky left-0 z-10 border-r border-stone-200 bg-inherit px-4 py-3 shadow-[3px_0_6px_-5px_rgba(0,0,0,0.45)]">
        <span className={`absolute inset-y-0 left-0 w-1 ${rail}`} aria-hidden />
        <div className="flex gap-3">
          {readOnly ? (
            <input
              type="checkbox" checked={checked} disabled={saving}
              onChange={() => undefined}
              onClick={(event) => onToggleCheck(key, index, event.shiftKey)}
              aria-label={`Sélectionner ${row.designation}${row.variant_name ? ` · ${row.variant_name}` : ''}`}
              className="mt-4 h-4 w-4 shrink-0 cursor-pointer rounded border-stone-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
            />
          ) : null}
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
            {row.image_url ? <img src={toBackendUrl(row.image_url)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <ImageOff className="h-5 w-5 text-stone-400" />}
          </div>
          <div className="min-w-0">
            <p className="font-bold leading-5 text-stone-900">{row.designation}</p>
            {row.variant_name ? <p className="mt-0.5 text-sm font-semibold text-indigo-700">{row.variant_name}</p> : <p className="mt-0.5 text-xs text-stone-400">Produit sans variante</p>}
            <p className="mt-1 text-[11px] tabular-nums text-stone-500">ID {row.product_id}{row.reference ? ` · Réf. ${row.reference}` : ''}{row.variant_reference ? ` · Var. ${row.variant_reference}` : ''}</p>
          </div>
        </div>
      </td>

      <td className="px-3 py-3"><CurrentPrice value={row.current_prix_vente} source={row.current_prix_vente_source} /></td>
      <td className="border-l border-indigo-100 bg-indigo-50/20 px-3 py-3">
        <ChoiceColumn label={`Prix vente de ${row.designation}`} tone="indigo" current={row.current_prix_vente} choice={decision?.pv1} candidates={row.high_prices} shortcuts={PV1_KEYS} disabled={readOnly || saving} onSelect={(choice) => onSelect(key, 'pv1', choice)} />
      </td>

      <td className="border-l border-stone-200 px-3 py-3"><CurrentPrice value={row.current_prix_vente_2} source={row.current_prix_vente_2_source} /></td>
      <td className="border-l border-amber-100 bg-amber-50/20 px-3 py-3">
        <ChoiceColumn label={`Prix vente 2 de ${row.designation}`} tone="amber" current={row.current_prix_vente_2} choice={decision?.pv2} candidates={row.low_prices} shortcuts={PV2_KEYS} disabled={readOnly || saving} onSelect={(choice) => onSelect(key, 'pv2', choice)} />
      </td>

      <td className="border-l border-stone-200 px-3 py-3">
        {readOnly ? (
          <div className="space-y-2">
            <div className="inline-flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs font-bold leading-4 text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Traité{formatCorrectedAt(row.corrected_at) ? <span className="font-medium text-emerald-600">le {formatCorrectedAt(row.corrected_at)}</span> : null}</div>
            <button
              type="button" onClick={() => onToggleCheck(key, index, false)} disabled={saving}
              className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-bold leading-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 ${checked ? 'border-indigo-400 bg-indigo-50 text-indigo-800' : 'border-stone-300 bg-white text-stone-600 hover:border-indigo-400 hover:bg-indigo-50'}`}
            >
              <RotateCcw className="h-3.5 w-3.5 shrink-0" /> {checked ? 'Sélectionné' : 'Sélectionner'}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button" onClick={() => onKeepBoth(key)} disabled={saving}
              className="flex w-full items-center gap-2 rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-left text-xs font-bold leading-4 text-stone-700 transition hover:border-emerald-400 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> <span className="flex-1">Garder les 2 prix</span> <Kbd muted>0</Kbd>
            </button>

            {ready ? (
              <div className="space-y-1 rounded-lg border border-stone-200 bg-stone-50 px-2 py-1.5 text-xs">
                {changed ? (
                  <>
                    {!samePrice(pv1, row.current_prix_vente) ? <p className="flex items-center gap-1 tabular-nums font-semibold text-indigo-700">PV1 <ArrowRight className="h-3 w-3" /> {money.format(pv1)} DH</p> : null}
                    {!samePrice(pv2, row.current_prix_vente_2) ? <p className="flex items-center gap-1 tabular-nums font-semibold text-amber-700">PV2 <ArrowRight className="h-3 w-3" /> {money.format(pv2)} DH</p> : null}
                    <p className="flex items-center gap-1 pt-0.5 text-[11px] font-semibold text-emerald-700"><Check className="h-3 w-3" /> Catalogue et stock liés</p>
                  </>
                ) : <p className="flex items-center gap-1 font-semibold text-emerald-700"><Check className="h-3.5 w-3.5" /> Prix actuels confirmés</p>}
                <button type="button" onClick={() => onClear(key)} disabled={saving} className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline disabled:opacity-50"><Eraser className="h-3 w-3" /> Effacer</button>
              </div>
            ) : (
              <p className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold leading-4 ${isStarted(decision) ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-stone-200 bg-stone-50 text-stone-500'}`}>
                {isStarted(decision) ? `Choisissez aussi ${decision?.pv1 ? 'le prix vente 2' : 'le prix vente'}.` : 'Aucun choix — cette ligne ne sera pas envoyée.'}
              </p>
            )}
          </div>
        )}
      </td>
    </tr>
  );
});
CorrectionRow.displayName = 'CorrectionRow';

const SalePriceCorrectionsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<CorrectionTab>('pending');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RowFilter>('all');
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [checkedKeys, setCheckedKeys] = useState<Record<string, true>>({});
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const rowElements = useRef(new Map<string, HTMLTableRowElement>());
  const focusedIndexRef = useRef(0);
  const lastCheckedIndex = useRef<number | null>(null);
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const limit = 30;

  useEffect(() => { const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300); return () => window.clearTimeout(timer); }, [search]);

  const { data, isLoading, isFetching, isError, error, refetch } = useGetSalePriceCorrectionsQuery({ page, limit, q: query || undefined, status: activeTab });
  const [applyCorrections, { isLoading: isApplying }] = useUpdateSalePriceCorrectionsMutation();
  const [resetCorrections, { isLoading: isResetting }] = useResetSalePriceCorrectionsMutation();
  const isSaving = isApplying || isResetting;
  const rows = useMemo(() => data?.data ?? [], [data]);
  const meta = data?.meta;
  const readOnly = activeTab === 'processed';

  // Aucune décision n'est pré-cochée : tout part de l'action explicite du PDG.
  const selectChoice = useCallback((key: string, side: Side, choice: Choice) => {
    setDecisions((previous) => ({ ...previous, [key]: { ...previous[key], [side]: choice } }));
  }, []);
  const keepBoth = useCallback((key: string) => {
    setDecisions((previous) => ({ ...previous, [key]: { pv1: KEEP, pv2: KEEP } }));
  }, []);
  const clearRow = useCallback((key: string) => {
    setDecisions((previous) => { if (!previous[key]) return previous; const next = { ...previous }; delete next[key]; return next; });
  }, []);
  const registerRow = useCallback((key: string, element: HTMLTableRowElement | null) => {
    if (element) rowElements.current.set(key, element); else rowElements.current.delete(key);
  }, []);
  const focusRow = useCallback((key: string) => setFocusedKey((current) => (current === key ? current : key)), []);

  const visibleRows = useMemo(() => {
    if (readOnly || filter === 'all') return rows;
    return rows.filter((row) => (filter === 'ready' ? isReady(decisions[rowKey(row)]) : !isReady(decisions[rowKey(row)])));
  }, [decisions, filter, readOnly, rows]);

  // Multi-sélection de l'onglet Traités : clic simple, ou Maj+clic pour une plage.
  const toggleCheck = useCallback((key: string, index: number, shiftKey: boolean) => {
    setCheckedKeys((previous) => {
      const turningOn = !previous[key];
      const anchor = shiftKey && lastCheckedIndex.current !== null ? lastCheckedIndex.current : index;
      const [start, end] = anchor <= index ? [anchor, index] : [index, anchor];
      const next = { ...previous };
      for (let cursor = start; cursor <= end; cursor += 1) {
        const target = visibleRows[cursor];
        if (!target) continue;
        if (turningOn) next[rowKey(target)] = true; else delete next[rowKey(target)];
      }
      return next;
    });
    lastCheckedIndex.current = index;
  }, [visibleRows]);

  const checkedRows = useMemo(() => rows.filter((row) => checkedKeys[rowKey(row)]), [checkedKeys, rows]);
  const allChecked = visibleRows.length > 0 && visibleRows.every((row) => checkedKeys[rowKey(row)]);
  const toggleCheckAll = useCallback(() => {
    lastCheckedIndex.current = null;
    setCheckedKeys((previous) => {
      const everySelected = visibleRows.length > 0 && visibleRows.every((row) => previous[rowKey(row)]);
      if (everySelected) return {};
      const next = { ...previous };
      for (const row of visibleRows) next[rowKey(row)] = true;
      return next;
    });
  }, [visibleRows]);

  useEffect(() => { setCheckedKeys({}); lastCheckedIndex.current = null; }, [activeTab, page, query]);
  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = checkedRows.length > 0 && !allChecked;
  }, [allChecked, checkedRows.length]);

  const readyRows = useMemo(
    () => rows.filter((row) => isReady(decisions[rowKey(row)])),
    [decisions, rows]
  );
  const changedCount = readyRows.filter((row) => {
    const decision = decisions[rowKey(row)];
    return !samePrice(resolvePrice(decision.pv1, row.current_prix_vente)!, row.current_prix_vente)
      || !samePrice(resolvePrice(decision.pv2, row.current_prix_vente_2)!, row.current_prix_vente_2);
  }).length;
  const startedCount = rows.filter((row) => isStarted(decisions[rowKey(row)])).length;
  const progress = rows.length ? Math.round((readyRows.length / rows.length) * 100) : 0;

  const fillMissing = useCallback((mode: 'keep' | 'suggest') => {
    setDecisions((previous) => {
      const next = { ...previous };
      for (const row of rows) {
        const key = rowKey(row);
        const current = next[key];
        if (isReady(current)) continue;
        next[key] = {
          pv1: current?.pv1 ?? (mode === 'suggest' && row.high_prices[0] ? { kind: 'price', value: row.high_prices[0].price } : KEEP),
          pv2: current?.pv2 ?? (mode === 'suggest' && row.low_prices[0] ? { kind: 'price', value: row.low_prices[0].price } : KEEP),
        };
      }
      return next;
    });
  }, [rows]);

  const clearPage = useCallback(() => {
    setDecisions((previous) => { const next = { ...previous }; for (const row of rows) delete next[rowKey(row)]; return next; });
  }, [rows]);

  // Aucune ligne n'est focalisée tant que l'utilisateur n'a rien fait ; on se contente de
  // garder le curseur clavier valide quand le filtre ou la page change la liste affichée.
  useEffect(() => {
    if (focusedKey === null) return;
    if (readOnly || !visibleRows.length) { setFocusedKey(null); return; }
    const index = visibleRows.findIndex((row) => rowKey(row) === focusedKey);
    if (index >= 0) { focusedIndexRef.current = index; return; }
    setFocusedKey(rowKey(visibleRows[Math.min(focusedIndexRef.current, visibleRows.length - 1)]));
  }, [focusedKey, readOnly, visibleRows]);

  useEffect(() => {
    if (!focusedKey) return;
    rowElements.current.get(focusedKey)?.scrollIntoView({ block: 'nearest' });
  }, [focusedKey]);

  useEffect(() => {
    if (readOnly || isSaving || !visibleRows.length) return;
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

      const currentIndex = visibleRows.findIndex((row) => rowKey(row) === focusedKey);
      const moveTo = (nextIndex: number) => setFocusedKey(rowKey(visibleRows[Math.min(visibleRows.length - 1, Math.max(0, nextIndex))]));

      // Première flèche : on pose le curseur sur la 1re ligne sans rien sélectionner.
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter') {
        event.preventDefault();
        moveTo(currentIndex < 0 ? 0 : event.key === 'ArrowUp' ? currentIndex - 1 : currentIndex + 1);
        return;
      }
      if (currentIndex < 0) return;
      const index = currentIndex;
      const row = visibleRows[index];
      const key = rowKey(row);
      if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); clearRow(key); return; }
      if (event.key === '0') { event.preventDefault(); keepBoth(key); moveTo(index + 1); return; }

      const pv1Index = PV1_KEYS.indexOf(event.key as (typeof PV1_KEYS)[number]);
      const pv2Index = PV2_KEYS.indexOf(event.key as (typeof PV2_KEYS)[number]);
      const side: Side | null = pv1Index >= 0 ? 'pv1' : pv2Index >= 0 ? 'pv2' : null;
      if (!side) return;
      const candidate = (side === 'pv1' ? row.high_prices : row.low_prices)[side === 'pv1' ? pv1Index : pv2Index];
      if (!candidate) return;
      event.preventDefault();
      selectChoice(key, side, { kind: 'price', value: candidate.price });
      const pending = decisions[key];
      if (side === 'pv1' ? pending?.pv2 : pending?.pv1) moveTo(index + 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [clearRow, decisions, focusedKey, isSaving, keepBoth, readOnly, selectChoice, visibleRows]);

  const resetView = (tab: CorrectionTab) => { setActiveTab(tab); setPage(1); setFilter('all'); setDecisions({}); setCheckedKeys({}); setFocusedKey(null); };

  const sendBackToPending = async () => {
    if (!checkedRows.length || isSaving) return;
    const confirmation = await showConfirmation(`${checkedRows.length} ligne(s) repasseront dans l’onglet « À corriger ». Les prix ne sont pas modifiés.`, 'Remettre à corriger ?');
    if (!confirmation.isConfirmed) return;
    try {
      const processed = checkedRows.length;
      await resetCorrections({ entities: checkedRows.map((row) => ({ product_id: row.product_id, variant_id: row.variant_id })) }).unwrap();
      setCheckedKeys({}); lastCheckedIndex.current = null;
      showSuccess(`${processed} ligne(s) remise(s) à corriger`);
      await refetch();
    } catch (resetError) {
      const apiError = resetError as { status?: number; data?: { message?: string } };
      showError(apiError.data?.message || 'Impossible de remettre ces lignes à corriger.', 'Échec de la remise à corriger');
    }
  };

  const sendBackButton = (compact?: boolean) => (
    <button
      type="button" onClick={() => void sendBackToPending()} disabled={!checkedRows.length || isSaving}
      className={`inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${compact ? 'h-10' : 'h-11'}`}
    >
      {isResetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Remettre à corriger {checkedRows.length ? `(${checkedRows.length})` : ''}
    </button>
  );

  const submit = async () => {
    if (!readyRows.length || isSaving) return;
    const confirmation = await showConfirmation(`${readyRows.length} ligne(s) décidée(s) seront traitée(s), dont ${changedCount} avec modification de prix.`, 'Corriger les prix de vente ?');
    if (!confirmation.isConfirmed) return;
    try {
      await applyCorrections({
        corrections: readyRows.map((row) => {
          const decision = decisions[rowKey(row)];
          const prixVente = resolvePrice(decision.pv1, row.current_prix_vente)!;
          const prixVente2 = resolvePrice(decision.pv2, row.current_prix_vente_2)!;
          const unchanged = samePrice(prixVente, row.current_prix_vente) && samePrice(prixVente2, row.current_prix_vente_2);
          return { product_id: row.product_id, variant_id: row.variant_id, action: unchanged ? 'confirm' as const : 'apply' as const, prix_vente: prixVente, prix_vente_2: prixVente2, expected_prix_vente: row.current_prix_vente, expected_prix_vente_2: row.current_prix_vente_2 };
        }),
      }).unwrap();
      const processed = readyRows.length;
      setDecisions({}); setFocusedKey(null);
      showSuccess(`${processed} ligne(s) traitée(s)`);
      await refetch();
    } catch (submitError) {
      const apiError = submitError as { status?: number; data?: { message?: string } };
      showError(apiError.data?.message || 'Impossible d’appliquer les corrections.', apiError.status === 409 ? 'Prix modifiés entre-temps' : 'Échec de la correction');
      if (apiError.status === 409) { setDecisions({}); await refetch(); }
    }
  };

  const submitButton = (compact?: boolean) => (
    <button
      type="button" onClick={() => void submit()} disabled={!readyRows.length || isSaving}
      className={`inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${compact ? 'h-10' : 'h-11'}`}
    >
      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Corriger {readyRows.length ? `(${readyRows.length})` : ''}
    </button>
  );

  return (
    <main className="min-h-full bg-stone-50 pb-40 lg:pb-12">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-[1800px] px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700"><CircleDollarSign className="h-4 w-4" /> Catalogue · aide à la décision</div>
              <h1 className="text-2xl font-bold tracking-tight text-stone-950">Assistant de correction des prix</h1>
              <p className="mt-1 max-w-3xl text-sm text-stone-500">Comparez les prix actuels aux ventes réellement pratiquées. Rien n’est présélectionné&nbsp;: chaque ligne n’est envoyée qu’après vos deux choix.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">{readOnly ? sendBackButton() : submitButton()}</div>
          </div>

          <div className="mt-5 flex flex-col gap-3 border-t border-stone-100 pt-4 md:flex-row md:items-center md:justify-between">
            <nav className="flex gap-1" aria-label="État des corrections">
              {([{ id: 'pending', label: 'À corriger' }, { id: 'processed', label: 'Traités' }] as const).map((tab) => (
                <button key={tab.id} type="button" onClick={() => resetView(tab.id)} className={`relative px-4 py-2 text-sm font-bold transition ${activeTab === tab.id ? 'text-stone-950' : 'text-stone-500 hover:text-stone-800'}`}>
                  {tab.label}{activeTab === tab.id ? <span className="absolute inset-x-2 -bottom-[17px] h-0.5 bg-emerald-600" /> : null}
                </button>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <label className="relative block w-full md:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ID, référence, produit, variante…" className="h-10 w-full rounded-lg border-stone-300 bg-stone-50 pl-9 pr-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-500 focus:ring-emerald-500" />
              </label>
              <button type="button" onClick={() => void refetch()} disabled={isFetching} aria-label="Actualiser" className="flex h-10 w-10 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-600 transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /></button>
            </div>
          </div>
        </div>
      </header>

      {!readOnly && rows.length > 0 ? (
        <div className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 shadow-sm backdrop-blur">
          <div className="mx-auto flex max-w-[1800px] flex-col gap-2.5 px-4 py-2.5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-28 overflow-hidden rounded-full bg-stone-200"><div className="h-full rounded-full bg-emerald-600 transition-[width] duration-200" style={{ width: `${progress}%` }} /></div>
                <span className="whitespace-nowrap text-sm font-bold tabular-nums text-stone-900">{readyRows.length}/{rows.length}</span>
                <span className="whitespace-nowrap text-xs text-stone-500">{changedCount} modif. · {startedCount - readyRows.length} incomplète(s)</span>
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-stone-100 p-0.5" role="group" aria-label="Filtrer les lignes">
                {([{ id: 'all', label: 'Toutes' }, { id: 'todo', label: 'À décider' }, { id: 'ready', label: 'Décidées' }] as const).map((chip) => (
                  <button key={chip.id} type="button" onClick={() => setFilter(chip.id)} className={`rounded-md px-2.5 py-1 text-xs font-bold transition ${filter === chip.id ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}>{chip.label}</button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => fillMissing('suggest')} disabled={isSaving} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-xs font-bold text-indigo-800 transition hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"><Wand2 className="h-3.5 w-3.5" /> Suggestions</button>
              <button type="button" onClick={() => fillMissing('keep')} disabled={isSaving} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-xs font-bold text-stone-700 transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Garder tout</button>
              <button type="button" onClick={clearPage} disabled={isSaving || !startedCount} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-xs font-bold text-stone-600 transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-40"><Eraser className="h-3.5 w-3.5" /> Effacer</button>
              <div className="hidden xl:block">{submitButton(true)}</div>
            </div>
          </div>
          <div className="mx-auto hidden max-w-[1800px] items-center gap-2 px-6 pb-2 text-[11px] text-stone-500 lg:flex">
            <span className="font-semibold uppercase tracking-wide text-stone-400">Clavier</span>
            <Kbd>↑</Kbd><Kbd>↓</Kbd> ligne · <Kbd>1</Kbd><Kbd>2</Kbd><Kbd>3</Kbd> prix vente · <Kbd>4</Kbd><Kbd>5</Kbd><Kbd>6</Kbd> prix vente 2 · <Kbd>0</Kbd> garder les 2 · <Kbd>⌫</Kbd> effacer
          </div>
        </div>
      ) : null}

      {readOnly && rows.length > 0 ? (
        <div className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 shadow-sm backdrop-blur">
          <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-700 transition hover:bg-stone-50">
                <input ref={selectAllRef} type="checkbox" checked={allChecked} onChange={toggleCheckAll} disabled={isSaving} className="h-4 w-4 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500" />
                Tout sélectionner
              </label>
              <span className="whitespace-nowrap text-sm font-bold tabular-nums text-stone-900">{checkedRows.length}/{rows.length} sélectionnée(s)</span>
              {checkedRows.length ? <button type="button" onClick={() => { setCheckedKeys({}); lastCheckedIndex.current = null; }} disabled={isSaving} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-xs font-bold text-stone-600 transition hover:bg-stone-50 disabled:opacity-40"><Eraser className="h-3.5 w-3.5" /> Désélectionner</button> : null}
              <span className="hidden text-[11px] text-stone-500 lg:inline"><Kbd>Maj</Kbd> + clic pour sélectionner une plage</span>
            </div>
            <div className="hidden xl:block">{sendBackButton(true)}</div>
          </div>
        </div>
      ) : null}

      <section className="mx-auto max-w-[1800px] px-4 py-5 sm:px-6">
        {isLoading ? (
          <div className="flex min-h-72 items-center justify-center rounded-xl border border-stone-200 bg-white text-sm font-medium text-stone-500"><Loader2 className="mr-2 h-5 w-5 animate-spin text-emerald-600" /> Chargement des prix et de l’historique…</div>
        ) : isError ? (
          <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-red-200 bg-white p-8 text-center">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h2 className="mt-3 font-bold text-stone-900">Impossible de charger les corrections</h2>
            <p className="mt-1 text-sm text-stone-500">{(error as { data?: { message?: string } })?.data?.message || 'Réessayez dans quelques instants.'}</p>
            <button type="button" onClick={() => void refetch()} className="mt-4 rounded-lg bg-stone-900 px-4 py-2 text-sm font-bold text-white">Réessayer</button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-stone-200 bg-white p-8 text-center">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" />
            <h2 className="mt-3 font-bold text-stone-900">{query ? 'Aucun résultat' : readOnly ? 'Aucune correction traitée' : 'Tout est traité'}</h2>
            <p className="mt-1 text-sm text-stone-500">{query ? 'Modifiez votre recherche pour retrouver un produit.' : readOnly ? 'Les décisions validées apparaîtront ici.' : 'Les produits corrigés se trouvent dans l’onglet Traités.'}</p>
          </div>
        ) : (
          <>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-stone-500 2xl:hidden"><ChevronRight className="h-3.5 w-3.5" /> Faites glisser le tableau horizontalement pour voir toutes les décisions.</p>
            <div className={`overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm transition-opacity ${isFetching ? 'opacity-70' : ''}`}>
              <table className="w-full min-w-[1240px] table-fixed border-collapse">
                <thead className="bg-stone-100/80 text-left text-[11px] font-bold uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="sticky left-0 z-20 w-[300px] border-b border-r border-stone-200 bg-stone-100 px-4 py-3 shadow-[3px_0_6px_-5px_rgba(0,0,0,0.45)]">
                      {readOnly ? (
                        <span className="flex items-center gap-2">
                          <input type="checkbox" checked={allChecked} onChange={toggleCheckAll} disabled={isSaving} aria-label="Tout sélectionner" className="h-4 w-4 cursor-pointer rounded border-stone-300 text-indigo-600 focus:ring-indigo-500" />
                          Produit / variante
                        </span>
                      ) : 'Produit / variante'}
                    </th>
                    <th className="w-[125px] border-b border-stone-200 px-3 py-3">Prix vente actuel</th>
                    <th className="w-[215px] border-b border-l border-indigo-100 bg-indigo-50/60 px-3 py-3 text-indigo-800">Choix prix vente <span className="font-medium normal-case text-indigo-500">· valeurs hautes</span></th>
                    <th className="w-[125px] border-b border-l border-stone-200 px-3 py-3">Prix vente 2 actuel</th>
                    <th className="w-[215px] border-b border-l border-amber-100 bg-amber-50/60 px-3 py-3 text-amber-800">Choix prix vente 2 <span className="font-medium normal-case text-amber-600">· valeurs basses</span></th>
                    <th className="w-[190px] border-b border-l border-stone-200 px-3 py-3">Décision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {visibleRows.map((row, index) => {
                    const key = rowKey(row);
                    return (
                      <CorrectionRow
                        key={key} row={row} index={index} decision={decisions[key]} focused={focusedKey === key}
                        checked={Boolean(checkedKeys[key])} readOnly={readOnly} saving={isSaving}
                        onSelect={selectChoice} onKeepBoth={keepBoth} onClear={clearRow} onFocus={focusRow}
                        onToggleCheck={toggleCheck} registerRow={registerRow}
                      />
                    );
                  })}
                </tbody>
              </table>
              {!visibleRows.length ? (
                <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                  <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                  <p className="text-sm font-bold text-stone-800">{filter === 'todo' ? 'Toutes les lignes de la page sont décidées.' : 'Aucune ligne décidée pour l’instant.'}</p>
                  <button type="button" onClick={() => setFilter('all')} className="text-xs font-bold text-emerald-700 underline-offset-2 hover:underline">Afficher toutes les lignes</button>
                </div>
              ) : null}
            </div>
          </>
        )}

        {meta && meta.totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-between text-sm text-stone-500">
            <span>{meta.total} entité(s) · page {meta.page} sur {meta.totalPages}</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1 || isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))} className="inline-flex h-9 items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 font-semibold text-stone-700 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Précédent</button>
              <button type="button" disabled={page >= meta.totalPages || isFetching} onClick={() => setPage((value) => value + 1)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 font-semibold text-stone-700 disabled:opacity-40">Suivant <ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        ) : null}
      </section>

      {rows.length > 0 ? (
        <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom)+0.75rem)] left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-xl xl:hidden">
          <span className="whitespace-nowrap text-xs font-bold tabular-nums text-stone-700">{readOnly ? `${checkedRows.length}/${rows.length} sélect.` : `${readyRows.length}/${rows.length} décidée(s)`}</span>
          {readOnly ? sendBackButton(true) : submitButton(true)}
        </div>
      ) : null}
    </main>
  );
};

export default SalePriceCorrectionsPage;
