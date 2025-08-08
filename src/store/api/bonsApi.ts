import { api } from './apiSlice';
import type { Bon, CreateBonData } from '../../types';

export const bonsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getBons: builder.query<Bon[], void>({
      query: () => '/bons',
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Bons' as const, id })), { type: 'Bons', id: 'LIST' }]
          : [{ type: 'Bons', id: 'LIST' }],
    }),
    
    getBonsByType: builder.query<Bon[], string>({
      query: (type) => `/bons/type/${type}`,
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Bons' as const, id })), { type: 'Bons', id: 'LIST' }]
          : [{ type: 'Bons', id: 'LIST' }],
    }),
    
    getBon: builder.query<Bon, number>({
      query: (id) => `/bons/${id}`,
      providesTags: (result, error, id) => [{ type: 'Bons', id }],
    }),
    
    createBon: builder.mutation<Bon, CreateBonData>({
      query: (bonData) => ({
        url: '/bons',
        method: 'POST',
        body: bonData,
      }),
      invalidatesTags: [{ type: 'Bons', id: 'LIST' }],
    }),
    
    updateBon: builder.mutation<Bon, Partial<Bon> & { id: number }>({
      query: ({ id, ...bonData }) => ({
        url: `/bons/${id}`,
        method: 'PATCH',
        body: bonData,
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Bons', id }],
    }),
    
    deleteBon: builder.mutation<{ success: boolean; id: number }, number>({
      query: (id) => ({
        url: `/bons/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, id) => [{ type: 'Bons', id }],
    }),

    // Pour changer le statut d'un bon (Valider, Annuler, etc.)
    updateBonStatus: builder.mutation<Bon, { id: number; statut: string }>({
      query: ({ id, statut }) => ({
        url: `/bons/${id}/statut`,
        method: 'PATCH',
        body: { statut },
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Bons', id }],
    }),
  }),
});

export const {
  useGetBonsQuery,
  useGetBonsByTypeQuery,
  useGetBonQuery,
  useCreateBonMutation,
  useUpdateBonMutation,
  useDeleteBonMutation,
  useUpdateBonStatusMutation,
} = bonsApi;
