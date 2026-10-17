import { useEffect, useRef } from 'react';

import { applyListScroll, readSnapshot, type Snapshot } from '../utils/listScrollRestoration';

const targets = () => {
  const container = document.querySelector<HTMLElement>('[data-contact-list-scroll]');
  return { main: container?.closest('main'), container, table: container?.querySelector('table') };
};

export function useListScrollRestoration(key: string, ready: boolean) {
  const pending = useRef<Snapshot | null>(readSnapshot(key));
  useEffect(() => {
    if (!ready || !pending.current) return;
    let frame = 0;
    let attempts = 0;
    let stable = 0;
    let cancelled = false;
    const stop = () => { cancelled = true; cancelAnimationFrame(frame); pending.current = null; };
    // Une interaction volontaire doit toujours prendre la main sur la restauration.
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('touchstart', stop, { passive: true });
    window.addEventListener('keydown', stop);
    const restore = () => {
      if (cancelled || !pending.current) return;
      const snapshot = pending.current;
      const elements = targets();
      const matches = applyListScroll(snapshot, elements, window);
      stable = matches ? stable + 1 : 0;
      // Plusieurs frames couvrent le rendu du tableau et les ajustements du layout.
      if (stable >= 3 || ++attempts >= 120) { pending.current = null; return; }
      frame = requestAnimationFrame(restore);
    };
    frame = requestAnimationFrame(restore);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('keydown', stop);
    };
  }, [key, ready]);

  return () => {
    const snapshot: Snapshot = { window: { left: window.scrollX, top: window.scrollY } };
    for (const [name, element] of Object.entries(targets())) {
      if (element) snapshot[name as 'main' | 'container' | 'table'] = { left: element.scrollLeft, top: element.scrollTop };
    }
    try { sessionStorage.setItem(key, JSON.stringify(snapshot)); } catch { /* Navigation disponible même sans stockage. */ }
  };
}
