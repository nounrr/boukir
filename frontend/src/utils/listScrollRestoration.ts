export type Position = { left: number; top: number };
export type Snapshot = { window: Position; main?: Position; container?: Position; table?: Position };

export function readSnapshot(key: string): Snapshot | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return null;
    const value = JSON.parse(raw);
    // Anciennes positions enregistrées sous forme d'un simple nombre.
    if (typeof value === 'number' && Number.isFinite(value)) return { window: { left: 0, top: Math.max(0, value) } };
    if (!value || typeof value !== 'object') return null;
    const valid = (p: Position) => p && Number.isFinite(p.left) && Number.isFinite(p.top);
    if (!valid(value.window)) return null;
    for (const key of ['main', 'container', 'table']) if (value[key] && !valid(value[key])) return null;
    return value;
  } catch { return null; }
}

export function applyListScroll(snapshot: Snapshot, elements: Partial<Record<'main' | 'container' | 'table', Pick<HTMLElement, 'scrollTo' | 'scrollTop' | 'scrollLeft'> | null>>, viewport: Pick<Window, 'scrollTo' | 'scrollY' | 'scrollX'>) {
  let matches = true;
  for (const name of ['main', 'container', 'table'] as const) {
    const element = elements[name];
    const position = snapshot[name];
    if (!position) continue;
    if (!element) { matches = false; continue; }
    element.scrollTo({ ...position, behavior: 'instant' });
    matches = matches && Math.abs(element.scrollTop - position.top) < 2 && Math.abs(element.scrollLeft - position.left) < 2;
  }
  viewport.scrollTo({ ...snapshot.window, behavior: 'instant' });
  return matches && Math.abs(viewport.scrollY - snapshot.window.top) < 2 && Math.abs(viewport.scrollX - snapshot.window.left) < 2;
}
