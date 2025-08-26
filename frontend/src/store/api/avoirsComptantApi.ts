import { api } from './apiSlice';

// Types simplifiés (adapter si besoin)
export interface AvoirComptantItem {
  id?: number;
  product_id: number;
  designation?: string;
  quantite: number;
  prix_unitaire: number;
  remise_pourcentage?: number;
  remise_montant?: number;
  total: number;
}

export interface AvoirComptant {
  id?: number;
  numero?: string; // calculé côté backend (AVCCxx)
  date_creation: string; // datetime ISO/MySQL
  client_nom: string; // texte libre
  lieu_chargement?: string | null;
  adresse_livraison?: string | null;
  montant_total: number;
  statut?: string; // En attente, Validé, Appliqué, Annulé
  created_by: number;
  items: AvoirComptantItem[];
  created_at?: string;
  updated_at?: string;
}

export const avoirsComptantApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getAvoirsComptant: builder.query<AvoirComptant[], void>({
      query: () => '/avoirs_comptant',
      transformResponse: (response: any) => {
        const list = Array.isArray(response) ? response : (response?.data ?? []);
        return list.map((r: any) => ({ ...r, type: 'AvoirComptant' }));
      },
      providesTags: (result) =>
        result
          ? [
              ...result.map((r) => ({ type: 'AvoirComptant' as const, id: r.id })),
              { type: 'AvoirComptant' as const, id: 'LIST' },
            ]
          : [{ type: 'AvoirComptant' as const, id: 'LIST' }],
    }),
    getAvoirComptant: builder.query<AvoirComptant, number>({
      query: (id) => `/avoirs_comptant/${id}`,
      transformResponse: (r: any) => ({ ...r, type: 'AvoirComptant' }),
      providesTags: (_r, _e, id) => [{ type: 'AvoirComptant', id }],
    }),
    createAvoirComptant: builder.mutation<any, Partial<AvoirComptant>>({
      query: (body) => ({ url: '/avoirs_comptant', method: 'POST', body }),
      invalidatesTags: [{ type: 'AvoirComptant', id: 'LIST' }, { type: 'AvoirClient', id: 'LIST' }], // invalider aussi stats qui utilisent avoirs client
    }),
    updateAvoirComptant: builder.mutation<any, { id: number } & Partial<AvoirComptant>>({
      query: ({ id, ...body }) => ({ url: `/avoirs_comptant/${id}`, method: 'PUT', body }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: 'AvoirComptant', id },
        { type: 'AvoirComptant', id: 'LIST' },
        { type: 'AvoirClient', id: 'LIST' },
      ],
    }),
    updateAvoirComptantStatut: builder.mutation<any, { id: number; statut: string }>({
      query: ({ id, statut }) => ({
        url: `/avoirs_comptant/${id}/statut`,
        method: 'PATCH',
        body: { statut },
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: 'AvoirComptant', id },
        { type: 'AvoirComptant', id: 'LIST' },
        { type: 'AvoirClient', id: 'LIST' },
      ],
    }),
    deleteAvoirComptant: builder.mutation<any, { id: number }>({
      query: ({ id }) => ({ url: `/avoirs_comptant/${id}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: 'AvoirComptant', id },
        { type: 'AvoirComptant', id: 'LIST' },
        { type: 'AvoirClient', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useGetAvoirsComptantQuery,
  useGetAvoirComptantQuery,
  useCreateAvoirComptantMutation,
  useUpdateAvoirComptantMutation,
  useUpdateAvoirComptantStatutMutation,
  useDeleteAvoirComptantMutation,
} = avoirsComptantApi;
