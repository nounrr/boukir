import { useMemo } from 'react';
import { useGetBonContactDirectoryQuery } from '../store/api/contactsApi';

export function useBonContactDirectory(skip = false) {
  const query = useGetBonContactDirectoryQuery(undefined, { skip, refetchOnMountOrArgChange: 300, refetchOnFocus: true });
  const contacts = useMemo(() => {
    const clients = (query.data ?? []).filter(contact => contact.type === 'Client');
    return {
      clients: clients.filter(contact => !Number(contact.is_charge)),
      charges: clients.filter(contact => Number(contact.is_charge) === 1),
      fournisseurs: (query.data ?? []).filter(contact => contact.type === 'Fournisseur'),
    };
  }, [query.data]);
  return { ...contacts, isLoading: query.isLoading, isError: query.isError, refetch: query.refetch };
}
