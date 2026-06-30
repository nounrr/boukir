import { api } from './apiSlice';

export type TransferDirection = 'VERS_DEPOT' | 'VERS_STOCK';

export interface DepotStockRow {
  depot_stock_snapshot_id: number;
  product_id: number;
  id: number;
  designation: string;
  variant_id?: number | null;
  variant_name?: string | null;
  product_snapshot_id?: number;
  snapshot_id: number;
  bon_commande_id?: number | null;
  depot_quantite: number;
  stock_normal_quantite: number;
  prix_achat: number;
  cout_revient: number;
  prix_gros: number;
  prix_vente: number;
  prix_vente_2?: number;
  image_url?: string | null;
  base_unit?: string | null;
  categorie_id?: number | null;
  categorie_nom?: string | null;
  est_service?: boolean;
  non_stockable?: boolean;
  units?: Array<{ id: number; unit_name: string; conversion_factor: number; is_default?: boolean | number }>;
}

export interface TransferProduct {
  product_snapshot_id?: number | null;
  depot_stock_snapshot_id?: number | null;
  source_kind: 'SNAPSHOT' | 'PRODUCT' | 'VARIANT';
  source_key: number;
  product_id: number;
  variant_id?: number | null;
  designation: string;
  variant_name?: string | null;
  quantite_disponible: number;
  prix_achat: number;
  cout_revient: number;
  prix_gros: number;
  prix_vente: number;
  bon_commande_id?: number | null;
  units?: Array<{ id: number; unit_name: string; conversion_factor: number; is_default?: boolean | number }>;
}

export interface StockTransferBon {
  id: number;
  numero: string;
  direction: TransferDirection;
  statut: 'Validé' | 'Annulé';
  date_creation: string;
  note?: string | null;
  created_by_nom?: string | null;
  items: Array<{
    id: number;
    designation: string;
    variant_name?: string | null;
    quantite: number;
    quantite_base: number;
  }>;
}

const stockDepotApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getDepot2Stock: builder.query<
      { data: DepotStockRow[]; meta: { total: number; page: number; limit: number; totalPages: number } },
      { page?: number; limit?: number; q?: string }
    >({
      query: (params) => ({ url: '/stock-depot/depot-2/stock', params }),
      providesTags: ['DepotStock'],
    }),

    getDepotTransferProducts: builder.query<TransferProduct[], { direction: TransferDirection; q?: string; limit?: number }>({
      query: (params) => ({ url: '/stock-depot/depot-2/transfer-products', params }),
      providesTags: ['DepotStock', 'Product'],
    }),

    getStockTransfers: builder.query<StockTransferBon[], { direction?: TransferDirection } | void>({
      query: (params) => ({ url: '/stock-depot/transferts', params: params || undefined }),
      providesTags: ['DepotStock'],
    }),

    createStockTransfer: builder.mutation<
      { success: boolean; id: number; numero: string },
      {
        direction: TransferDirection;
        date_creation?: string;
        note?: string;
        items: Array<{ product_snapshot_id?: number | null; source_kind: 'SNAPSHOT' | 'PRODUCT' | 'VARIANT'; source_key: number; unit_id?: number | null; quantite: number }>;
      }
    >({
      query: (body) => ({
        url: '/stock-depot/transferts',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['DepotStock', 'Product'],
    }),

    cancelStockTransfer: builder.mutation<{ success: boolean }, number>({
      query: (id) => ({
        url: `/stock-depot/transferts/${id}/annuler`,
        method: 'PATCH',
      }),
      invalidatesTags: ['DepotStock', 'Product'],
    }),
  }),
});

export const {
  useGetDepot2StockQuery,
  useGetDepotTransferProductsQuery,
  useGetStockTransfersQuery,
  useCreateStockTransferMutation,
  useCancelStockTransferMutation,
} = stockDepotApi;
