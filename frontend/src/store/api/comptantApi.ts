import { apiSlice } from './apiSlice';

export const comptantApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Récupérer tous les bons comptant
    getComptant: builder.query({
      query: () => '/comptant',
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }: { id: number }) => ({ type: 'Comptant' as const, id })),
              { type: 'Comptant' as const, id: 'LIST' },
              'Comptant',
            ]
          : [{ type: 'Comptant' as const, id: 'LIST' }, 'Comptant']
    }),

    // Récupérer un bon comptant par ID
    getComptantById: builder.query({
      query: (id) => `/comptant/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Comptant', id }]
    }),

    getComptantPayments: builder.query({
      query: (id) => `/comptant/${id}/paiements`,
      providesTags: (_result, _error, id) => [
        { type: 'ComptantPayment', id },
        { type: 'Comptant', id }
      ]
    }),

    createComptantPayment: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/comptant/${id}/paiements`,
        method: 'POST',
        body
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'ComptantPayment', id },
        { type: 'Comptant', id },
        'Comptant'
      ]
    }),

    deleteComptantPayment: builder.mutation({
      query: ({ id, paymentId }) => ({
        url: `/comptant/${id}/paiements/${paymentId}`,
        method: 'DELETE'
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'ComptantPayment', id },
        { type: 'Comptant', id },
        'Comptant'
      ]
    }),

    // Créer un nouveau bon comptant
    createComptant: builder.mutation({
      query: (comptantData) => ({
        url: '/comptant',
        method: 'POST',
        body: comptantData
      }),
      invalidatesTags: ['Comptant']
    }),

    // Mettre à jour un bon comptant
    updateComptant: builder.mutation({
      query: ({ id, ...comptantData }) => ({
        url: `/comptant/${id}`,
        method: 'PUT',
        body: comptantData
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Comptant', id },
        'Comptant'
      ]
    }),

    // Supprimer un bon comptant
    deleteComptant: builder.mutation({
      query: ({ id }) => ({
        url: `/comptant/${id}`,
        method: 'DELETE'
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Comptant', id },
        'Comptant'
      ]
    })
  })
});

// Export des hooks
export const {
  useGetComptantQuery,
  useGetComptantByIdQuery,
  useGetComptantPaymentsQuery,
  useCreateComptantPaymentMutation,
  useDeleteComptantPaymentMutation,
  useCreateComptantMutation,
  useUpdateComptantMutation,
  useDeleteComptantMutation
} = comptantApi;
