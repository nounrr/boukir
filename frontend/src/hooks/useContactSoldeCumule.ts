import { useGetContactQuery } from '../store/api/contactsApi';

/**
 * Hook spécialisé pour récupérer le solde cumulé d'un contact depuis le backend
 * Utilise la route individuelle qui calcule le solde_cumule côté serveur
 */
export const useContactSoldeCumule = (contactId: number | null | undefined) => {
  const { 
    data: contact, 
    isLoading, 
    error, 
    refetch 
  } = useGetContactQuery(contactId!, {
    skip: !contactId
  });

  return {
    soldeCumule: contact?.solde_cumule ?? 0,
    soldeInitial: contact?.solde ?? 0,
    contact,
    isLoading,
    error,
    refetch
  };
};

export default useContactSoldeCumule;
