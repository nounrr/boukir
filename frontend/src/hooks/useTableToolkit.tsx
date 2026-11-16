import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Columns3, Eye, EyeOff, Hand, Lock, RotateCcw, Ruler, Search, SlidersHorizontal, X } from 'lucide-react';

/**
 * Outils d'un tableau de données, sans toucher aux lignes existantes :
 *  - afficher / masquer chaque colonne (recherche par nom) et chaque filtre de la barre d'outils ;
 *  - largeur de chaque colonne (poignée sur l'en-tête, double-clic = ajuster au contenu),
 *    ajustement de toutes les colonnes, largeur globale ;
 *  - densité, séparateurs verticaux, en-tête collant ;
 *  - glisser le tableau à la souris pour voir les côtés (désactivable).
 *
 * Les colonnes sont lues dans l'en-tête réellement affiché : les colonnes conditionnelles
 * (par onglet, par rôle) restent alignées. Préférences mémorisées par navigateur et par
 * clé (une clé par type de document), indépendantes des données métier.
 */

export type ToolkitFilter = { key: string; label: string };
type Density = 'compact' | 'normal' | 'comfortable';
export type TablePrefs = {
  hidden: string[];
  widths: Record<string, number>;
  scale: number;
  hiddenFilters: string[];
  density: Density;
  grid: boolean;
  pan: boolean;
  sticky: boolean;
};

const DEFAULT_PREFS: TablePrefs = { hidden: [], widths: {}, scale: 100, hiddenFilters: [], density: 'normal', grid: false, pan: true, sticky: true };
const MIN_WIDTH = 40;
const MAX_AUTO_WIDTH = 520;
const INTERACTIVE = 'button, a, input, select, textarea, label, option, summary, [role="button"], [role="checkbox"], [contenteditable="true"], .tk-resizer, .tk-menu';

function sanitize(parsed: any): TablePrefs {
  return {
    hidden: Array.isArray(parsed?.hidden) ? parsed.hidden.filter((x: unknown) => typeof x === 'string') : [],
    widths: parsed?.widths && typeof parsed.widths === 'object' ? parsed.widths : {},
    scale: Number.isFinite(parsed?.scale) ? Math.min(200, Math.max(50, parsed.scale)) : 100,
    hiddenFilters: Array.isArray(parsed?.hiddenFilters) ? parsed.hiddenFilters : [],
    density: ['compact', 'normal', 'comfortable'].includes(parsed?.density) ? parsed.density : 'normal',
    grid: parsed?.grid === true,
    pan: parsed?.pan !== false,
    sticky: parsed?.sticky !== false,
  };
}

function readPrefs(key: string, fallbackKey?: string): TablePrefs {
  try {
    const raw = localStorage.getItem(key) ?? (fallbackKey ? localStorage.getItem(fallbackKey) : null);
    return raw ? sanitize(JSON.parse(raw)) : DEFAULT_PREFS;
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
  legacyStorageKey,
  filters = [],
  defaultWidths = {},
  fallbackWidth = 130,
  lockedColumns = [],
}: {
  storageKey: string;
  /** Ancienne clé : reprise des réglages au premier passage sur une nouvelle clé. */
  legacyStorageKey?: string;
  filters?: ToolkitFilter[];
  defaultWidths?: Record<string, number>;
  fallbackWidth?: number;
  /** Colonnes qu'on ne peut pas masquer (ex. Actions). */
  lockedColumns?: string[];
}) {
  const prefsKey = `tableToolkit:${storageKey}`;
  const legacyKey = legacyStorageKey ? `tableToolkit:${legacyStorageKey}` : undefined;

  // Réglages liés à la clé courante : changer de type de document recharge ses propres réglages.
  const [store, setStore] = useState(() => ({ key: prefsKey, prefs: readPrefs(prefsKey, legacyKey) }));
  let prefs = store.prefs;
  if (store.key !== prefsKey) {
    prefs = readPrefs(prefsKey, legacyKey);
    setStore({ key: prefsKey, prefs });
  }
  const setPrefs = useCallback((update: TablePrefs | ((p: TablePrefs) => TablePrefs)) => {
    setStore((s) => ({ key: s.key, prefs: typeof update === 'function' ? update(s.prefs) : update }));
  }, []);

  // Enregistrement différé (évite d'écrire à chaque pixel pendant un redimensionnement).
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(store.key, JSON.stringify(store.prefs)); } catch { /* stockage indisponible */ }
    }, 250);
    return () => clearTimeout(t);
  }, [store]);

  const [labels, setLabels] = useState<string[]>([]);
  const [handles, setHandles] = useState<{ label: string; left: number; top: number; height: number }[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [columnQuery, setColumnQuery] = useState('');
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const locked = useMemo(() => new Set(lockedColumns), [lockedColumns]);

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

  const hiddenSet = useMemo(() => new Set(prefs.hidden.filter((l) => !locked.has(l))), [prefs.hidden, locked]);
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
    const next = headerCells(container)
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
    let frame = 0;
    let lastX = startX;
    const apply = () => {
      frame = 0;
      const width = Math.max(MIN_WIDTH, startShown + lastX - startX) / scale;
      setPrefs((p) => ({ ...p, widths: { ...p.widths, [label]: Math.round(width) } }));
    };
    const onMove = (e: PointerEvent) => {
      lastX = e.clientX;
      if (!frame) frame = requestAnimationFrame(apply); // une mise à jour par image, pas de saccades
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (frame) cancelAnimationFrame(frame);
      document.body.classList.remove('tk-resizing');
    };
    document.body.classList.add('tk-resizing');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /** Largeur nécessaire au contenu des colonnes (mesure ponctuelle, sans retour à la ligne). */
  const fitWidths = useCallback((only?: string) => {
    const container = containerRef.current;
    const table = container?.querySelector('table');
    if (!container || !table) return;
    const header = headerCells(container);
    const targets = header
      .map((cell, index) => ({ index, label: labelOf(cell, index), cell }))
      .filter(({ label, cell }) => cell.offsetParent !== null && (!only || label === only) && !label.startsWith('#'));
    table.classList.add('tk-measure');
    const scale = prefs.scale / 100;
    const next: Record<string, number> = {};
    for (const { index, label, cell } of targets) {
      let widest = cell.scrollWidth;
      table.querySelectorAll(`tbody > tr > :nth-child(${index + 1}):not([colspan])`).forEach((td) => {
        widest = Math.max(widest, (td as HTMLElement).scrollWidth);
      });
      next[label] = Math.round(Math.min(MAX_AUTO_WIDTH, Math.max(MIN_WIDTH + 20, widest + 28)) / scale);
    }
    table.classList.remove('tk-measure');
    setPrefs((p) => ({ ...p, widths: { ...p.widths, ...next } }));
  }, [prefs.scale, setPrefs]);

  // --- Glisser le tableau à la souris pour le faire défiler horizontalement
  const suppressClick = useRef(false);
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!prefs.pan || !container || event.pointerType !== 'mouse' || event.button !== 0) return;
    if ((event.target as HTMLElement).closest(INTERACTIVE)) return;
    if (container.scrollWidth <= container.clientWidth) return;
    const startX = event.clientX;
    const startScroll = container.scrollLeft;
    let moved = false;
    let frame = 0;
    let dx = 0;
    const onMove = (e: PointerEvent) => {
      dx = e.clientX - startX;
      // Seuil : un simple clic ou une sélection de texte ne déclenche pas le glisser.
      if (!moved && Math.abs(dx) < 6) return;
      if (!moved) {
        moved = true;
        setDragging(true);
        window.getSelection()?.removeAllRanges();
      }
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; container.scrollLeft = startScroll - dx; });
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
      if (locked.has(label)) return p;
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
  const filterScope = (legacyStorageKey || storageKey).replace(/[^a-zA-Z0-9_-]/g, '');
  const css = useMemo(() => {
    const rules: string[] = [];
    labels.forEach((label, index) => {
      if (hiddenSet.has(label)) {
        rules.push(`[data-tk="${scope}"] table > thead > tr > :nth-child(${index + 1}), [data-tk="${scope}"] table > tbody > tr > :nth-child(${index + 1}):not([colspan]) { display: none; }`);
      }
    });
    prefs.hiddenFilters.forEach((key) => {
      rules.push(`[data-tk-filter="${filterScope}:${key.replace(/[^a-zA-Z0-9_-]/g, '')}"] { display: none !important; }`);
    });
    return rules.join('\n');
  }, [labels, hiddenSet, prefs.hiddenFilters, scope, filterScope]);

  const colgroup = (
    <colgroup>
      {visibleLabels.map((label) => <col key={label} style={{ width: shownWidth(label) }} />)}
    </colgroup>
  );

  const containerProps = {
    ref: containerRef,
    'data-tk': scope,
    className: [
      'tk-container',
      `tk-density-${prefs.density}`,
      prefs.grid ? 'tk-grid' : '',
      prefs.pan ? 'tk-pan' : '',
      prefs.sticky ? '' : 'tk-no-sticky',
      dragging ? 'tk-dragging' : '',
    ].filter(Boolean).join(' '),
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
          title="Glisser pour changer la largeur · double-clic pour ajuster au contenu"
          style={{ left: h.left, top: h.top, height: h.height }}
          onPointerDown={(e) => startResize(e, h.label)}
          onDoubleClick={() => fitWidths(h.label)}
        />
      ))}
    </>
  );

  const hiddenCount = labels.filter((l) => hiddenSet.has(l)).length + prefs.hiddenFilters.length;
  const shownColumns = labels.filter((l) => l.toLocaleLowerCase('fr').includes(columnQuery.trim().toLocaleLowerCase('fr')));

  const Switch = ({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) => (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1 text-xs text-gray-700">
      {label}
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={onChange} className={`tk-switch ${checked ? 'is-on' : ''}`}>
        <span />
      </button>
    </label>
  );

  const menuButton = (
    <div className="tk-menu relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-expanded={menuOpen}
        aria-haspopup="dialog"
        className="ap-btn ap-btn-secondary"
      >
        <SlidersHorizontal size={16} />
        Affichage
        {hiddenCount > 0 && <span className="ap-count">{hiddenCount}</span>}
      </button>
      {menuOpen && (
        <div role="dialog" aria-label="Affichage du tableau" className="ap-popover absolute right-0 z-[60] mt-2 w-[340px] max-w-[92vw] p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">Affichage du tableau</p>
            <button type="button" onClick={() => setMenuOpen(false)} aria-label="Fermer" className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X size={16} /></button>
          </div>

          <div className="mb-1.5 flex items-center justify-between">
            <p className="ap-section-title"><Columns3 size={13} /> Colonnes</p>
            <button type="button" onClick={() => setPrefs((p) => ({ ...p, hidden: [] }))} className="text-xs font-semibold text-blue-600 hover:underline">Tout afficher</button>
          </div>
          <div className="relative mb-2">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={columnQuery}
              onChange={(e) => setColumnQuery(e.target.value)}
              placeholder="Rechercher une colonne…"
              aria-label="Rechercher une colonne"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-2 text-xs"
            />
          </div>
          <div className="mb-4 grid max-h-48 grid-cols-2 gap-1 overflow-y-auto">
            {shownColumns.map((label) => {
              const isLocked = locked.has(label);
              const shown = !hiddenSet.has(label);
              return (
                <label key={label} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${isLocked ? 'cursor-default bg-gray-50 text-gray-500' : 'cursor-pointer'} ${shown && !isLocked ? 'bg-blue-50/70 text-gray-900' : ''} ${!shown ? 'bg-gray-50 text-gray-400' : ''}`}>
                  <input type="checkbox" checked={shown} disabled={isLocked} onChange={() => toggleColumn(label)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="truncate">{label.startsWith('#') ? `Sélection ${label}` : label}</span>
                  {isLocked && <Lock size={11} className="ml-auto flex-none" aria-label="Toujours visible" />}
                </label>
              );
            })}
            {shownColumns.length === 0 && <p className="col-span-2 py-2 text-center text-xs text-gray-400">Aucune colonne.</p>}
          </div>

          {filters.length > 0 && (
            <>
              <p className="ap-section-title mb-1.5">Filtres de la barre d'outils</p>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {filters.map((f) => {
                  const shown = !prefs.hiddenFilters.includes(f.key);
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => toggleFilter(f.key)}
                      aria-pressed={shown}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition ${shown ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-gray-200 bg-gray-50 text-gray-400'}`}
                    >
                      {shown ? <Eye size={12} /> : <EyeOff size={12} />}
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <p className="ap-section-title mb-1.5"><Ruler size={13} /> Largeurs · {prefs.scale}%</p>
          <input
            type="range"
            min={50}
            max={200}
            step={5}
            value={prefs.scale}
            onChange={(e) => setPrefs((p) => ({ ...p, scale: Number(e.target.value) }))}
            className="mb-2 w-full accent-blue-600"
            aria-label="Largeur de toutes les colonnes"
          />
          <div className="mb-4 grid grid-cols-2 gap-1.5">
            <button type="button" onClick={() => fitWidths()} className="ap-btn ap-btn-secondary justify-center !py-1.5 text-xs">Ajuster au contenu</button>
            <button type="button" onClick={() => setPrefs((p) => ({ ...p, widths: {}, scale: 100 }))} className="ap-btn ap-btn-secondary justify-center !py-1.5 text-xs">Largeurs par défaut</button>
          </div>

          <p className="ap-section-title mb-1.5">Densité</p>
          <div className="ap-segmented mb-3 grid grid-cols-3">
            {([['compact', 'Compacte'], ['normal', 'Standard'], ['comfortable', 'Confortable']] as [Density, string][]).map(([value, text]) => (
              <button key={value} type="button" aria-pressed={prefs.density === value} onClick={() => setPrefs((p) => ({ ...p, density: value }))}>
                {text}
              </button>
            ))}
          </div>

          <div className="mb-3 divide-y divide-gray-100 rounded-xl border border-gray-100 px-3 py-1">
            <Switch label="Séparateurs de colonnes" checked={prefs.grid} onChange={() => setPrefs((p) => ({ ...p, grid: !p.grid }))} />
            <Switch label="Glisser pour défiler" checked={prefs.pan} onChange={() => setPrefs((p) => ({ ...p, pan: !p.pan }))} />
            <Switch label="En-tête fixe" checked={prefs.sticky} onChange={() => setPrefs((p) => ({ ...p, sticky: !p.sticky }))} />
          </div>

          <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-blue-50 p-2 text-[11px] text-blue-800">
            <Hand size={13} className="mt-0.5 flex-none" />
            Glissez le tableau avec la souris pour voir les côtés. Tirez le bord d'un en-tête pour changer sa largeur ; double-clic pour l'ajuster au contenu.
          </p>
          <button
            type="button"
            onClick={() => setPrefs(DEFAULT_PREFS)}
            className="ap-btn ap-btn-secondary w-full justify-center text-xs"
          >
            <RotateCcw size={14} /> Réinitialiser l'affichage
          </button>
        </div>
      )}
    </div>
  );

  /** Attribut à poser sur un filtre de la barre d'outils pour pouvoir le masquer. */
  const filterAttr = (key: string) => ({ 'data-tk-filter': `${filterScope}:${key.replace(/[^a-zA-Z0-9_-]/g, '')}` });

  return { containerProps, colgroup, overlay, menuButton, tableWidth, filterAttr, prefs, setPrefs };
}
