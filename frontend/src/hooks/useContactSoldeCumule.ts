import { useGetBonContactQuery } from '../store/api/contactsApi';

export const useContactSoldeCumule = (
  contactId: number | null | undefined,
  contactType?: 'Client' | 'Fournisseur'
) => {
  const { currentData, isFetching, error, refetch } = useGetBonContactQuery(contactId ?? 0, {
    skip: !contactId,
  });
  const contact = currentData && (!contactType || currentData.type === contactType) ? currentData : null;
  const totalCumule = Number(contact?.total_cumule ?? 0);

  return {
    soldeCumule: totalCumule,
    totalCumule,
    soldeInitial: Number(contact?.solde ?? 0),
    contact,
    isLoading: isFetching,
    error,
    refetch,
  };
};

export default useContactSoldeCumule;
