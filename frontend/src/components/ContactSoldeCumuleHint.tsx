import type { FC } from 'react';
import { useContactSoldeCumule } from '../hooks/useContactSoldeCumule';

const ContactSoldeCumuleHint: FC<{
  contactId?: string | number | null;
  contactType: 'Client' | 'Fournisseur';
  colorClassName?: string;
  labelClassName?: string;
  valueClassName?: string;
}> = ({
  contactId,
  contactType,
  colorClassName = 'bg-blue-50',
  labelClassName = 'text-blue-700',
  valueClassName = 'text-blue-800',
}) => {
  const numericId = contactId ? Number(contactId) : null;
  const { soldeCumule, contact, isLoading, error, refetch } = useContactSoldeCumule(numericId, contactType);

  if (!numericId) return null;

  const hasValue = contact && Number.isFinite(Number(soldeCumule));

  return (
    <div className={`mt-2 p-2 rounded ${colorClassName}`} role="status">
      <span className={`text-sm font-medium ${labelClassName}`}>Solde cumulé : </span>
      <span className={`text-sm font-semibold ${valueClassName}`}>
        {isLoading ? 'Chargement…' : error ? (
          <>Indisponible. <button type="button" className="underline" onClick={() => refetch()}>Réessayer</button></>
        ) : hasValue ? `${soldeCumule.toFixed(2)} DH` : '—'}
      </span>
    </div>
  );
};

export default ContactSoldeCumuleHint;
