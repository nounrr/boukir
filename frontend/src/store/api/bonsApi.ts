import { api } from './apiSlice';
import type { Bon } from '../../types';

// Shared union for bon-like types including new AvoirComptant
type AnyBonType = 'Commande' | 'Sortie' | 'Comptant' | 'Devis' | 'Avoir' | 'AvoirFournisseur' | 'AvoirComptant' | 'Vehicule' | 'Ecommerce';

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
            return '/sorties?includeCalc=1';
          case 'Comptant':
            return '/comptant?includeCalc=1';
          case 'Devis':
            return '/devis';
          case 'Avoir':
            return '/avoirs_client';
          case 'AvoirFournisseur':
            return '/avoirs_fournisseur';
          case 'AvoirComptant':
            return '/avoirs_comptant';
          case 'Vehicule':
            return '/bons_vehicule';
          case 'Ecommerce':
            return '/ecommerce/orders';
          default:
            throw new Error('Type de bon invalide');
        }
      },
      // Certains endpoints backend ne renvoient pas le champ `type`.
      // On l'injecte côté client pour éviter que l'UI filtre tout à vide.
      transformResponse: (response: any, _meta, type) => {
        if (type === 'Ecommerce') {
          const orders = response?.orders || [];
          return orders.map((o: any) => ({
            id: o.id,
            type: 'Ecommerce',
            numero: o.order_number,
            date_creation: o.created_at || o.confirmed_at,
            created_at: o.created_at || o.confirmed_at || new Date().toISOString(),
            updated_at: o.updated_at || o.created_at || o.confirmed_at || new Date().toISOString(),
            client_nom: o.customer_name,
            customer_email: o.customer_email || o.email,
            phone: o.customer_phone,
            adresse_livraison: o.shipping_address?.city
              ? `${o.shipping_address.line1 || ''}${o.shipping_address.line2 ? `, ${o.shipping_address.line2}` : ''}, ${o.shipping_address.city}`
              : (o.shipping_address?.line1 || o.shipping_address_line1 || ''),
            montant_total: Number(o.total_amount || 0),
            // Keep raw e-commerce order status values for consistent UI/actions
            statut: o.status || 'pending',
            ecommerce_status: o.status || 'pending',
            items: (o.items || []).map((i: any) => ({
              id: i.id,
              bon_id: o.id,
              produit_id: i.product_id,
              quantite: Number(i.quantity),
              prix_unitaire: Number(i.unit_price),
              montant_ligne: Number(i.subtotal),
              designation_custom: i.product_name,
              produit: { 
                id: i.product_id, 
                designation: i.product_name, 
                designation_ar: i.product_name_ar 
              }
            })),
            is_solde: o.payment_method === 'solde' || !!o.solde_amount,
            payment_method: o.payment_method,
            payment_status: o.payment_status,
            delivery_method: o.delivery_method,
            pickup_location_id: o.pickup_location_id,
            pickup_location: o.pickup_location_id ? { id: o.pickup_location_id } : null
          }));
        }
        const list: any[] = Array.isArray(response) ? response : (response?.data ?? []);
        return list.map((bon) => ({ ...bon, type }));
      },
      providesTags: (result, _error, type) => {
        let actual: any = type;
        if (type === 'Avoir') actual = 'AvoirClient';
        else if (type === 'AvoirComptant') actual = 'AvoirComptant';
        return result
          ? [...result.map(({ id }) => ({ type: actual, id })), { type: actual, id: 'LIST' }]
          : [{ type: actual, id: 'LIST' }];
      }
    }),
    
    getBon: builder.query<Bon, number>({
      query: (id) => `/bons/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Bon', id }],
    }),
    
    // Créer un bon
  createBon: builder.mutation<any, any>({
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
          case 'AvoirComptant':
            endpoint = '/avoirs_comptant';
            break;
          case 'Vehicule':
            endpoint = '/bons_vehicule';
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
        const type = bonData.type as AnyBonType;
        const tags: any[] = [{ type: 'Product', id: 'LIST' }]; // Invalider les produits pour mettre à jour le stock
        
        switch (type) {
          case 'Commande':
            tags.push({ type: 'Commande', id: 'LIST' });
            break;
          case 'Sortie':
            tags.push({ type: 'Sortie', id: 'LIST' });
            break;
          case 'Comptant':
            tags.push({ type: 'Comptant', id: 'LIST' });
            break;
          case 'Devis':
            tags.push({ type: 'Devis', id: 'LIST' });
            break;
          case 'Avoir':
            tags.push({ type: 'AvoirClient', id: 'LIST' });
            break;
          case 'AvoirFournisseur':
            tags.push({ type: 'AvoirFournisseur', id: 'LIST' });
            break;
          case 'AvoirComptant':
            tags.push({ type: 'AvoirComptant', id: 'LIST' });
            break;
          case 'Vehicule':
            tags.push({ type: 'Vehicule', id: 'LIST' });
            break;
        }
        
        return tags;
      }
    }),
    
  updateBon: builder.mutation<Bon, Partial<Bon> & { id: number; type?: AnyBonType }>({
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
          case 'AvoirComptant':
            endpoint = `/avoirs_comptant/${id}`;
            break;
          case 'Vehicule':
            endpoint = `/bons_vehicule/${id}`;
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
        let actualTagType: any = (type as AnyBonType) || 'Bon';
        if (type === 'Avoir') actualTagType = 'AvoirClient';
        else if ((type as any) === 'AvoirComptant') actualTagType = 'AvoirComptant';
        return [
          { type: actualTagType, id },
          { type: actualTagType, id: 'LIST' },
          { type: 'Bon', id },
          { type: 'Bon', id: 'LIST' },
          { type: 'Product', id: 'LIST' } // Invalider les produits pour mettre à jour le stock
        ];
      },
    }),
    
  deleteBon: builder.mutation<{ success: boolean; id: number }, { id: number; type: AnyBonType }>({
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
          case 'Vehicule':
            endpoint = `/bons_vehicule/${id}`;
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
        else if ((type as any) === 'AvoirComptant') tagType = 'AvoirComptant';
        return [
          { type: tagType, id },
          { type: tagType, id: 'LIST' },
          { type: 'Product', id: 'LIST' } // Invalider les produits pour mettre à jour le stock
        ];
      },
    }),

    // Pour changer le statut d'un bon (Valider, Annuler, etc.)
  updateBonStatus: builder.mutation<Bon, { id: number; statut: string; type?: AnyBonType }>({
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
          case 'AvoirComptant':
            endpoint = `/avoirs_comptant/${id}/statut`;
            break;
          case 'Vehicule':
            endpoint = `/bons_vehicule/${id}/statut`;
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
        let actualTagType: any = (type as AnyBonType) || 'Bon';
        if (type === 'Avoir') actualTagType = 'AvoirClient';
        else if ((type as any) === 'AvoirComptant') actualTagType = 'AvoirComptant';
        return [
          { type: actualTagType, id },
          { type: actualTagType, id: 'LIST' },
          { type: 'Bon', id },
          { type: 'Bon', id: 'LIST' },
          { type: 'Product', id: 'LIST' } // Invalider les produits pour mettre à jour le stock et prix
        ];
      },
    }),

    // E-commerce: update order status (admin)
    updateEcommerceOrderStatus: builder.mutation<
      any,
      { id: number; status?: string; payment_status?: string; admin_notes?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/ecommerce/orders/${id}/status`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Ecommerce', id },
        { type: 'Ecommerce', id: 'LIST' },
      ],
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
        numero?: string;
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

// Explicit re-export (avoids occasional TS server cache issues)
export const useUpdateEcommerceOrderStatusMutation = bonsApi.useUpdateEcommerceOrderStatusMutation;
