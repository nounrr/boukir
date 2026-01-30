import { useMemo } from 'react';
import { useGetAllClientsQuery, useGetAllFournisseursQuery } from '../store/api/contactsApi';

/**
 * Hook personnalisé pour obtenir le solde cumulé d'un contact.
 * IMPORTANT: le solde cumulé est calculé côté backend et fourni via `solde_cumule`.
 */
export const useSoldeCumule = () => {
  const { data: clients = [] } = useGetAllClientsQuery();
  const { data: fournisseurs = [] } = useGetAllFournisseursQuery();

  const getContactSoldeBackend = useMemo(() => {
    return (contactId: number): number => {
      const allContacts = [...(clients || []), ...(fournisseurs || [])] as any[];
      const contact = allContacts.find((c) => Number(c?.id) === Number(contactId));
      if (!contact) return 0;
      return Number(contact.solde_cumule ?? 0) || 0;
    };
  }, [clients, fournisseurs]);

  const getSoldeCumule = useMemo(() => {
    return (contactId: string | number): number => {
      if (!contactId) return 0;
      return getContactSoldeBackend(Number(contactId));
    };
  }, [getContactSoldeBackend]);

  const getContactSoldeCumule = useMemo(() => {
    return (contact: any): number => {
      if (!contact) return 0;
      return Number(contact.solde_cumule ?? 0) || 0;
    };
  }, []);

  return {
    getSoldeCumule,
    getContactSoldeCumule,
    // Pour compatibilité avec les composants existants
    getContactSolde: getSoldeCumule,
    // Alias (plus de calcul local)
    getContactSoldeFrontend: getContactSoldeBackend
  };
};

export default useSoldeCumule;
