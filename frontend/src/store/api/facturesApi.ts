import { api } from './apiSlice';

export interface Facture {
  id: number; client_id: number; client_nom: string; client_societe?: string;
  numero: string; mois: string; date_facture: string; date_echeance: string;
  montant: number; notes: string | null; nom_fichier: string;
}
export const facturesApi = api.enhanceEndpoints({ addTagTypes: ['Facture'] }).injectEndpoints({
  endpoints: builder => ({
    getFacturesAccess: builder.query<{ allowed: boolean }, void>({ query: () => '/factures/access', providesTags: ['Auth'] }),
    getFactureClients: builder.query<{ id: number; nom_complet: string; societe?: string }[], string>({ query: q => `/factures/clients?q=${encodeURIComponent(q)}` }),
    getFactures: builder.query<{ rows: Facture[]; total: number; montant: number }, { q: string; mois: string; page: number }>({
      query: args => ({ url: '/factures', params: args }), providesTags: ['Facture'],
    }),
    saveFacture: builder.mutation<{ id: number }, { id?: number; body: FormData }>({
      query: ({ id, body }) => ({ url: id ? `/factures/${id}` : '/factures', method: id ? 'PUT' : 'POST', body }), invalidatesTags: ['Facture'],
    }),
    downloadFacture: builder.mutation<{ url: string }, number>({
      query: id => ({ url: `/factures/${id}/fichier`, responseHandler: async (response: Response) => response.ok ? { url: URL.createObjectURL(await response.blob()) } : response.json() }),
    }),
  }),
});
export const { useGetFacturesAccessQuery, useGetFactureClientsQuery, useGetFacturesQuery, useSaveFactureMutation, useDownloadFactureMutation } = facturesApi;
