import { api } from './apiSlice';

export type EcommerceClientsTab = 'all' | 'artisan' | 'promoteur';

export interface EcommerceClient {
  id: number;
  nom_complet: string;
  prenom: string | null;
  nom: string | null;
  societe: string | null;
  email: string | null;
  telephone: string | null;
  type_compte: string | null;
  type_compte_demande: string | null;
  demande_artisan: boolean | number | string;
  artisan_approuve: boolean | number | string;
  artisan_note_admin: string | null;
  remise_balance: number;
  created_at: string;
}

export interface EcommerceClientsResponse {
  data: EcommerceClient[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  counts: { all: number; artisan: number; promoteur: number };
}

export const ecommerceClientsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getEcommerceClients: builder.query<EcommerceClientsResponse, {
      tab: EcommerceClientsTab; search: string; page: number; limit: number;
    }>({
      query: (params) => ({ url: '/contacts/ecommerce-clients', params }),
      providesTags: ['Contact', 'Notifications'],
    }),
  }),
});

export const { useGetEcommerceClientsQuery } = ecommerceClientsApi;
