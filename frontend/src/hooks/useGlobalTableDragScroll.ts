import { useEffect } from 'react';

/**
 * Glisser à la souris pour faire défiler horizontalement TOUS les tableaux de l'application.
 *
 * Un seul écouteur sur le document : au clic (bouton gauche, souris) dans un tableau, on cherche
 * le conteneur qui défile horizontalement (ou le tableau lui-même), puis on le fait défiler en
 * suivant la souris. Rien à ajouter dans les pages : les tableaux existants et futurs en profitent.
 *
 * Exclus : boutons, liens, champs, cases à cocher, poignées de redimensionnement, impressions,
 * et les tableaux gérés par useTableToolkit (.tk-container), qui ont leur propre réglage.
 * Le glisser ne démarre qu'après quelques pixels : un clic ou une sélection de texte restent normaux.
 */
const INTERACTIVE =
  'button, a, input, select, textarea, label, option, summary, [role="button"], [role="checkbox"], [role="switch"], [role="menuitem"], [contenteditable="true"], [draggable="true"], .tk-resizer, .cursor-col-resize';
const EXCLUDED = '.tk-container, [data-print-root], #print-mode, .print-compact, [data-no-drag-scroll]';
const THRESHOLD = 6;

function scrollsHorizontally(el: HTMLElement): boolean {
  if (el.scrollWidth <= el.clientWidth + 1) return false;
  const overflowX = getComputedStyle(el).overflowX;
  return overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay';
}

/** Premier ancêtre qui défile horizontalement, à partir d'un élément situé dans un tableau. */
export function findTableScroller(target: Element | null): HTMLElement | null {
  const table = target?.closest('table');
  if (!table) return null;
  let el: HTMLElement | null = table as HTMLElement;
  while (el && el !== document.body && el !== document.documentElement) {
    if (scrollsHorizontally(el)) return el;
    el = el.parentElement;
  }
  return null;
}

export function useGlobalTableDragScroll() {
  useEffect(() => {
    let suppressNextClick = false;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || event.defaultPrevented) return;
      const target = event.target as Element | null;
      if (!target || target.closest(INTERACTIVE) || target.closest(EXCLUDED)) return;
      const scroller = findTableScroller(target);
      if (!scroller) return;

      const startX = event.clientX;
      const startScroll = scroller.scrollLeft;
      const previousBehavior = scroller.style.scrollBehavior;
      let moved = false;
      let frame = 0;
      let dx = 0;

      const onMove = (e: PointerEvent) => {
        dx = e.clientX - startX;
        if (!moved && Math.abs(dx) < THRESHOLD) return;
        if (!moved) {
          moved = true;
          scroller.style.scrollBehavior = 'auto'; // suivre la souris sans animation
          document.documentElement.classList.add('table-drag-scrolling');
          window.getSelection()?.removeAllRanges();
        }
        e.preventDefault();
        if (!frame) {
          frame = requestAnimationFrame(() => {
            frame = 0;
            scroller.scrollLeft = startScroll - dx;
          });
        }
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        if (frame) {
          cancelAnimationFrame(frame);
          scroller.scrollLeft = startScroll - dx;
        }
        if (moved) {
          scroller.style.scrollBehavior = previousBehavior;
          document.documentElement.classList.remove('table-drag-scrolling');
          // Le relâchement après un glisser ne doit pas déclencher le clic d'une ligne.
          suppressNextClick = true;
          setTimeout(() => { suppressNextClick = false; }, 0);
        }
      };
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };

    const onClickCapture = (event: MouseEvent) => {
      if (!suppressNextClick) return;
      suppressNextClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    // Curseur « main » uniquement sur les tableaux qui défilent vraiment.
    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const target = event.target as Element | null;
      const table = target?.closest('table') as HTMLElement | null;
      if (!table || table.dataset.dragScrollChecked === '1' || target?.closest(EXCLUDED)) return;
      table.dataset.dragScrollChecked = '1';
      setTimeout(() => { delete table.dataset.dragScrollChecked; }, 1500);
      table.classList.toggle('table-drag-scrollable', Boolean(findTableScroller(table)));
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointerover', onPointerOver);
    window.addEventListener('click', onClickCapture, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointerover', onPointerOver);
      window.removeEventListener('click', onClickCapture, true);
    };
  }, []);
}
