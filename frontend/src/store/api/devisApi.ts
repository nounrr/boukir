import { apiSlice } from './apiSlice';

export const devisApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Récupérer tous les devis
    getDevis: builder.query({
      query: () => '/devis',
      providesTags: ['Devis']
    }),

    // Récupérer un devis par ID
    getDevisById: builder.query({
      query: (id) => `/devis/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Devis', id }]
    }),

    // Créer un nouveau devis
    createDevis: builder.mutation({
      query: (devisData) => ({
        url: '/devis',
        method: 'POST',
        body: devisData
      }),
      invalidatesTags: ['Devis']
    }),

    // Mettre à jour un devis
    updateDevis: builder.mutation({
      query: ({ id, ...devisData }) => ({
        url: `/devis/${id}`,
        method: 'PUT',
        body: devisData
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Devis', id },
        'Devis'
      ]
    }),

    // Supprimer un devis
    deleteDevis: builder.mutation({
      query: ({ id }) => ({
        url: `/devis/${id}`,
        method: 'DELETE'
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Devis', id },
        'Devis'
      ]
    }),

    // Transformer un devis en bon de sortie
    transformDevis: builder.mutation({
      query: ({ id, created_by }) => ({
        url: `/devis/${id}/transform`,
        method: 'POST',
        body: { created_by }
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Devis', id },
        'Devis',
        'Sortie'
      ]
    })
  })
});

// Export des hooks
export const {
  useGetDevisQuery,
  useGetDevisByIdQuery,
  useCreateDevisMutation,
  useUpdateDevisMutation,
  useDeleteDevisMutation,
  useTransformDevisMutation
} = devisApi;
