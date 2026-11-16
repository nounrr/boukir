import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Columns3, Eye, EyeOff, Hand, RotateCcw, SlidersHorizontal, X } from 'lucide-react';

/**
 * Outils d'un tableau de données, sans toucher aux lignes existantes :
 *  - afficher / masquer chaque colonne et chaque filtre de la barre d'outils ;
 *  - largeur de chaque colonne (poignée sur l'en-tête, double-clic = largeur par défaut)
 *    et largeur globale de toutes les colonnes ;
 *  - densité des lignes ;
 *  - glisser le tableau à la souris pour voir les côtés (en plus de la barre de défilement).
 *
 * Les colonnes sont lues dans l'en-tête réellement affiché : les colonnes conditionnelles
 * (par onglet, par rôle) restent donc correctes. Les préférences sont mémorisées par
 * navigateur (localStorage).
 */

export type ToolkitFilter = { key: string; label: string };
type Density = 'compact' | 'normal' | 'comfortable';
type Prefs = {
  hidden: string[];
  widths: Record<string, number>;
  scale: number;
  hiddenFilters: string[];
  density: Density;
};

const DEFAULT_PREFS: Prefs = { hidden: [], widths: {}, scale: 100, hiddenFilters: [], density: 'normal' };
const MIN_WIDTH = 40;
const INTERACTIVE = 'button, a, input, select, textarea, label, option, summary, [role="button"], [contenteditable="true"], .tk-resizer, .tk-menu';

function readPrefs(key: string): Prefs {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return {
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((x: unknown) => typeof x === 'string') : [],
      widths: parsed.widths && typeof parsed.widths === 'object' ? parsed.widths : {},
      scale: Number.isFinite(parsed.scale) ? Math.min(200, Math.max(50, parsed.scale)) : 100,
      hiddenFilters: Array.isArray(parsed.hiddenFilters) ? parsed.hiddenFilters : [],
      density: ['compact', 'normal', 'comfortable'].includes(parsed.density) ? parsed.density : 'normal',
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function headerCells(container: HTMLElement | null): HTMLTableCellElement[] {
  const row = container?.querySelector('table > thead > tr:last-child');
  return row ? (Array.from(row.children) as HTMLTableCellElement[]) : [];
}

function labelOf(cell: HTMLTableCellElement, index: number): string {
  const text = (cell.textContent || '').replace(/\s+/g, ' ').trim();
  return text || `#${index + 1}`;
}

export function useTableToolkit({
  storageKey,
  filters = [],
  defaultWidths = {},
  fallbackWidth = 130,
}: {
  storageKey: string;
  filters?: ToolkitFilter[];
  defaultWidths?: Record<string, number>;
  fallbackWidth?: number;
}) {
  const prefsKey = `tableToolkit:${storageKey}`;
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs(prefsKey));
  const [labels, setLabels] = useState<string[]>([]);
  const [handles, setHandles] = useState<{ label: string; left: number; top: number; height: number }[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try { localStorage.setItem(prefsKey, JSON.stringify(prefs)); } catch { /* stockage indisponible */ }
  }, [prefs, prefsKey]);

  // --- Colonnes réellement affichées (relues quand l'en-tête change : onglet, rôle…)
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const read = () => {
      const next = headerCells(container).map(labelOf);
      setLabels((prev) => (prev.join('\u0001') === next.join('\u0001') ? prev : next));
    };
    read();
    const observer = new MutationObserver(read);
    const thead = container.querySelector('table > thead');
    if (thead) observer.observe(thead, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  });

  const hiddenSet = useMemo(() => new Set(prefs.hidden), [prefs.hidden]);
  const baseWidth = useCallback(
    (label: string) => prefs.widths[label] ?? defaultWidths[label] ?? (label.startsWith('#') ? 56 : fallbackWidth),
    [prefs.widths, defaultWidths, fallbackWidth],
  );
  const shownWidth = useCallback((label: string) => Math.round((baseWidth(label) * prefs.scale) / 100), [baseWidth, prefs.scale]);
  const visibleLabels = labels.filter((label) => !hiddenSet.has(label));
  const tableWidth = visibleLabels.reduce((sum, label) => sum + shownWidth(label), 0);

  // --- Poignées de redimensionnement positionnées sur les bords des en-têtes
  const measure = useCallback(() => {
    const container = containerRef.current;
    const table = container?.querySelector('table');
    if (!container || !table) return;
    const thead = table.querySelector('thead');
    const cells = headerCells(container);
    const next = cells
      .map((cell, index) => ({ cell, label: labelOf(cell, index) }))
      .filter(({ cell }) => cell.offsetParent !== null)
      .map(({ cell, label }) => ({
        label,
        left: table.offsetLeft + cell.offsetLeft + cell.offsetWidth - 5,
        top: table.offsetTop + (thead?.offsetTop ?? 0),
        height: thead?.offsetHeight ?? cell.offsetHeight,
      }));
    setHandles((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);

  useLayoutEffect(() => { measure(); }, [measure, labels, prefs]);
  useEffect(() => {
    const table = containerRef.current?.querySelector('table');
    if (!table || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => measure());
    observer.observe(table);
    return () => observer.disconnect();
  }, [measure, labels.length]);

  const startResize = (event: React.PointerEvent, label: string) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startShown = shownWidth(label);
    const scale = prefs.scale / 100;
    const onMove = (e: PointerEvent) => {
      const width = Math.max(MIN_WIDTH, startShown + e.clientX - startX) / scale;
      setPrefs((p) => ({ ...p, widths: { ...p.widths, [label]: Math.round(width) } }));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.classList.remove('tk-resizing');
    };
    document.body.classList.add('tk-resizing');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const resetWidth = (label: string) =>
    setPrefs((p) => {
      const widths = { ...p.widths };
      delete widths[label];
      return { ...p, widths };
    });

  // --- Glisser le tableau à la souris pour le faire défiler horizontalement
  const suppressClick = useRef(false);
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container || event.pointerType !== 'mouse' || event.button !== 0) return;
    if ((event.target as HTMLElement).closest(INTERACTIVE)) return;
    if (container.scrollWidth <= container.clientWidth) return;
    const startX = event.clientX;
    const startScroll = container.scrollLeft;
    let moved = false;
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) < 6) return;
      if (!moved) {
        moved = true;
        setDragging(true);
        window.getSelection()?.removeAllRanges();
      }
      container.scrollLeft = startScroll - dx;
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (moved) {
        suppressClick.current = true;
        setTimeout(() => { suppressClick.current = false; }, 0);
      }
      setDragging(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const onClickCapture = (event: React.MouseEvent) => {
    if (suppressClick.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  // --- Fermer le menu au clic extérieur / Échap
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const toggleColumn = (label: string) =>
    setPrefs((p) => {
      const hidden = p.hidden.includes(label) ? p.hidden.filter((x) => x !== label) : [...p.hidden, label];
      // On garde toujours au moins une colonne visible.
      return labels.every((l) => hidden.includes(l)) ? p : { ...p, hidden };
    });
  const toggleFilter = (key: string) =>
    setPrefs((p) => ({
      ...p,
      hiddenFilters: p.hiddenFilters.includes(key) ? p.hiddenFilters.filter((x) => x !== key) : [...p.hiddenFilters, key],
    }));

  // --- Règles CSS : colonnes masquées (par position courante) et filtres masqués
  const scope = storageKey.replace(/[^a-zA-Z0-9_-]/g, '');
  const css = useMemo(() => {
    const rules: string[] = [];
    labels.forEach((label, index) => {
      if (hiddenSet.has(label)) {
        rules.push(`[data-tk="${scope}"] table > thead > tr > :nth-child(${index + 1}), [data-tk="${scope}"] table > tbody > tr > :nth-child(${index + 1}):not([colspan]) { display: none; }`);
      }
    });
    prefs.hiddenFilters.forEach((key) => {
      rules.push(`[data-tk-filter="${scope}:${key.replace(/[^a-zA-Z0-9_-]/g, '')}"] { display: none !important; }`);
    });
    return rules.join('\n');
  }, [labels, hiddenSet, prefs.hiddenFilters, scope]);

  const colgroup = (
    <colgroup>
      {visibleLabels.map((label) => <col key={label} style={{ width: shownWidth(label) }} />)}
    </colgroup>
  );

  const containerProps = {
    ref: containerRef,
    'data-tk': scope,
    className: `tk-container tk-density-${prefs.density}${dragging ? ' tk-dragging' : ''}`,
    onPointerDown,
    onClickCapture,
  };

  const overlay = (
    <>
      <style>{css}</style>
      {handles.map((h) => (
        <div
          key={h.label}
          className="tk-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label={`Largeur de la colonne ${h.label}`}
          title="Glisser pour changer la largeur · double-clic pour revenir à la largeur par défaut"
          style={{ left: h.left, top: h.top, height: h.height }}
          onPointerDown={(e) => startResize(e, h.label)}
          onDoubleClick={() => resetWidth(h.label)}
        />
      ))}
    </>
  );

  const hiddenCount = labels.filter((l) => hiddenSet.has(l)).length + prefs.hiddenFilters.length;

  const menuButton = (
    <div className="tk-menu relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-expanded={menuOpen}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-gradient-to-r from-indigo-50 to-sky-50 px-3 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:shadow"
      >
        <SlidersHorizontal size={16} />
        Affichage
        {hiddenCount > 0 && (
          <span className="rounded-full bg-indigo-600 px-1.5 text-[11px] font-bold text-white">{hiddenCount} masqué{hiddenCount > 1 ? 's' : ''}</span>
        )}
      </button>
      {menuOpen && (
        <div role="dialog" aria-label="Affichage du tableau" className="absolute right-0 z-[60] mt-2 w-80 max-w-[90vw] rounded-xl border border-gray-200 bg-white p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900">Affichage du tableau</p>
            <button type="button" onClick={() => setMenuOpen(false)} aria-label="Fermer" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X size={16} /></button>
          </div>

          <div className="mb-1 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500"><Columns3 size={13} /> Colonnes</p>
            <button type="button" onClick={() => setPrefs((p) => ({ ...p, hidden: [] }))} className="text-xs font-semibold text-indigo-600 hover:underline">Tout afficher</button>
          </div>
          <div className="mb-4 grid max-h-52 grid-cols-2 gap-1 overflow-y-auto">
            {labels.map((label) => {
              const shown = !hiddenSet.has(label);
              return (
                <label key={label} className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs ${shown ? 'bg-indigo-50 text-indigo-900' : 'bg-gray-50 text-gray-400 line-through'}`}>
                  <input type="checkbox" checked={shown} onChange={() => toggleColumn(label)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  <span className="truncate">{label.startsWith('#') ? `Sélection ${label}` : label}</span>
                </label>
              );
            })}
          </div>

          {filters.length > 0 && (
            <>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-500">Filtres</p>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {filters.map((f) => {
                  const shown = !prefs.hiddenFilters.includes(f.key);
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => toggleFilter(f.key)}
                      aria-pressed={shown}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${shown ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-gray-200 bg-gray-50 text-gray-400'}`}
                    >
                      {shown ? <Eye size={12} /> : <EyeOff size={12} />}
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-500">Largeur de toutes les colonnes · {prefs.scale}%</p>
          <input
            type="range"
            min={50}
            max={200}
            step={5}
            value={prefs.scale}
            onChange={(e) => setPrefs((p) => ({ ...p, scale: Number(e.target.value) }))}
            className="mb-4 w-full accent-indigo-600"
            aria-label="Largeur de toutes les colonnes"
          />

          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-500">Densité des lignes</p>
          <div className="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1">
            {([['compact', 'Serrée'], ['normal', 'Normale'], ['comfortable', 'Aérée']] as [Density, string][]).map(([value, text]) => (
              <button
                key={value}
                type="button"
                onClick={() => setPrefs((p) => ({ ...p, density: value }))}
                className={`rounded-md py-1 text-xs font-semibold ${prefs.density === value ? 'bg-white text-indigo-700 shadow' : 'text-gray-500'}`}
              >
                {text}
              </button>
            ))}
          </div>

          <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-sky-50 p-2 text-[11px] text-sky-800">
            <Hand size={13} className="mt-0.5 flex-none" />
            Faites glisser le tableau avec la souris pour voir les côtés. Tirez le bord d'un en-tête pour changer sa largeur.
          </p>
          <button
            type="button"
            onClick={() => setPrefs(DEFAULT_PREFS)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            <RotateCcw size={14} /> Réinitialiser l'affichage
          </button>
        </div>
      )}
    </div>
  );

  /** Attribut à poser sur un filtre de la barre d'outils pour pouvoir le masquer. */
  const filterAttr = (key: string) => ({ 'data-tk-filter': `${scope}:${key.replace(/[^a-zA-Z0-9_-]/g, '')}` });

  return { containerProps, colgroup, overlay, menuButton, tableWidth, filterAttr };
}
