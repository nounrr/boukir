import { createContext, lazy, Suspense, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../hooks/redux';
import { useLazyGetBonForEditingQuery } from '../store/api/bonsApi';
import { canModifyBons } from '../utils/permissions';
import { showError, showSuccess } from '../utils/notifications';
import { resolveHistoryDocumentType, isHistoryDocumentLocked } from '../utils/historyDocumentEditing';

const BonFormModal = lazy(() => import('./BonFormModal'));
const ChargeEditFormModal = lazy(() => import('./ChargeEditFormModal'));
type Field = 'quantite' | 'prix_unitaire';
type Request = { document: any; type: string; items: any[]; field: Field };
const EditorContext = createContext<((request: Request) => void) | null>(null);

export function ContactHistoryEditor({ children }: { children: ReactNode }) {
  const [loadBon] = useLazyGetBonForEditingQuery();
  const { user } = useAuth();
  const [editing, setEditing] = useState<{ bon: any; item: any; field: Field } | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);

  useEffect(() => {
    if (!editing) return;
    let lastFocused: HTMLInputElement | null = null;
    // The form can arrive after its lazy module and product queries. Observe it
    // instead of relying on a fixed delay or an index from a filtered history.
    const focus = () => {
      if (lastFocused?.isConnected) return;
      const inputs = [...document.querySelectorAll<HTMLInputElement>(`input[data-history-field="${editing.field}"]`)]
        .filter(input => !input.disabled && input.getClientRects().length > 0);
      const target = inputs.find(input => input.dataset.historyItemId === String(editing.item.id))
        ?? inputs.find(input => editing.item.product_id != null
          && input.dataset.historyProductId === String(editing.item.product_id)
          && (input.dataset.historyVariantId || '') === String(editing.item.variant_id ?? ''));
      if (!target || target.disabled || !target.getClientRects().length) return;
      target.scrollIntoView({ block: 'center' });
      target.focus();
      target.select();
      lastFocused = target;
    };
    focus();
    const observer = new MutationObserver(focus);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'data-history-item-id'] });
    return () => observer.disconnect();
  }, [editing]);

  const close = () => { setEditing(null); opener.current?.focus(); };
  const open = async (request: Request) => {
    const type = resolveHistoryDocumentType(request.type);
    if (inFlight.current || !type || !canModifyBons(user)) return;
    if (isHistoryDocumentLocked(request.document.statut)) {
      showError('Impossible de modifier un bon validé ou annulé.');
      return;
    }
    opener.current = document.activeElement as HTMLElement;
    inFlight.current = true;
    setLoading(true);
    const version = generation.current;
    try {
      const loaded = await loadBon({ id: Number(request.document.id), type }, false).unwrap();
      if (version !== generation.current) return;
      if (isHistoryDocumentLocked(loaded.statut)) {
        showError('Ce bon a été validé ou annulé. Il ne peut plus être modifié.');
        return;
      }
      const items = typeof loaded.items === 'string' ? JSON.parse(loaded.items) : loaded.items;
      const sourceIds = new Set(request.items.map(item => Number(item.id)));
      const item = (items ?? []).find((entry: any) => sourceIds.has(Number(entry.id)));
      if (!item) { showError('Cette ligne a changé. Actualisez la fiche avant de la modifier.'); return; }
      if (type === 'Charge' && item.product_id && request.field === 'prix_unitaire') {
        showError('Le prix de ce produit en charge est calculé automatiquement au coût de revient. La quantité reste modifiable.');
        return;
      }
      setEditing({ bon: { ...loaded, items, type }, item, field: request.field });
    } catch { showError('Impossible de charger le bon à modifier.'); }
    finally { inFlight.current = false; if (version === generation.current) setLoading(false); }
  };
  const saved = () => { close(); showSuccess('Bon modifié. Les montants et les soldes sont actualisés.'); };
  return <EditorContext.Provider value={open}>
    {children}
    {loading && createPortal(<div role="status" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 text-white">Chargement du bon…</div>, document.body)}
    {editing && createPortal(<Suspense fallback={<div role="status" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 text-white">Chargement du formulaire…</div>}>
      {editing.bon.type === 'Charge'
        ? <ChargeEditFormModal isOpen onClose={close} initialValues={editing.bon} onBonAdded={saved} />
        : <BonFormModal isOpen onClose={close} currentTab={editing.bon.type} initialValues={editing.bon} onBonAdded={saved}
            comptantPartialPaymentMode={editing.bon.type === 'Comptant' && editing.bon.non_paye ? 'required' : 'hidden'}
            defaultVendreAuFournisseur={Number(editing.bon.vendre_au_fournisseur) === 1} />}
    </Suspense>, document.body)}
  </EditorContext.Provider>;
}

export function EditableHistoryValue({ document, type, items, field, children }: Request & { children: ReactNode }) {
  const open = useContext(EditorContext);
  const { user } = useAuth();
  const label = field === 'quantite' ? 'la quantité' : 'le prix unitaire';
  const editable = open && canModifyBons(user) && resolveHistoryDocumentType(type) && !isHistoryDocumentLocked(document.statut);
  if (!editable) return <>{children}</>;
  return <button type="button" className="cursor-text rounded px-1 -mx-1 decoration-dotted underline-offset-4 hover:bg-blue-50 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500"
    title={`Double-cliquez pour modifier ${label} dans le bon`}
    aria-label={`Modifier ${label} du bon ${document.numero ?? document.id}`}
    onClick={event => event.stopPropagation()}
    onDoubleClick={event => { event.stopPropagation(); open({ document, type, items, field }); }}
    onPointerUp={event => { if (event.pointerType === 'touch') { event.stopPropagation(); open({ document, type, items, field }); } }}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === 'F2' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); open({ document, type, items, field }); } }}
  >{children}</button>;
}
