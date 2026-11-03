import { lazy, Suspense, useState } from 'react';
import { createPortal } from 'react-dom';
import { Edit } from 'lucide-react';
import DocumentSaisieCheckbox from './DocumentSaisieCheckbox';
import DocumentModificationAuthor from './DocumentModificationAuthor';
import { useAuth } from '../hooks/redux';
import { useLazyGetBonForEditingQuery } from '../store/api/bonsApi';
import { canModifyBons } from '../utils/permissions';
import { showError, showSuccess } from '../utils/notifications';

const BonFormModal = lazy(() => import('./BonFormModal'));
const ChargeEditFormModal = lazy(() => import('./ChargeEditFormModal'));

const TYPES = {
  SOR: 'Sortie', SVF: 'Sortie', CMD: 'Commande', COM: 'Comptant', CPT: 'Comptant', CHG: 'Charge', ACH: 'AvoirCharge',
  AVC: 'Avoir', AVV: 'Avoir', AVF: 'AvoirFournisseur', AVCC: 'AvoirComptant',
  sortie: 'Sortie', commande: 'Commande', comptant: 'Comptant', charge: 'Charge',
  avoir: 'Avoir', avoirClient: 'Avoir', avoirFournisseur: 'AvoirFournisseur',
  avoirComptant: 'AvoirComptant', avoirCharge: 'AvoirCharge',
  vendreFournisseur: 'Sortie', avoirVendreFournisseur: 'Avoir',
  sortieVendreFournisseur: 'Sortie', avoirClientVendreFournisseur: 'Avoir',
} as const;
type EditableType = typeof TYPES[keyof typeof TYPES];
const editableTypes = new Set<string>(Object.values(TYPES));
const isLocked = (status?: string) => status === 'Validé' || status === 'Annulé';

/** Edit the complete source document, including lines hidden by history filters. */
export default function ContactDocumentActions({ document, type }: {
  document: { id: number; statut?: string; is_saisise?: boolean | number; last_modified_by_name?: string | null; last_modified_at?: string | null };
  type: string;
}) {
  const { user } = useAuth();
  const [loadBon, { isFetching }] = useLazyGetBonForEditingQuery();
  const [bon, setBon] = useState<any>(null);
  const bonType = (TYPES[type as keyof typeof TYPES] ?? type) as EditableType;
  const canEdit = editableTypes.has(bonType) && canModifyBons(user) && !isLocked(document.statut);
  const close = () => setBon(null);
  const saved = () => {
    close();
    showSuccess('Bon modifié avec succès.');
  };

  return <>
    <DocumentSaisieCheckbox document={document} type={bonType} />
    {canEdit && <button
      type="button"
      disabled={isFetching}
      className="ml-2 inline-flex min-h-8 items-center gap-1 rounded border border-blue-200 px-2 font-sans text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50 print:hidden"
      title="Modifier les prix et quantités sans quitter cette fiche"
      onClick={async event => {
        event.stopPropagation();
        try {
          // Always reload: another employee may have edited or validated the bon.
          const loaded = await loadBon({ id: Number(document.id), type: bonType }, false).unwrap();
          if (isLocked(loaded.statut)) {
            showError('Impossible de modifier un bon validé ou annulé.');
            return;
          }
          setBon({ ...loaded, type: bonType });
        } catch {
          showError('Impossible de charger le bon à modifier.');
        }
      }}
    ><Edit className="h-3.5 w-3.5" />{isFetching ? 'Chargement…' : 'Modifier'}</button>}
    {editableTypes.has(bonType) && <span className="mt-1 block font-sans text-xs text-gray-500 md:hidden">
      Modifié par : <DocumentModificationAuthor document={document} />
    </span>}
    {bon && createPortal(<Suspense fallback={
      <div role="status" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 text-white">Chargement du formulaire…</div>
    }>
      {bonType === 'Charge'
        ? <ChargeEditFormModal isOpen onClose={close} initialValues={bon} onBonAdded={saved} />
        : <BonFormModal isOpen onClose={close} currentTab={bonType} initialValues={bon} onBonAdded={saved}
            comptantPartialPaymentMode={bonType === 'Comptant' && bon.non_paye ? 'required' : 'hidden'}
            defaultVendreAuFournisseur={Number(bon.vendre_au_fournisseur) === 1} />}
    </Suspense>, window.document.body)}
  </>;
}
