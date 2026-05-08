import {
  useGetClientsQuery,
  useGetFournisseursQuery,
  useGetContactQuery,
} from '../store/api/contactsApi';

type ContactType = 'Client' | 'Fournisseur';

/**
 * Utilise en priorite la meme API liste que ClientsPage / FournisseursPage
 * pour recuperer total_cumule. Fallback sur GET /contacts/:id si besoin.
 */
export const useContactSoldeCumule = (
  contactId: number | null | undefined,
  contactType?: ContactType
) => {
  const shouldLoadClientList = !!contactId && contactType === 'Client';
  const shouldLoadFournisseurList = !!contactId && contactType === 'Fournisseur';

  const { data: clientsResponse, isLoading: isClientsLoading } = useGetClientsQuery(
    { page: 1, limit: 10000 },
    { skip: !shouldLoadClientList }
  );

  const { data: fournisseursResponse, isLoading: isFournisseursLoading } = useGetFournisseursQuery(
    { page: 1, limit: 10000 },
    { skip: !shouldLoadFournisseurList }
  );

  const {
    data: fallbackContact,
    isLoading: isFallbackLoading,
    error,
    refetch,
  } = useGetContactQuery(contactId!, {
    skip: !contactId || !!contactType,
  });

  const list =
    contactType === 'Client'
      ? clientsResponse?.data ?? []
      : contactType === 'Fournisseur'
        ? fournisseursResponse?.data ?? []
        : [];

  const listContact =
    contactId && list.length > 0
      ? list.find((item: any) => Number(item?.id) === Number(contactId))
      : null;

  const contact = listContact ?? fallbackContact ?? null;

  const totalCumule =
    contact?.total_cumule !== null && contact?.total_cumule !== undefined
      ? Number(contact.total_cumule) || 0
      : Number(contact?.solde_cumule ?? 0) || 0;

  const isLoading = contactType
    ? contactType === 'Client'
      ? isClientsLoading
      : isFournisseursLoading
    : isFallbackLoading;

  return {
    soldeCumule: totalCumule,
    totalCumule,
    soldeInitial: Number(contact?.solde ?? 0) || 0,
    contact,
    isLoading,
    error,
    refetch,
  };
};

export default useContactSoldeCumule;
