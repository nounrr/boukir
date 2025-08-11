import { apiSlice } from './apiSlice';

export const sortiesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Récupérer toutes les sorties
    getSorties: builder.query({
      query: () => '/sorties',
      providesTags: ['Sortie']
    }),

    // Récupérer une sortie par ID
    getSortie: builder.query({
      query: (id) => `/sorties/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Sortie', id }]
    }),

    // Créer une nouvelle sortie
    createSortie: builder.mutation({
      query: (sortieData) => ({
        url: '/sorties',
        method: 'POST',
        body: sortieData
      }),
      invalidatesTags: ['Sortie']
    }),

    // Mettre à jour une sortie
    updateSortie: builder.mutation({
      query: ({ id, ...sortieData }) => ({
        url: `/sorties/${id}`,
        method: 'PUT',
        body: sortieData
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Sortie', id },
        'Sortie'
      ]
    }),

    // Supprimer une sortie
    deleteSortie: builder.mutation({
      query: ({ id }) => ({
        url: `/sorties/${id}`,
        method: 'DELETE'
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Sortie', id },
        'Sortie'
      ]
    })
  })
});

// Export des hooks
export const {
  useGetSortiesQuery,
  useGetSortieQuery,
  useCreateSortieMutation,
  useUpdateSortieMutation,
  useDeleteSortieMutation
} = sortiesApi;
