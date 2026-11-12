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

    getComptantPaymentVerificationAccess: builder.query<{ allowed: boolean }, void>({
      query: () => '/comptant/paiements/verification-access',
      providesTags: ['Auth', 'PagePermissions'],
    }),

    getComptantPaymentCompletion: builder.query<{ employee_id: number | null; employee_name: string | null; completed_at: string | null }, number>({
      query: id => `/comptant/${id}/paiements/verification-info`,
      keepUnusedDataFor: 0,
    }),

    verifyComptantPayment: builder.mutation<
      { bon: { id: number; reste: number; non_paye: number; montant_paye: number } },
      number
    >({
      query: (id) => ({
        url: `/comptant/${id}/paiements/verification`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'Comptant', id },
        'Comptant',
        'FondCaisse',
      ],
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
        'Comptant',
        'FondCaisse'
      ]
    }),

    updateComptantPayment: builder.mutation({
      query: ({ id, paymentId, ...body }) => ({
        url: `/comptant/${id}/paiements/${paymentId}`,
        method: 'PUT',
        body
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'ComptantPayment', id },
        { type: 'Comptant', id },
        'Comptant',
        'FondCaisse'
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
        'Comptant',
        'FondCaisse'
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
  useGetComptantPaymentVerificationAccessQuery,
  useVerifyComptantPaymentMutation,
  useLazyGetComptantPaymentCompletionQuery,
  useCreateComptantPaymentMutation,
  useUpdateComptantPaymentMutation,
  useDeleteComptantPaymentMutation,
  useCreateComptantMutation,
  useUpdateComptantMutation,
  useDeleteComptantMutation
} = comptantApi;
