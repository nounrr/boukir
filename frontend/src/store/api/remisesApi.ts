import { api } from './apiSlice';

export const remisesApi = api.injectEndpoints({
  endpoints: (build) => ({
    getClientRemises: build.query<any[], void>({
      query: () => '/remises/clients',
      providesTags: (r) => [{ type: 'Remise', id: 'LIST' }, ...(r || []).map((x: any) => ({ type: 'Remise' as const, id: x.id }))],
    }),
    createClientRemise: build.mutation<any, Partial<any>>({
      query: (body) => ({ url: '/remises/clients', method: 'POST', body }),
      invalidatesTags: [{ type: 'Remise', id: 'LIST' }],
    }),
    updateClientRemise: build.mutation<any, { id: number; data: Partial<any> }>({
      query: ({ id, data }) => ({ url: `/remises/clients/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Remise', id }, { type: 'Remise', id: 'LIST' }],
    }),
    deleteClientRemise: build.mutation<any, number>({
      query: (id) => ({ url: `/remises/clients/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Remise', id: 'LIST' }],
    }),

    getRemiseItems: build.query<any[], number>({
      query: (clientRemiseId) => `/remises/clients/${clientRemiseId}/items`,
      providesTags: (r, _e, id) => [{ type: 'RemiseItem', id: `LIST-${id}` }, ...(r || []).map((x: any) => ({ type: 'RemiseItem' as const, id: x.id }))],
    }),
    createRemiseItem: build.mutation<any, { clientRemiseId: number; data: Partial<any> }>({
      query: ({ clientRemiseId, data }) => ({ url: `/remises/clients/${clientRemiseId}/items`, method: 'POST', body: data }),
      invalidatesTags: (_r, _e, { clientRemiseId }) => [
        { type: 'RemiseItem', id: `LIST-${clientRemiseId}` },
        { type: 'Remise', id: 'LIST' },
      ],
    }),
    updateRemiseItem: build.mutation<any, { id: number; data: Partial<any> }>({
      query: ({ id, data }) => ({ url: `/remises/items/${id}`, method: 'PATCH', body: data }),
      // Also refresh clients list totals
      invalidatesTags: (_r, _e, { id }) => [
        { type: 'RemiseItem', id },
        { type: 'Remise', id: 'LIST' },
      ],
    }),
    deleteRemiseItem: build.mutation<any, number>({
      query: (id) => ({ url: `/remises/items/${id}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, id) => [
        { type: 'RemiseItem', id },
        { type: 'Remise', id: 'LIST' },
      ],
    }),

    getRemiseBons: build.query<any[], number>({
      query: (clientRemiseId) => `/remises/clients/${clientRemiseId}/bons`,
    }),
  }),
});

export const {
  useGetClientRemisesQuery,
  useCreateClientRemiseMutation,
  useUpdateClientRemiseMutation,
  useDeleteClientRemiseMutation,
  useGetRemiseItemsQuery,
  useCreateRemiseItemMutation,
  useUpdateRemiseItemMutation,
  useDeleteRemiseItemMutation,
  useGetRemiseBonsQuery,
} = remisesApi;
