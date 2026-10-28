import { useState } from 'react';
import { useUpdateDocumentSaisieMutation } from '../store/api/bonsApi';
import { showError } from '../utils/notifications';

const TYPES: Record<string, string> = {
  SOR: 'Sortie', SVF: 'Sortie', CMD: 'Commande', COM: 'Comptant', CPT: 'Comptant', CHG: 'Charge',
  AVC: 'Avoir', AVV: 'Avoir', AVF: 'AvoirFournisseur', AVCC: 'AvoirComptant',
  sortie: 'Sortie', commande: 'Commande', comptant: 'Comptant', charge: 'Charge',
  avoir: 'Avoir', avoirClient: 'Avoir', avoirFournisseur: 'AvoirFournisseur',
  avoirComptant: 'AvoirComptant', avoirCharge: 'AvoirCharge', avoirEcommerce: 'AvoirEcommerce',
  ecommerce: 'Ecommerce', paiement: 'Paiement', vendreFournisseur: 'Sortie', avoirVendreFournisseur: 'Avoir',
  sortieVendreFournisseur: 'Sortie', avoirClientVendreFournisseur: 'Avoir',
};

export default function DocumentSaisieCheckbox({ document, type }: { document: { id: number; is_saisise?: boolean | number }; type: string }) {
  const [update, { isLoading }] = useUpdateDocumentSaisieMutation();
  const key = `${TYPES[type] ?? type}:${document.id}`;
  const [override, setOverride] = useState<{ key: string; source: unknown; value: boolean } | null>(null);
  const checked = override?.key === key && override.source === document.is_saisise ? override.value : document.is_saisise === true || Number(document.is_saisise) === 1;
  return <label className="inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap font-sans text-xs font-medium text-gray-600" onClick={event => event.stopPropagation()}>
    <input type="checkbox" aria-label={`Saisi : ${type} ${document.id}`} checked={checked} disabled={isLoading} className="h-4 w-4 rounded border-gray-300 accent-blue-600 disabled:opacity-50" onChange={async event => {
      const value = event.target.checked;
      try {
        await update({ id: Number(document.id), type: TYPES[type] ?? type, is_saisise: value }).unwrap();
        setOverride({ key, source: document.is_saisise, value });
      } catch { showError('Impossible de mémoriser la saisie du document.'); }
    }} />
    Saisi
  </label>;
}
