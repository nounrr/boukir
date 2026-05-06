import { api } from './apiSlice';

export const remisesApi = api.injectEndpoints({
  endpoints: (build) => ({
    getClientRemises: build.query<any[], void>({
      query: () => '/remises/clients',
      providesTags: (r) => [{ type: 'Remise', id: 'LIST' }, ...(r || []).map((x: any) => ({ type: 'Remise' as const, id: x.id }))],
    }),
    getClientAbonneByContact: build.query<any, number>({
      query: (contactId) => `/remises/clients/by-contact/${contactId}`,
      providesTags: (_r, _e, contactId) => [{ type: 'Remise', id: `CONTACT-${contactId}` }],
    }),
    getRemisePaymentAccounts: build.query<any[], { onlyAvailable?: boolean; types?: string[] } | void>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params?.onlyAvailable) searchParams.set('onlyAvailable', '1');
        if (params?.types?.length) searchParams.set('types', params.types.join(','));
        const suffix = searchParams.toString();
        return `/remises/payment-accounts${suffix ? `?${suffix}` : ''}`;
      },
      providesTags: [{ type: 'Remise', id: 'LIST' }],
    }),
    getAncienRemisesAbonnes: build.query<any[], void>({
      query: () => '/remises/anciens-abonnes',
      providesTags: [{ type: 'Remise', id: 'ANCIENS-ABONNES' }],
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

    getDirectContactRemiseBalances: build.query<any[], void>({
      query: () => '/remises/direct-contact-balances',
      providesTags: [{ type: 'Remise', id: 'LIST' }],
    }),

    getContactRemiseItems: build.query<any[], number>({
      query: (contactId) => `/remises/contact/${contactId}/items`,
      providesTags: (_r, _e, contactId) => [{ type: 'RemiseItem', id: `CONTACT-${contactId}` }],
    }),
    createContactRemiseItem: build.mutation<any, { contactId: number; data: Partial<any> }>({
      query: ({ contactId, data }) => ({ url: `/remises/contact/${contactId}/items`, method: 'POST', body: data }),
      invalidatesTags: (_r, _e, { contactId }) => [{ type: 'RemiseItem', id: `CONTACT-${contactId}` }],
    }),
    updateContactRemiseItem: build.mutation<any, { id: number; data: Partial<any> }>({
      query: ({ id, data }) => ({ url: `/remises/contact-items/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'RemiseItem', id: `CONTACT-ITEM-${id}` }],
    }),
    deleteContactRemiseItem: build.mutation<any, { id: number; contactId: number }>({
      query: ({ id }) => ({ url: `/remises/contact-items/${id}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, { contactId }) => [{ type: 'RemiseItem', id: `CONTACT-${contactId}` }],
    }),
  }),
});

export const {
  useGetClientRemisesQuery,
  useGetClientAbonneByContactQuery,
  useGetRemisePaymentAccountsQuery,
  useGetAncienRemisesAbonnesQuery,
  useLazyGetClientAbonneByContactQuery,
  useGetDirectContactRemiseBalancesQuery,
  useCreateClientRemiseMutation,
  useUpdateClientRemiseMutation,
  useDeleteClientRemiseMutation,
  useGetRemiseItemsQuery,
  useCreateRemiseItemMutation,
  useUpdateRemiseItemMutation,
  useDeleteRemiseItemMutation,
  useGetRemiseBonsQuery,
  useGetContactRemiseItemsQuery,
  useCreateContactRemiseItemMutation,
  useUpdateContactRemiseItemMutation,
  useDeleteContactRemiseItemMutation,
} = remisesApi;
