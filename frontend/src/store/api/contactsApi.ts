import { api } from './apiSlice';
import type { Contact, CreateContactData } from '../../types';

export interface PaginatedContactsResponse {
  data: Contact[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  grandTotalCumule?: number;
  grandTotalSoldeInitial?: number;
  grandTotalVentes?: number;
  grandTotalPaiements?: number;
  grandTotalAvoirs?: number;
}

export type ContactsSortBy = 'nom' | 'societe' | 'solde' | 'solde_cumule' | 'total_cumule' | 'created_at';
export type SortDirection = 'asc' | 'desc';

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

const contactsApi = api.injectEndpoints({
  endpoints: (builder) => ({
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
      query: (id) => ({ url: `/contacts/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'Contact', id }],
    }),

    getContactHistory: builder.query<any, number | { id: number; page?: number; limit?: number }>({
      query: (arg) => {
        const id = typeof arg === 'number' ? arg : arg.id;
        const page = typeof arg === 'number' ? undefined : arg.page;
        const limit = typeof arg === 'number' ? undefined : arg.limit;
        return {
          url: `/contacts/${id}/history`,
          params: {
            ...(page ? { page } : {}),
            ...(limit ? { limit } : {}),
          },
        };
      },
      providesTags: (_result, _error, arg) => [{ type: 'Contact', id: typeof arg === 'number' ? arg : arg.id }],
    }),

    createContact: builder.mutation<Contact, CreateContactData & { created_by: number }>({
      query: (body) => ({
        url: '/contacts',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Contact'],
    }),

    updateContact: builder.mutation<Contact, Partial<Contact> & { id: number; updated_by?: number }>({
      query: ({ id, ...patch }) => ({
        url: `/contacts/${id}`,
        method: 'PUT',
        body: patch,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Contact', id }, 'Contact'],
    }),

    deleteContact: builder.mutation<void, { id: number; updated_by: number }>({
      query: ({ id }) => ({
        url: `/contacts/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Contact'],
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
  useGetContactsQuery,
  useGetContactsSummaryQuery,
  useGetContactQuery,
  useGetContactHistoryQuery,
  useCreateContactMutation,
  useUpdateContactMutation,
  useDeleteContactMutation,
  useGetClientsQuery,
  useGetFournisseursQuery,
  useGetChargesQuery,
  useGetAllClientsQuery,
  useGetAllChargeClientsQuery,
  useGetAllFournisseursQuery,
} = contactsApi;

// Export explicite (plus robuste que le destructuring pour certains outils TS)
export const useGetSoldeCumuleCardQuery = contactsApi.endpoints.getSoldeCumuleCard.useQuery;
export const useGetSoldeCumuleCardFournisseurQuery = contactsApi.endpoints.getSoldeCumuleCardFournisseur.useQuery;

