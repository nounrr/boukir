import { api } from './apiSlice';
import type { Contact, CreateContactData } from '../../types';

export interface PaginatedContactsResponse {
  data: Contact[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalGrouped?: number;
    totalPages: number;
  };
  grandTotalCumule?: number;
  grandTotalSoldeInitial?: number;
  grandTotalVentes?: number;
  grandTotalPaiements?: number;
  grandTotalAvoirs?: number;
}

export type ContactsSortBy = 'rappel' | 'nom' | 'societe' | 'solde' | 'solde_cumule' | 'total_cumule' | 'created_at';
export type SortDirection = 'asc' | 'desc';
export type ContactArchiveKind = 'client' | 'fournisseur' | 'charge';

export type PaymentDirectoryContact = Pick<Contact, 'id' | 'type' | 'nom_complet' | 'nom' | 'societe' | 'telephone' | 'reference' | 'is_remise_pour_maalem' | 'solde'>;

interface ArchivedContactsResponse {
  data: Array<Pick<Contact, 'id' | 'nom_complet' | 'societe'> & {
    archived_at: string;
    archive_reason: 'manual' | 'inactivity';
  }>;
  pagination: { page: number; totalPages: number };
}

export interface ClientChequesEcheanciers {
  cheques: { id: number; numero: string | null; date_paiement: string | null; date_echeance: string; montant_total: number; banque: string | null; code_reglement: string | null; statut: string | null }[];
  total: number;
  from_date: string;
}

export interface ContactsSummaryResponse {
  totalContacts: number;
  totalContactsGrouped?: number;
  totalSoldeCumule: number;
  totalWithICE: number;
}

export interface SoldeCumuleCardResponse {
  total_final: number;
  total_solde?: number;
  total_debit?: number;
  total_credit?: number;
  total_ventes?: number;
  total_paiements?: number;
  total_avoirs?: number;
}

type ClientBonLineCorrection = {
  id: number;
  expectedQuantity: number;
  expectedUnitPrice: number;
  quantity: number;
  unitPrice: number;
};

const contactsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getPaymentContactDirectory: builder.query<PaymentDirectoryContact[], void>({
      query: () => '/contacts/payment-directory',
      providesTags: ['ContactDirectory'],
      keepUnusedDataFor: 300,
    }),
    getBonContactDirectory: builder.query<Contact[], void>({
      query: () => '/contacts/bon-directory',
      providesTags: ['ContactDirectory'],
      keepUnusedDataFor: 300,
    }),
    getBonContact: builder.query<Contact, number>({
      query: (id) => `/contacts/${id}/bon-contact`,
      providesTags: (_result, _error, id) => [{ type: 'Contact', id }],
      keepUnusedDataFor: 15,
    }),
    getContactPaymentBalance: builder.query<{ id: number; type: Contact['type']; total_cumule: number }, number>({
      query: (id) => `/contacts/${id}/payment-balance`,
      providesTags: (_result, _error, id) => [{ type: 'Contact', id }],
      keepUnusedDataFor: 0,
    }),
    getArchivedContacts: builder.query<ArchivedContactsResponse, { kind: ContactArchiveKind; page: number; search: string }>({
      query: (params) => ({ url: '/contacts/archives', params }),
      providesTags: ['Contact'],
    }),
    setContactArchive: builder.mutation<void, { id: number; archived: boolean }>({
      query: ({ id, archived }) => ({
        url: `/contacts/${id}/archive`,
        method: 'PATCH',
        body: { archived },
      }),
      invalidatesTags: (_result, error) => error ? [] : ['Contact', 'ContactDirectory', 'ContactGroup', 'Dashboard'],
    }),
    getContacts: builder.query<PaginatedContactsResponse, { type?: 'Client' | 'Fournisseur'; page?: number; limit?: number; search?: string; clientSubTab?: 'all' | 'backoffice' | 'ecommerce' | 'artisan-requests'; groupId?: number; sortBy?: ContactsSortBy; sortDir?: SortDirection }>({
      query: ({ type, page = 1, limit = 50, search, clientSubTab, groupId, sortBy, sortDir }) => ({ 
        url: '/contacts', 
        params: { 
          ...(type && { type }), 
          page, 
          limit,
          ...(search ? { search } : {}),
          ...(clientSubTab ? { clientSubTab } : {}),
          ...(groupId ? { groupId } : {}),
          ...(sortBy ? { sortBy } : {}),
          ...(sortDir ? { sortDir } : {}),
        }
      }),
      providesTags: ['Contact'],
    }),

    getContactsSummary: builder.query<ContactsSummaryResponse, { type?: 'Client' | 'Fournisseur'; search?: string; clientSubTab?: 'all' | 'backoffice' | 'ecommerce' | 'artisan-requests'; groupId?: number }>({
      query: ({ type, search, clientSubTab, groupId }) => ({
        url: '/contacts/summary',
        params: {
          ...(type && { type }),
          ...(search ? { search } : {}),
          ...(clientSubTab ? { clientSubTab } : {}),
          ...(groupId ? { groupId } : {}),
        },
      }),
      providesTags: ['Contact'],
    }),

    // Route dédiée pour la card "Solde cumulé Client" (query globale fixe)
    getSoldeCumuleCard: builder.query<SoldeCumuleCardResponse, void>({
      query: () => ({
        url: '/contacts/solde-cumule-card',
      }),
      providesTags: ['Contact'],
    }),

    // Route dédiée pour la card "Solde cumulé Fournisseur" (query globale fixe)
    getSoldeCumuleCardFournisseur: builder.query<SoldeCumuleCardResponse, void>({
      query: () => ({
        url: '/contacts/solde-cumule-card-fournisseur',
      }),
      providesTags: ['Contact'],
    }),

    getContact: builder.query<Contact, number>({
      query: (id) => ({ url: `/contacts/${id}`, timeout: 30000 }),
      providesTags: (_result, _error, id) => [{ type: 'Contact', id }],
    }),

    getContactHistory: builder.query<any, number | { id: number; page?: number | 'last'; limit?: number; ledger?: 'client' | 'fournisseur' | 'charge'; tab?: string; dateFrom?: string; dateTo?: string; search?: string; all?: boolean; sortBy?: string; sortDir?: string }>({
      query: (arg) => {
        const id = typeof arg === 'number' ? arg : arg.id;
        const page = typeof arg === 'number' ? undefined : arg.page;
        const limit = typeof arg === 'number' ? undefined : arg.limit;
        return {
          url: `/contacts/${id}/history`,
          timeout: 60000,
          params: {
            ...(typeof arg === 'object' && arg.ledger ? { ledger: arg.ledger, tab: arg.tab, dateFrom: arg.dateFrom, dateTo: arg.dateTo, search: arg.search, all: arg.all, sortBy: arg.sortBy, sortDir: arg.sortDir } : {}),
            ...(page ? { page } : {}),
            ...(limit ? { limit } : {}),
          },
        };
      },
      providesTags: (_result, _error, arg) => [{ type: 'Contact', id: typeof arg === 'number' ? arg : arg.id }],
    }),

    correctClientBonLines: builder.mutation<
      { updated: number },
      { id: number; clientId: number; kind: 'sortie' | 'avoir'; edits: ClientBonLineCorrection[] }
    >({
      query: ({ id, clientId, kind, edits }) => ({
        url: '/contacts/' + clientId + '/history/' + kind + '/' + id + '/lines',
        method: 'PATCH',
        body: { edits },
      }),
      invalidatesTags: result => result?.updated
        ? ['Contact', 'Bon', 'Sortie', 'AvoirClient', 'Product', 'Dashboard', 'Remise']
        : [],
    }),

    getClientChequesEcheanciers: builder.query<ClientChequesEcheanciers, number>({
      query: id => ({ url: `/contacts/${id}/cheques-echeanciers` }),
      providesTags: (_result, _error, id) => [{ type: 'Contact', id }, 'Payment'],
    }),

    createContact: builder.mutation<Contact, CreateContactData & { created_by: number }>({
      query: (body) => ({
        url: '/contacts',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Contact', 'ContactDirectory'],
    }),

    updateContact: builder.mutation<Contact, Partial<Contact> & { id: number; updated_by?: number }>({
      query: ({ id, ...patch }) => ({
        url: `/contacts/${id}`,
        method: 'PUT',
        body: patch,
      }),
      invalidatesTags: (_result, _error, { id, is_remise_pour_maalem }) => [
        { type: 'Contact', id },
        'Contact',
        'ContactDirectory',
        ...(is_remise_pour_maalem !== undefined ? [{ type: 'Remise' as const, id: 'LIST' }, { type: 'Remise' as const, id: 'ANCIENS-ABONNES' }] : []),
      ],
    }),

    updateContactReminder: builder.mutation<
      Pick<Contact, 'id' | 'rappel_date' | 'rappel_jours_initial' | 'rappel_defini_le' | 'rappel_defini_par' | 'rappel_jours_restants'>,
      { id: number; days: number | null }
    >({
      query: ({ id, days }) => ({
        url: `/contacts/${id}/reminder`,
        method: 'PUT',
        body: { days },
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Contact', id },
        'Contact',
        'Dashboard',
      ],
    }),

    deleteContact: builder.mutation<void, { id: number; updated_by: number }>({
      query: ({ id, updated_by }) => ({
        url: `/contacts/${id}`,
        method: 'DELETE',
        body: { updated_by },
      }),
      invalidatesTags: ['Contact', 'ContactDirectory'],
    }),

    getClients: builder.query<PaginatedContactsResponse, { page?: number; limit?: number; search?: string; clientSubTab?: 'all' | 'backoffice' | 'ecommerce' | 'artisan-requests'; groupId?: number; sortBy?: ContactsSortBy; sortDir?: SortDirection; dateFrom?: string; dateTo?: string; exclude_charge?: boolean; only_charge?: boolean }>({
      query: ({ page = 1, limit = 50, search, clientSubTab, groupId, sortBy, sortDir, dateFrom, dateTo, exclude_charge, only_charge } = {}) => ({
        url: '/contacts',
        params: {
          type: 'Client',
          page,
          limit,
          ...(search ? { search } : {}),
          ...(clientSubTab ? { clientSubTab } : {}),
          ...(groupId ? { groupId } : {}),
          ...(sortBy ? { sortBy } : {}),
          ...(sortDir ? { sortDir } : {}),
          ...(dateFrom ? { dateFrom } : {}),
          ...(dateTo ? { dateTo } : {}),
          ...(exclude_charge ? { exclude_charge } : {}),
          ...(only_charge ? { only_charge } : {}),
        }
      }),
      providesTags: ['Contact'],
    }),

    getFournisseurs: builder.query<PaginatedContactsResponse, { page?: number; limit?: number; search?: string; groupId?: number; sortBy?: ContactsSortBy; sortDir?: SortDirection }>({
      query: ({ page = 1, limit = 50, search, groupId, sortBy, sortDir } = {}) => ({ 
        url: '/contacts', 
        params: { 
          type: 'Fournisseur',
          page,
          limit,
          ...(search ? { search } : {}),
          ...(groupId ? { groupId } : {}),
          ...(sortBy ? { sortBy } : {}),
          ...(sortDir ? { sortDir } : {}),
        } 
      }),
      providesTags: ['Contact'],
    }),

    getCharges: builder.query<PaginatedContactsResponse, { page?: number; limit?: number; search?: string; groupId?: number; sortBy?: ContactsSortBy; sortDir?: SortDirection; dateFrom?: string; dateTo?: string }>({
      query: ({ page = 1, limit = 50, search, groupId, sortBy, sortDir, dateFrom, dateTo } = {}) => ({
        url: '/contacts',
        params: {
          type: 'Client',
          only_charge: true,
          page,
          limit,
          ...(search ? { search } : {}),
          ...(groupId ? { groupId } : {}),
          ...(sortBy ? { sortBy } : {}),
          ...(sortDir ? { sortDir } : {}),
          ...(dateFrom ? { dateFrom } : {}),
          ...(dateTo ? { dateTo } : {}),
        }
      }),
      providesTags: ['Contact'],
    }),

    // Endpoints pour charger TOUS les contacts (pour compatibilité avec les autres pages)
    getAllClients: builder.query<Contact[], void>({
      query: () => ({ 
        url: '/contacts', 
        params: { type: 'Client', page: 1, limit: 10000, exclude_charge: true } 
      }),
      transformResponse: (response: PaginatedContactsResponse) => response.data,
      providesTags: ['Contact'],
    }),

    getAllChargeClients: builder.query<Contact[], void>({
      query: () => ({
        url: '/contacts',
        params: { type: 'Client', page: 1, limit: 10000, only_charge: true }
      }),
      transformResponse: (response: PaginatedContactsResponse) => response.data,
      providesTags: ['Contact'],
    }),

    getAllFournisseurs: builder.query<Contact[], void>({
      query: () => ({ 
        url: '/contacts', 
        params: { type: 'Fournisseur', page: 1, limit: 10000 } 
      }),
      transformResponse: (response: PaginatedContactsResponse) => response.data,
      providesTags: ['Contact'],
    }),
  }),
});

export const {
  useGetPaymentContactDirectoryQuery,
  useGetBonContactDirectoryQuery,
  useGetBonContactQuery,
  useLazyGetBonContactQuery,
  useGetContactPaymentBalanceQuery,
  useGetArchivedContactsQuery,
  useSetContactArchiveMutation,
  useGetContactsQuery,
  useGetContactsSummaryQuery,
  useGetContactQuery,
  useGetContactHistoryQuery,
  useLazyGetContactHistoryQuery,
  useCorrectClientBonLinesMutation,
  useGetClientChequesEcheanciersQuery,
  useCreateContactMutation,
  useUpdateContactMutation,
  useUpdateContactReminderMutation,
  useDeleteContactMutation,
  useGetClientsQuery,
  useLazyGetClientsQuery,
  useGetFournisseursQuery,
  useLazyGetFournisseursQuery,
  useGetChargesQuery,
  useLazyGetChargesQuery,
  useGetAllClientsQuery,
  useGetAllChargeClientsQuery,
  useGetAllFournisseursQuery,
} = contactsApi;

// Export explicite (plus robuste que le destructuring pour certains outils TS)
export const useGetSoldeCumuleCardQuery = contactsApi.endpoints.getSoldeCumuleCard.useQuery;
export const useGetSoldeCumuleCardFournisseurQuery = contactsApi.endpoints.getSoldeCumuleCardFournisseur.useQuery;

