import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Box,
  LoaderCircle,
  PackageSearch,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/redux';
import {
  useSearchBonProductsQuery,
  useSearchProductsWithSnapshotsQuery,
} from '../store/api/productsApi';
import {
  buildStockSearchOptions,
  formatStockPrice,
  resolveStockDisplayPrices,
  type StockSearchOption,
} from '../utils/stockQuickSearch';

type TriggerPosition = { x: number; y: number };

const TRIGGER_SIZE = 56;
const TRIGGER_MARGIN = 8;
const POSITION_STORAGE_KEY = 'stock-quick-search-position';
const clampTriggerPosition = (position: TriggerPosition, width: number, height: number): TriggerPosition => ({
  x: Math.min(Math.max(TRIGGER_MARGIN, position.x), Math.max(TRIGGER_MARGIN, width - TRIGGER_SIZE - TRIGGER_MARGIN)),
  y: Math.min(Math.max(TRIGGER_MARGIN, position.y), Math.max(TRIGGER_MARGIN, height - TRIGGER_SIZE - TRIGGER_MARGIN)),
});

const StockQuickSearch: React.FC = () => {
  const { user } = useAuth();
  const isPDG = user?.role === 'PDG';
  const panelId = useId();
  const inputId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerPositionRef = useRef<TriggerPosition | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [triggerPosition, setTriggerPosition] = useState<TriggerPosition | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selected, setSelected] = useState<StockSearchOption | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const canSearch = isOpen && debouncedQuery.trim().length >= 2;
  const productsQuery = useSearchBonProductsQuery(
    { q: debouncedQuery.trim(), limit: 20 },
    { skip: !canSearch },
  );
  const snapshotsQuery = useSearchProductsWithSnapshotsQuery(
    { q: debouncedQuery.trim(), limit: 120 },
    { skip: !canSearch },
  );
  const options = useMemo(
    () => buildStockSearchOptions(productsQuery.data?.data ?? []),
    [productsQuery.data?.data],
  );
  const prices = useMemo(
    () => selected ? resolveStockDisplayPrices(selected, snapshotsQuery.data ?? []) : null,
    [selected, snapshotsQuery.data],
  );

  useEffect(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    setViewport({ width, height });

    let savedPosition: TriggerPosition | null = null;
    try {
      const stored = window.localStorage.getItem(POSITION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<TriggerPosition>;
        if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
          savedPosition = { x: Number(parsed.x), y: Number(parsed.y) };
        }
      }
    } catch {
      // Une préférence illisible ne doit jamais bloquer l'outil de stock.
    }

    const mobileBottomOffset = width < 768 ? 96 : 24;
    const initialPosition = clampTriggerPosition(
      savedPosition ?? { x: width - TRIGGER_SIZE - (width < 768 ? 16 : 24), y: height - TRIGGER_SIZE - mobileBottomOffset },
      width,
      height,
    );
    triggerPositionRef.current = initialPosition;
    setTriggerPosition(initialPosition);

    const onResize = () => {
      const nextViewport = { width: window.innerWidth, height: window.innerHeight };
      setViewport(nextViewport);
      if (!triggerPositionRef.current) return;
      const nextPosition = clampTriggerPosition(triggerPositionRef.current, nextViewport.width, nextViewport.height);
      triggerPositionRef.current = nextPosition;
      setTriggerPosition(nextPosition);
      try {
        window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(nextPosition));
      } catch {
        // Le déplacement reste utilisable même si le stockage local est indisponible.
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  useEffect(() => setActiveIndex(0), [debouncedQuery, options.length]);

  const close = () => {
    setIsOpen(false);
    setQuery('');
    setDebouncedQuery('');
    setSelected(null);
    setActiveIndex(0);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const selectOption = (option: StockSearchOption) => {
    setSelected(option);
    setQuery(option.variantName
      ? `${option.designation} — ${option.variantName}`
      : option.designation);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!options.length) return;
      setActiveIndex((current) => event.key === 'ArrowDown'
        ? (current + 1) % options.length
        : (current - 1 + options.length) % options.length);
    } else if (event.key === 'Enter' && options[activeIndex]) {
      event.preventDefault();
      selectOption(options[activeIndex]);
    }
  };

  const onTriggerPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !triggerPositionRef.current) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: triggerPositionRef.current.x,
      originY: triggerPositionRef.current.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onTriggerPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 5) return;
    drag.moved = true;
    setIsDragging(true);
    const nextPosition = clampTriggerPosition(
      { x: drag.originX + deltaX, y: drag.originY + deltaY },
      window.innerWidth,
      window.innerHeight,
    );
    triggerPositionRef.current = nextPosition;
    setTriggerPosition(nextPosition);
  };

  const finishTriggerDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.moved && triggerPositionRef.current) {
      suppressClickRef.current = true;
      try {
        window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(triggerPositionRef.current));
      } catch {
        // Le déplacement reste utilisable même si le stockage local est indisponible.
      }
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
    dragRef.current = null;
    setIsDragging(false);
  };

  const stockTone = selected && selected.stock <= 0
    ? 'border-amber-200 bg-amber-50 text-amber-800'
    : selected && selected.stock <= 5
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800';
  const alignPanelFromLeft = Boolean(triggerPosition && viewport.width && triggerPosition.x < viewport.width / 2);
  const openPanelDownward = Boolean(triggerPosition && viewport.height && triggerPosition.y < viewport.height / 2);

  return (
    <div
      ref={rootRef}
      className={triggerPosition ? 'fixed z-[60]' : 'fixed bottom-24 right-4 z-[60] md:bottom-6 md:right-6'}
      style={triggerPosition ? { left: triggerPosition.x, top: triggerPosition.y } : undefined}
    >
      {isOpen && (
        <section
          id={panelId}
          role="dialog"
          aria-label="Recherche rapide du stock"
          className={`fixed bottom-[5.75rem] left-3 right-3 flex max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20 md:absolute md:w-[420px] md:max-h-[min(680px,calc(100vh-7rem))] ${alignPanelFromLeft ? 'md:left-0 md:right-auto' : 'md:left-auto md:right-0'} ${openPanelDownward ? 'md:bottom-auto md:top-[4.25rem]' : 'md:bottom-[4.25rem] md:top-auto'}`}
        >
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Stock express</p>
              <p className="text-xs text-slate-500">Prix catalogue et disponibilité</p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Fermer la recherche rapide"
              className="grid min-h-11 min-w-11 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 motion-reduce:transition-none"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="border-b border-slate-100 p-3">
            <label htmlFor={inputId} className="sr-only">Produit, référence ou variante</label>
            <div className="relative">
              {productsQuery.isFetching
                ? <LoaderCircle className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-blue-600 motion-reduce:animate-none" />
                : <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
              <input
                ref={inputRef}
                id={inputId}
                type="search"
                value={query}
                role="combobox"
                aria-expanded={canSearch && options.length > 0}
                aria-controls={`${panelId}-results`}
                aria-activedescendant={options[activeIndex] ? `${panelId}-option-${activeIndex}` : undefined}
                autoComplete="off"
                placeholder="ID, référence, désignation…"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelected(null);
                }}
                onKeyDown={onInputKeyDown}
                className="h-11 w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </div>
            {query.trim().length < 2 && (
              <p className="mt-2 text-xs text-slate-500">Saisissez au moins 2 caractères.</p>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {canSearch && productsQuery.isError && (
              <div className="flex flex-col items-center px-5 py-8 text-center">
                <AlertTriangle className="mb-2 h-6 w-6 text-amber-600" />
                <p className="text-sm font-medium text-slate-800">Recherche indisponible</p>
                <button
                  type="button"
                  onClick={() => productsQuery.refetch()}
                  className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <RefreshCw className="h-4 w-4" /> Réessayer
                </button>
              </div>
            )}

            {canSearch && !productsQuery.isFetching && !productsQuery.isError && options.length === 0 && (
              <div className="px-5 py-8 text-center">
                <Box className="mx-auto mb-2 h-7 w-7 text-slate-300" />
                <p className="text-sm font-medium text-slate-700">Aucun produit trouvé</p>
                <p className="mt-1 text-xs text-slate-500">Essayez une autre référence ou désignation.</p>
              </div>
            )}

            {canSearch && !productsQuery.isError && options.length > 0 && !selected && (
              <ul id={`${panelId}-results`} role="listbox" aria-label="Résultats produits" className="divide-y divide-slate-100 p-1.5">
                {options.map((option, index) => {
                  const lowStock = option.stock <= 5;
                  return (
                    <li
                      id={`${panelId}-option-${index}`}
                      key={option.key}
                      role="option"
                      aria-selected={index === activeIndex}
                    >
                      <button
                        type="button"
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => selectOption(option)}
                        className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left outline-none transition motion-reduce:transition-none ${index === activeIndex ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-slate-50 focus:bg-blue-50'}`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900">{option.designation}</span>
                          <span className="mt-0.5 block truncate text-xs text-slate-500">
                            Réf. {option.reference || option.productId}
                            {option.variantName && <> · {option.variantName}</>}
                            {option.variantReference && <> ({option.variantReference})</>}
                          </span>
                        </span>
                        <span className={`shrink-0 rounded-lg border px-2 py-1 text-xs font-bold tabular-nums ${lowStock ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                          {new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(option.stock)} {option.baseUnit}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {selected && prices && (
              <article className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Réf. {selected.reference || selected.productId}</p>
                    <h2 className="mt-0.5 text-base font-bold leading-snug text-slate-950">{selected.designation}</h2>
                    {selected.variantName && (
                      <p className="mt-1 text-sm text-slate-600">{selected.variantName}{selected.variantReference ? ` · ${selected.variantReference}` : ''}</p>
                    )}
                  </div>
                  <div className={`shrink-0 rounded-xl border px-3 py-2 text-right ${stockTone}`}>
                    <p className="text-[10px] font-bold uppercase tracking-wide">Stock</p>
                    <p className="text-lg font-black tabular-nums">
                      {new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(selected.stock)}
                      <span className="ml-1 text-xs font-semibold">{selected.baseUnit}</span>
                    </p>
                  </div>
                </div>

                {snapshotsQuery.isFetching ? (
                  <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">
                    <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Actualisation des prix…
                  </div>
                ) : (
                  <dl className={`mt-4 grid overflow-hidden rounded-xl border border-slate-200 bg-slate-50 ${isPDG ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}>
                    {isPDG && (
                      <>
                        <div className="border-b border-r border-slate-200 p-3 sm:border-b-0">
                          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">PA</dt>
                          <dd className="mt-1 text-sm font-bold tabular-nums text-slate-900">{formatStockPrice(prices.prixAchat)}</dd>
                        </div>
                        <div className="border-b border-slate-200 p-3 sm:border-b-0 sm:border-r">
                          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">CR</dt>
                          <dd className="mt-1 text-sm font-bold tabular-nums text-slate-900">{formatStockPrice(prices.coutRevient)}</dd>
                        </div>
                      </>
                    )}
                    <div className="border-r border-slate-200 p-3">
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-blue-600">PV</dt>
                      <dd className="mt-1 text-sm font-extrabold tabular-nums text-blue-700">{formatStockPrice(prices.prixVente)}</dd>
                    </div>
                    <div className="p-3">
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">PV2</dt>
                      <dd className="mt-1 text-sm font-bold tabular-nums text-slate-900">{formatStockPrice(prices.prixVente2)}</dd>
                    </div>
                  </dl>
                )}

                {isPDG && (
                  <div className="mt-2 flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs">
                    <span className="font-medium text-slate-500">Prix gros</span>
                    <span className="font-bold tabular-nums text-slate-800">{formatStockPrice(prices.prixGros)}</span>
                  </div>
                )}

                {Array.isArray(selected.product.units) && selected.product.units.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Unités & conditionnements</p>
                    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                      {selected.product.units.map((unit: any) => (
                        <div key={unit.id ?? unit.unit_name} className="flex min-h-11 items-center justify-between gap-3 px-3 py-2 text-sm">
                          <span className="font-medium text-slate-700">{unit.unit_name}{unit.is_default ? ' · base' : ''}</span>
                          <span className="text-right text-xs text-slate-500">
                            × {new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(Number(unit.conversion_factor || 1))}
                            {Number(unit.facteur_isNormal) === 0 && Number(unit.prix_vente) > 0
                              ? ` · PV ${formatStockPrice(Number(unit.prix_vente))}`
                              : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setQuery('');
                    setDebouncedQuery('');
                    window.requestAnimationFrame(() => inputRef.current?.focus());
                  }}
                  className="mt-4 min-h-11 w-full rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 motion-reduce:transition-none"
                >
                  Rechercher un autre produit
                </button>
              </article>
            )}
          </div>
        </section>
      )}

      <button
        ref={triggerRef}
        type="button"
        aria-label="Recherche rapide du stock"
        title="Recherche rapide du stock"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onPointerDown={onTriggerPointerDown}
        onPointerMove={onTriggerPointerMove}
        onPointerUp={finishTriggerDrag}
        onPointerCancel={finishTriggerDrag}
        onClick={() => {
          if (suppressClickRef.current) return;
          if (isOpen) close(); else setIsOpen(true);
        }}
        className={`group grid h-14 w-14 touch-none select-none place-items-center rounded-full border-2 border-white bg-blue-600 text-white shadow-lg shadow-blue-900/25 outline-none transition hover:bg-blue-700 hover:shadow-xl focus:ring-4 focus:ring-blue-200 motion-reduce:transform-none motion-reduce:transition-none ${isDragging ? 'cursor-grabbing scale-105 shadow-xl' : 'cursor-grab hover:-translate-y-0.5 active:translate-y-0 active:scale-95'} ${isOpen ? 'rotate-0 bg-slate-800 hover:bg-slate-900' : ''}`}
      >
        {isOpen ? <X className="h-6 w-6" /> : <PackageSearch className="h-6 w-6" />}
      </button>
    </div>
  );
};

export default StockQuickSearch;
