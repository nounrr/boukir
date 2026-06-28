import { api } from './apiSlice';

export interface PriceSolverItem {
  commande_item_id: number;
  bon_commande_id: number;
  bon_numero: string;
  date_creation: string | null;
  statut: string | null;
  product_id: number;
  designation: string;
  item_variant_id: number | null;
  snapshot_variant_id: number | null;
  variant_id: number | null;
  variant_name: string | null;
  product_snapshot_id: number | null;
  quantite: number;
  quantite_snapshot: number | null;
  prix_achat_bon: number;
  remise_pourcentage: number;
  remise_montant: number;
  total: number;
  prix_achat_snapshot: number | null;
  cout_revient_snapshot: number | null;
  snapshot_cout_revient_pourcentage: number | null;
  prix_achat_affiche: number;
  label: string;
}

export interface PriceSolverGroup {
  product_id: number;
  variant_id: number | null;
  designation: string;
  variant_name: string | null;
  min_prix_achat: number;
  max_prix_achat: number;
  difference_prix: number;
  nb_points_prix: number;
  nb_bons_commande: number;
  nb_lignes_commande: number;
  items: PriceSolverItem[];
}

export interface PriceSolverResponse {
  threshold: number;
  data: PriceSolverGroup[];
}

export const pricePurchaseSolverApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getPricePurchaseAnomalies: builder.query<PriceSolverResponse, { threshold?: number; limit?: number }>({
      query: ({ threshold = 50, limit = 200 }) => ({
        url: '/price-purchase-solver/anomalies',
        params: { threshold, limit },
      }),
      providesTags: ['PricePurchaseSolver'],
    }),
    updateCommandeItemPrixAchat: builder.mutation<
      { message: string; commande_item_id: number; prix_achat: number; quantite: number; snapshot_quantite: number | null; total: number },
      { commandeItemId: number; prixAchat: number; quantite?: number; snapshotQuantite?: number; updateSnapshot?: boolean }
    >({
      query: ({ commandeItemId, prixAchat, quantite, snapshotQuantite, updateSnapshot = true }) => ({
        url: `/price-purchase-solver/commande-items/${commandeItemId}/prix-achat`,
        method: 'PATCH',
        body: {
          prix_achat: prixAchat,
          quantite,
          snapshot_quantite: snapshotQuantite,
          update_snapshot: updateSnapshot,
        },
      }),
      invalidatesTags: ['PricePurchaseSolver', 'Commande', 'Bon', 'Product'],
    }),
  }),
});

export const {
  useGetPricePurchaseAnomaliesQuery,
  useUpdateCommandeItemPrixAchatMutation,
} = pricePurchaseSolverApi;
