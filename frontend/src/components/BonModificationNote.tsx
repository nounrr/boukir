import { useLocation } from 'react-router-dom';
import { isClientDetailPath } from '../utils/modificationSource';
import { useGetBonModificationQuery } from '../store/api/bonsApi';
import { DocumentModificationNote } from './DocumentModificationAuthor';

const supportedTypes = new Set(['Sortie', 'Comptant', 'Commande', 'Charge', 'AvoirCharge', 'Avoir', 'AvoirFournisseur', 'AvoirComptant', 'Devis']);

export default function BonModificationNote({ id, type }: { id?: number; type: string }) {
  const clientDetail = isClientDetailPath(useLocation().pathname);
  const { currentData, isError, refetch } = useGetBonModificationQuery(
    { id: Number(id), type, ...(clientDetail ? { source: 'client-detail' as const } : {}) },
    { skip: !id || !supportedTypes.has(type), refetchOnMountOrArgChange: true },
  );
  if (isError) return (
    <p className="my-2 text-xs text-gray-600">
      Note de modification indisponible. <button type="button" className="underline" onClick={() => refetch()}>Réessayer</button>
    </p>
  );
  return currentData ? <DocumentModificationNote document={currentData} compact={clientDetail} /> : null;
}
