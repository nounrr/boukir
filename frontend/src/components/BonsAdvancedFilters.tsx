import { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, CalendarRange, Check, Coins, Filter, ListFilter, Save, Trash2, X } from 'lucide-react';

/**
 * Filtres avancés de la page Bons (popover « Filtres avancés ») et pastilles des filtres actifs.
 *
 * Tous les filtres sont appliqués par le serveur (liste paginée) : rien n'est téléchargé en plus.
 *  - statut : le même filtre que la liste « Statut » de la barre d'outils ;
 *  - période de création (du / au) et montant min / max : paramètres dateFrom, dateTo, amountMin, amountMax ;
 *  - tri.
 * Les « vues » enregistrent filtres + affichage du tableau pour cet utilisateur, sur ce navigateur.
 */

export type AdvancedFilters = { dateFrom: string; dateTo: string; amountMin: string; amountMax: string };
export const EMPTY_ADVANCED: AdvancedFilters = { dateFrom: '', dateTo: '', amountMin: '', amountMax: '' };

export type FilterState = {
  search: string;
  statuses: string[];
  advanced: AdvancedFilters;
  sortField: 'numero' | 'date' | 'contact' | 'montant' | null;
  sortDirection: 'asc' | 'desc';
};

type SavedView = { id: string; name: string; filters: FilterState; table?: unknown; at: number };

const STATUSES = ['En attente', 'Validé', 'Refusé', 'Annulé'];
const SORTS: { value: FilterState['sortField']; label: string }[] = [
  { value: 'numero', label: 'Numéro' },
  { value: 'date', label: 'Date' },
  { value: 'contact', label: 'Contact' },
  { value: 'montant', label: 'Montant' },
];

const fmtDay = (iso: string) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR') : '');
const fmtAmount = (v: string) => `${Number(v.replace(',', '.')).toLocaleString('fr-FR')} DH`;

export function advancedCount(state: FilterState): number {
  const a = state.advanced;
  return (state.search ? 1 : 0) + (state.statuses.length ? 1 : 0) + ((a.dateFrom || a.dateTo) ? 1 : 0) + ((a.amountMin || a.amountMax) ? 1 : 0);
}

function readViews(key: string): SavedView[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed.filter((v) => v && typeof v.name === 'string' && v.filters) : [];
  } catch {
    return [];
  }
}

export function BonsAdvancedFilters({
  state,
  onApply,
  storageKey,
  tableSnapshot,
  onRestoreTable,
  amountSupported = true,
}: {
  state: FilterState;
  onApply: (next: FilterState) => void;
  /** Clé de stockage des vues (inclut l'utilisateur et le type de document). */
  storageKey: string;
  tableSnapshot?: () => unknown;
  onRestoreTable?: (table: any) => void;
  /** Le e-commerce ne gère pas période / montant côté serveur. */
  amountSupported?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterState>(state);
  const [views, setViews] = useState<SavedView[]>(() => readViews(storageKey));
  const [viewName, setViewName] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setViews(readViews(storageKey)); }, [storageKey]);
  useEffect(() => { if (open) setDraft(state); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const persistViews = (next: SavedView[]) => {
    setViews(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* stockage indisponible */ }
  };

  const count = advancedCount(state);
  const setAdv = (patch: Partial<AdvancedFilters>) => setDraft((d) => ({ ...d, advanced: { ...d.advanced, ...patch } }));
  const toggleStatus = (s: string) =>
    setDraft((d) => ({ ...d, statuses: d.statuses.includes(s) ? d.statuses.filter((x) => x !== s) : [...d.statuses, s] }));
  const apply = () => { onApply(draft); setOpen(false); };
  const clearAll = () => {
    const cleared: FilterState = { ...draft, search: '', statuses: [], advanced: EMPTY_ADVANCED };
    setDraft(cleared);
    onApply(cleared);
  };

  const saveView = () => {
    const name = viewName.trim();
    if (!name) return;
    const view: SavedView = { id: `${Date.now()}`, name, filters: draft, table: tableSnapshot?.(), at: Date.now() };
    persistViews([view, ...views.filter((v) => v.name.toLocaleLowerCase('fr') !== name.toLocaleLowerCase('fr'))].slice(0, 12));
    setViewName('');
  };
  const applyView = (view: SavedView) => {
    onApply({ ...view.filters, advanced: { ...EMPTY_ADVANCED, ...view.filters.advanced } });
    if (view.table && onRestoreTable) onRestoreTable(view.table);
    setOpen(false);
  };

  return (
    <div className="tk-menu relative" ref={ref}>
      <button type="button" className="ap-btn ap-btn-secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog">
        <ListFilter size={16} />
        Filtres avancés
        {count > 0 && <span className="ap-count">{count}</span>}
      </button>

      {open && (
        <div role="dialog" aria-label="Filtres avancés" className="ap-popover absolute right-0 z-[60] mt-2 w-[380px] max-w-[94vw] p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Filter size={15} /> Filtres avancés</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X size={16} /></button>
          </div>

          <p className="ap-section-title mb-1.5">Statut</p>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {STATUSES.map((s) => {
              const on = draft.statuses.includes(s);
              return (
                <button key={s} type="button" aria-pressed={on} onClick={() => toggleStatus(s)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition ${on ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {on && <Check size={12} />}{s}
                </button>
              );
            })}
          </div>

          {amountSupported ? (
            <>
              <p className="ap-section-title mb-1.5"><CalendarRange size={13} /> Date de création</p>
              <div className="mb-4 grid grid-cols-2 gap-2">
                <label className="text-[11px] text-gray-500">Du
                  <input type="date" value={draft.advanced.dateFrom} max={draft.advanced.dateTo || undefined} onChange={(e) => setAdv({ dateFrom: e.target.value })} className="mt-0.5 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs" />
                </label>
                <label className="text-[11px] text-gray-500">Au
                  <input type="date" value={draft.advanced.dateTo} min={draft.advanced.dateFrom || undefined} onChange={(e) => setAdv({ dateTo: e.target.value })} className="mt-0.5 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs" />
                </label>
              </div>

              <p className="ap-section-title mb-1.5"><Coins size={13} /> Montant (DH)</p>
              <div className="mb-4 grid grid-cols-2 gap-2">
                <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="Minimum" value={draft.advanced.amountMin} onChange={(e) => setAdv({ amountMin: e.target.value })} aria-label="Montant minimum" className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs" />
                <input type="number" min={0} step="0.01" inputMode="decimal" placeholder="Maximum" value={draft.advanced.amountMax} onChange={(e) => setAdv({ amountMax: e.target.value })} aria-label="Montant maximum" className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs" />
              </div>
            </>
          ) : (
            <p className="mb-4 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800">La période et le montant ne sont pas disponibles pour ce type de document.</p>
          )}

          <p className="ap-section-title mb-1.5">Tri</p>
          <div className="mb-4 flex gap-2">
            <select value={draft.sortField ?? 'numero'} onChange={(e) => setDraft((d) => ({ ...d, sortField: e.target.value as FilterState['sortField'] }))} aria-label="Trier par" className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs">
              {SORTS.map((s) => <option key={String(s.value)} value={String(s.value)}>{s.label}</option>)}
            </select>
            <div className="ap-segmented grid w-40 grid-cols-2">
              <button type="button" aria-pressed={draft.sortDirection === 'desc'} onClick={() => setDraft((d) => ({ ...d, sortDirection: 'desc' }))}>Décroissant</button>
              <button type="button" aria-pressed={draft.sortDirection === 'asc'} onClick={() => setDraft((d) => ({ ...d, sortDirection: 'asc' }))}>Croissant</button>
            </div>
          </div>

          <div className="mb-4 flex gap-2">
            <button type="button" onClick={clearAll} className="ap-btn ap-btn-secondary flex-1 justify-center text-xs">Tout effacer</button>
            <button type="button" onClick={apply} className="ap-btn ap-btn-primary flex-1 justify-center text-xs">Appliquer</button>
          </div>

          <div className="border-t border-gray-100 pt-3">
            <p className="ap-section-title mb-1.5"><Bookmark size={13} /> Vues enregistrées</p>
            {views.length === 0 ? (
              <p className="mb-2 text-[11px] text-gray-400">Enregistrez la combinaison actuelle (filtres, colonnes, largeurs, densité, tri) pour la retrouver en un clic.</p>
            ) : (
              <ul className="mb-2 max-h-36 space-y-1 overflow-y-auto">
                {views.map((v) => (
                  <li key={v.id} className="group flex items-center gap-1">
                    <button type="button" onClick={() => applyView(v)} className="flex-1 truncate rounded-lg px-2 py-1.5 text-left text-xs font-medium text-gray-800 hover:bg-blue-50">
                      {v.name}
                    </button>
                    <button type="button" onClick={() => persistViews(views.filter((x) => x.id !== v.id))} aria-label={`Supprimer la vue ${v.name}`} className="rounded-md p-1 text-gray-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 focus:opacity-100 group-hover:opacity-100">
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); saveView(); }}>
              <input value={viewName} onChange={(e) => setViewName(e.target.value)} maxLength={40} placeholder="Ex. Mes bons en attente" aria-label="Nom de la vue" className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs" />
              <button type="submit" disabled={!viewName.trim()} className="ap-btn ap-btn-secondary !px-2.5 text-xs disabled:opacity-40"><Save size={13} /> Enregistrer</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/** Pastilles des filtres actifs, chacune retirable, sous la barre d'outils. */
export function ActiveFilterChips({ state, onApply }: { state: FilterState; onApply: (next: FilterState) => void }) {
  const chips = useMemo(() => {
    const list: { key: string; label: string; clear: () => FilterState }[] = [];
    const a = state.advanced;
    if (state.search) list.push({ key: 'search', label: `Recherche : « ${state.search} »`, clear: () => ({ ...state, search: '' }) });
    state.statuses.forEach((s) => list.push({ key: `st-${s}`, label: `Statut : ${s}`, clear: () => ({ ...state, statuses: state.statuses.filter((x) => x !== s) }) }));
    if (a.dateFrom || a.dateTo) {
      const label = a.dateFrom && a.dateTo ? `Du ${fmtDay(a.dateFrom)} au ${fmtDay(a.dateTo)}` : a.dateFrom ? `Depuis le ${fmtDay(a.dateFrom)}` : `Jusqu'au ${fmtDay(a.dateTo)}`;
      list.push({ key: 'date', label, clear: () => ({ ...state, advanced: { ...a, dateFrom: '', dateTo: '' } }) });
    }
    if (a.amountMin || a.amountMax) {
      const label = a.amountMin && a.amountMax ? `Montant ${fmtAmount(a.amountMin)} – ${fmtAmount(a.amountMax)}` : a.amountMin ? `Montant ≥ ${fmtAmount(a.amountMin)}` : `Montant ≤ ${fmtAmount(a.amountMax)}`;
      list.push({ key: 'amount', label, clear: () => ({ ...state, advanced: { ...a, amountMin: '', amountMax: '' } }) });
    }
    return list;
  }, [state]);

  if (chips.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Filtres actifs">
      {chips.map((c) => (
        <span key={c.key} className="ap-chip">
          {c.label}
          <button type="button" onClick={() => onApply(c.clear())} aria-label={`Retirer le filtre ${c.label}`}><X size={12} /></button>
        </span>
      ))}
      {chips.length > 1 && (
        <button type="button" onClick={() => onApply({ ...state, search: '', statuses: [], advanced: EMPTY_ADVANCED })} className="text-xs font-semibold text-blue-600 hover:underline">
          Tout effacer
        </button>
      )}
    </div>
  );
}
