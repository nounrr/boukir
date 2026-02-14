// API unifiée pour maintenir la compatibilité avec le frontend existant
import { apiSlice } from './apiSlice';

export const bonsUnifiedApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Récupérer tous les bons d'un type spécifique
    getBonsByType: builder.query({
      queryFn: async (type, _queryApi, _extraOptions, fetchWithBQ) => {
        let endpoint = '';
        let tagType = '';
        
        switch (type) {
          case 'Commande':
            endpoint = '/commandes';
            tagType = 'Commande';
            break;
          case 'Sortie':
            endpoint = '/sorties';
            tagType = 'Sortie';
            break;
          case 'Comptant':
            endpoint = '/comptant';
            tagType = 'Comptant';
            break;
          case 'Devis':
            endpoint = '/devis';
            tagType = 'Devis';
            break;
          default:
            return { error: { status: 400, data: { message: 'Type de bon invalide' } } };
        }
        
        const result = await fetchWithBQ(endpoint);
        return result.data ? { data: result.data } : { error: result.error };
      },
      providesTags: (_result, _error, type) => {
        switch (type) {
          case 'Commande':
            return ['Commande'];
          case 'Sortie':
            return ['Sortie'];
          case 'Comptant':
            return ['Comptant'];
          case 'Devis':
            return ['Devis'];
          default:
            return [];
        }
      }
    }),

    // Créer un nouveau bon selon son type
    createBonByType: builder.mutation({
      queryFn: async ({ type, ...bonData }, _queryApi, _extraOptions, fetchWithBQ) => {
        let endpoint = '';
        let tagType = '';
        
        switch (type) {
          case 'Commande':
            endpoint = '/commandes';
            tagType = 'Commande';
            break;
          case 'Sortie':
            endpoint = '/sorties';
            tagType = 'Sortie';
            break;
          case 'Comptant':
            endpoint = '/comptant';
            tagType = 'Comptant';
            break;
          case 'Devis':
            endpoint = '/devis';
            tagType = 'Devis';
            break;
          default:
            return { error: { status: 400, data: { message: 'Type de bon invalide' } } };
        }
        
        const result = await fetchWithBQ({
          url: endpoint,
          method: 'POST',
          body: bonData
        });
        
        return result.data ? { data: result.data } : { error: result.error };
      },
      invalidatesTags: (_result, _error, { type }) => {
        const tags: any[] = [
          { type: 'Bon', id: 'LIST' },
          { type: 'Product', id: 'LIST' },
          'Contact',
        ];
        switch (type) {
          case 'Commande':
            tags.push('Commande', { type: 'Commande', id: 'LIST' });
            break;
          case 'Sortie':
            tags.push('Sortie', { type: 'Sortie', id: 'LIST' });
            break;
          case 'Comptant':
            tags.push('Comptant', { type: 'Comptant', id: 'LIST' });
            break;
          case 'Devis':
            tags.push('Devis', { type: 'Devis', id: 'LIST' });
            break;
        }
        return tags;
      }
    }),

    // Mettre à jour un bon selon son type
    updateBonByType: builder.mutation({
      queryFn: async ({ id, type, ...bonData }, _queryApi, _extraOptions, fetchWithBQ) => {
        let endpoint = '';
        let tagType = '';
        
        switch (type) {
          case 'Commande':
            endpoint = `/commandes/${id}`;
            tagType = 'Commande';
            break;
          case 'Sortie':
            endpoint = `/sorties/${id}`;
            tagType = 'Sortie';
            break;
          case 'Comptant':
            endpoint = `/comptant/${id}`;
            tagType = 'Comptant';
            break;
          case 'Devis':
            endpoint = `/devis/${id}`;
            tagType = 'Devis';
            break;
          default:
            return { error: { status: 400, data: { message: 'Type de bon invalide' } } };
        }
        
        const result = await fetchWithBQ({
          url: endpoint,
          method: 'PUT',
          body: bonData
        });
        
        return result.data ? { data: result.data } : { error: result.error };
      },
      invalidatesTags: (_result, _error, { id, type }) => {
        const tags: any[] = [
          { type: 'Bon', id },
          { type: 'Bon', id: 'LIST' },
          { type: 'Product', id: 'LIST' },
          'Contact',
        ];
        switch (type) {
          case 'Commande':
            tags.push({ type: 'Commande', id }, 'Commande');
            break;
          case 'Sortie':
            tags.push({ type: 'Sortie', id }, 'Sortie');
            break;
          case 'Comptant':
            tags.push({ type: 'Comptant', id }, 'Comptant');
            break;
          case 'Devis':
            tags.push({ type: 'Devis', id }, 'Devis');
            break;
        }
        return tags;
      }
    }),

    // Supprimer un bon selon son type
    deleteBonByType: builder.mutation({
      queryFn: async ({ id, type }, _queryApi, _extraOptions, fetchWithBQ) => {
        let endpoint = '';
        let tagType = '';
        
        switch (type) {
          case 'Commande':
            endpoint = `/commandes/${id}`;
            tagType = 'Commande';
            break;
          case 'Sortie':
            endpoint = `/sorties/${id}`;
            tagType = 'Sortie';
            break;
          case 'Comptant':
            endpoint = `/comptant/${id}`;
            tagType = 'Comptant';
            break;
          case 'Devis':
            endpoint = `/devis/${id}`;
            tagType = 'Devis';
            break;
          default:
            return { error: { status: 400, data: { message: 'Type de bon invalide' } } };
        }
        
        const result = await fetchWithBQ({
          url: endpoint,
          method: 'DELETE'
        });
        
        return result.data ? { data: result.data } : { error: result.error };
      },
      invalidatesTags: (_result, _error, { id, type }) => {
        const tags: any[] = [
          { type: 'Bon', id },
          { type: 'Bon', id: 'LIST' },
          { type: 'Product', id: 'LIST' },
          'Contact',
        ];
        switch (type) {
          case 'Commande':
            tags.push({ type: 'Commande', id }, 'Commande');
            break;
          case 'Sortie':
            tags.push({ type: 'Sortie', id }, 'Sortie');
            break;
          case 'Comptant':
            tags.push({ type: 'Comptant', id }, 'Comptant');
            break;
          case 'Devis':
            tags.push({ type: 'Devis', id }, 'Devis');
            break;
        }
        return tags;
      }
    })
  })
});

// Export des hooks pour maintenir la compatibilité
export const {
  useGetBonsByTypeQuery,
  useCreateBonByTypeMutation,
  useUpdateBonByTypeMutation,
  useDeleteBonByTypeMutation
} = bonsUnifiedApi;
