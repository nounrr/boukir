import { api } from './apiSlice';
import type { Bon, CreateBonData } from '../../types';

export const bonsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getBons: builder.query<Bon[], void>({
      query: () => '/bons',
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Bon' as const, id })), { type: 'Bon', id: 'LIST' }]
          : [{ type: 'Bon', id: 'LIST' }],
    }),
    
    // Récupérer les bons par type
    getBonsByType: builder.query<Bon[], string>({
      query: (type) => {
        switch (type) {
          case 'Commande':
            return '/commandes';
          case 'Sortie':
            return '/sorties';
          case 'Comptant':
            return '/comptant';
          case 'Devis':
            return '/devis';
          case 'Avoir':
            return '/avoirs_client';
          case 'AvoirFournisseur':
            return '/avoirs_fournisseur';
          default:
            throw new Error('Type de bon invalide');
        }
      },
      // Certains endpoints backend ne renvoient pas le champ `type`.
      // On l'injecte côté client pour éviter que l'UI filtre tout à vide.
      transformResponse: (response: any, _meta, type) => {
        const list: any[] = Array.isArray(response) ? response : (response?.data ?? []);
        return list.map((bon) => ({ ...bon, type }));
      },
      providesTags: (result, _error, type) => {
        const tagType = type as 'Commande' | 'Sortie' | 'Comptant' | 'Devis' | 'AvoirClient' | 'AvoirFournisseur';
        let actualTagType = tagType;
        
        // Mapping des types frontend vers les types de tags
        if (type === 'Avoir') actualTagType = 'AvoirClient' as any;
        
        return result
          ? [...result.map(({ id }) => ({ type: actualTagType, id })), { type: actualTagType, id: 'LIST' }]
          : [{ type: actualTagType, id: 'LIST' }];
      }
    }),
    
    getBon: builder.query<Bon, number>({
      query: (id) => `/bons/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Bon', id }],
    }),
    
    // Créer un bon
    createBon: builder.mutation<any, CreateBonData>({
      query: (bonData: any) => {
        const { type, ...data } = bonData;
        let endpoint = '';
        
        switch (type) {
          case 'Commande':
            endpoint = '/commandes';
            break;
          case 'Sortie':
            endpoint = '/sorties';
            break;
          case 'Comptant':
            endpoint = '/comptant';
            break;
          case 'Devis':
            endpoint = '/devis';
            break;
          case 'Avoir':
            endpoint = '/avoirs_client';
            break;
          case 'AvoirFournisseur':
            endpoint = '/avoirs_fournisseur';
            break;
          default:
            throw new Error('Type de bon invalide');
        }
        
        return {
          url: endpoint,
          method: 'POST',
          body: data
        };
      },
      invalidatesTags: (_result, _error, bonData: any) => {
        const type = bonData.type;
        switch (type) {
          case 'Commande':
            return [{ type: 'Commande', id: 'LIST' }];
          case 'Sortie':
            return [{ type: 'Sortie', id: 'LIST' }];
          case 'Comptant':
            return [{ type: 'Comptant', id: 'LIST' }];
          case 'Devis':
            return [{ type: 'Devis', id: 'LIST' }];
          case 'Avoir':
            return [{ type: 'AvoirClient', id: 'LIST' }];
          case 'AvoirFournisseur':
            return [{ type: 'AvoirFournisseur', id: 'LIST' }];
          default:
            return [];
        }
      }
    }),
    
    updateBon: builder.mutation<Bon, Partial<Bon> & { id: number; type?: string }>({
      query: ({ id, type, ...bonData }) => {
        let endpoint = '';
        switch (type) {
          case 'Commande':
            endpoint = `/commandes/${id}`;
            break;
          case 'Sortie':
            endpoint = `/sorties/${id}`;
            break;
          case 'Comptant':
            endpoint = `/comptant/${id}`;
            break;
          case 'Devis':
            endpoint = `/devis/${id}`;
            break;
          case 'Avoir':
            endpoint = `/avoirs_client/${id}`;
            break;
          case 'AvoirFournisseur':
            endpoint = `/avoirs_fournisseur/${id}`;
            break;
          default:
            endpoint = `/bons/${id}`;
        }
        return {
          url: endpoint,
          method: 'PUT',
          body: bonData,
        };
      },
      invalidatesTags: (_result, _error, { id, type }) => {
        const tagType = type as any || 'Bon';
        const actualTagType = type === 'Avoir' ? 'AvoirClient' : tagType;
        return [
          { type: actualTagType, id },
          { type: actualTagType, id: 'LIST' }
        ];
      },
    }),
    
    deleteBon: builder.mutation<{ success: boolean; id: number }, { id: number; type: string }>({
      query: ({ id, type }) => {
        let endpoint = '';
        switch (type) {
          case 'Commande':
            endpoint = `/commandes/${id}`;
            break;
          case 'Sortie':
            endpoint = `/sorties/${id}`;
            break;
          case 'Comptant':
            endpoint = `/comptant/${id}`;
            break;
          case 'Devis':
            endpoint = `/devis/${id}`;
            break;
          case 'Avoir':
            endpoint = `/avoirs_client/${id}`;
            break;
          case 'AvoirFournisseur':
            endpoint = `/avoirs_fournisseur/${id}`;
            break;
          default:
            endpoint = `/bons/${id}`;
        }
        return {
          url: endpoint,
          method: 'DELETE',
        };
      },
      invalidatesTags: (_result, _error, { id, type }) => {
        let tagType: any = type || 'Bon';
        if (type === 'Avoir') tagType = 'AvoirClient';
        return [
          { type: tagType, id },
          { type: tagType, id: 'LIST' }
        ];
      },
    }),

    // Pour changer le statut d'un bon (Valider, Annuler, etc.)
    updateBonStatus: builder.mutation<Bon, { id: number; statut: string; type?: string }>({
      query: ({ id, statut, type }) => {
        let endpoint = '';
        switch (type) {
          case 'Commande':
            endpoint = `/commandes/${id}/statut`;
            break;
          case 'Sortie':
            endpoint = `/sorties/${id}/statut`;
            break;
          case 'Comptant':
            endpoint = `/comptant/${id}/statut`;
            break;
          case 'Devis':
            endpoint = `/devis/${id}/statut`;
            break;
          case 'Avoir':
            endpoint = `/avoirs_client/${id}/statut`;
            break;
          case 'AvoirFournisseur':
            endpoint = `/avoirs_fournisseur/${id}/statut`;
            break;
          default:
            endpoint = `/bons/${id}/statut`;
        }
        return {
          url: endpoint,
          method: 'PATCH',
          body: { statut },
        };
      },
      invalidatesTags: (_result, _error, { id, type }) => {
        const tagType = type as any || 'Bon';
        const actualTagType = type === 'Avoir' ? 'AvoirClient' : tagType;
        return [
          { type: actualTagType, id },
          { type: actualTagType, id: 'LIST' }
        ];
      },
    }),

    // Transformer un devis vers Sortie/Comptant/Commande
    transformDevis: builder.mutation<
      any,
      { id: number } & {
        target_type?: 'Sortie' | 'Comptant' | 'Commande';
        target?: 'sortie' | 'comptant' | 'commande';
        client_id?: number | null;
        fournisseur_id?: number | null;
        vehicule_id?: number | null;
        lieu_chargement?: string | null;
        created_by: number;
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/devis/${id}/transform`,
        method: 'POST',
        body,
      }),
      // Invalidate lists so UI refreshes without full reload
      invalidatesTags: () => [
        // Object LIST tags for endpoints that use id-based providesTags
        { type: 'Devis', id: 'LIST' },
        { type: 'Sortie', id: 'LIST' },
        { type: 'Comptant', id: 'LIST' },
        { type: 'Commande', id: 'LIST' },
        // Simple string tags for endpoints that provide only the type
        'Devis',
        'Sortie',
        'Comptant',
        'Commande',
      ],
    }),

    // Marquer un bon comme Avoir (crée un avoir lié et change le statut du bon)
    markBonAsAvoir: builder.mutation<
      any,
      { id: number; type: 'Sortie' | 'Comptant' | 'Commande'; created_by: number }
    >({
      query: ({ id, type, created_by }) => {
        let endpoint = '';
        switch (type) {
          case 'Sortie':
            endpoint = `/sorties/${id}/mark-avoir`;
            break;
          case 'Comptant':
            endpoint = `/comptant/${id}/mark-avoir`;
            break;
          case 'Commande':
            endpoint = `/commandes/${id}/mark-avoir`;
            break;
          default:
            throw new Error('Type non supporté pour mark-avoir');
        }
        return { url: endpoint, method: 'POST', body: { created_by } };
      },
      invalidatesTags: (_result, _error, { type }) => {
        const tags: any[] = [];
        // Invalidate source list and avoirs list
        if (type === 'Sortie') tags.push({ type: 'Sortie', id: 'LIST' }, { type: 'AvoirClient', id: 'LIST' });
        if (type === 'Comptant') tags.push({ type: 'Comptant', id: 'LIST' }, { type: 'AvoirClient', id: 'LIST' });
        if (type === 'Commande') tags.push({ type: 'Commande', id: 'LIST' }, { type: 'AvoirFournisseur', id: 'LIST' });
        return tags;
      },
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
  useTransformDevisMutation,
  useMarkBonAsAvoirMutation,
} = bonsApi;
