import { apiSlice } from './apiSlice';

export const commandesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Récupérer toutes les commandes
    getCommandes: builder.query({
      query: () => '/commandes',
      providesTags: ['Commande']
    }),

    // Récupérer une commande par ID
    getCommande: builder.query({
      query: (id) => `/commandes/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Commande', id }]
    }),

    // Créer une nouvelle commande
    createCommande: builder.mutation({
      query: (commandeData) => ({
        url: '/commandes',
        method: 'POST',
        body: commandeData
      }),
      invalidatesTags: ['Commande']
    }),

    // Mettre à jour une commande
    updateCommande: builder.mutation({
      query: ({ id, ...commandeData }) => ({
        url: `/commandes/${id}`,
        method: 'PUT',
        body: commandeData
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Commande', id },
        'Commande'
      ]
    }),

    // Supprimer une commande
    deleteCommande: builder.mutation({
      query: ({ id }) => ({
        url: `/commandes/${id}`,
        method: 'DELETE'
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Commande', id },
        'Commande'
      ]
    })
  })
});

// Export des hooks
export const {
  useGetCommandesQuery,
  useGetCommandeQuery,
  useCreateCommandeMutation,
  useUpdateCommandeMutation,
  useDeleteCommandeMutation
} = commandesApi;
