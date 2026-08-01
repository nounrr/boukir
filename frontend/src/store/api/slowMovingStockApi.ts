import { api } from './apiSlice';

export interface SlowMovingStockSettings {
  lookbackMonths: number;
  salesThreshold: number;
  periodStart?: string | null;
}

export interface SlowMovingStockRow {
  product_id: number;
  variant_id: number | null;
  sku_type: 'parent' | 'variant';
  product_reference: string;
  reference_2: string | null;
  designation: string;
  variant_name: string | null;
  variant_reference: string | null;
  image_url: string | null;
  stock_current: number;
  sold_quantity: number;
  last_sale_at: string | null;
}

export interface SlowMovingStockResponse {
  data: SlowMovingStockRow[];
  settings: Required<SlowMovingStockSettings>;
  summary: {
    skuCount: number;
    productCount: number;
    totalStock: number;
    zeroSalesCount: number;
  };
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const slowMovingStockApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getSlowMovingStock: builder.query<
      SlowMovingStockResponse,
      { page?: number; limit?: number; q?: string }
    >({
      query: (params) => ({ url: '/slow-moving-stock', params }),
      providesTags: ['SlowMovingStock'],
    }),
    updateSlowMovingStockSettings: builder.mutation<
      Required<SlowMovingStockSettings>,
      Pick<SlowMovingStockSettings, 'lookbackMonths' | 'salesThreshold'>
    >({
      query: (body) => ({
        url: '/slow-moving-stock/settings',
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['SlowMovingStock'],
    }),
  }),
});

export const {
  useGetSlowMovingStockQuery,
  useUpdateSlowMovingStockSettingsMutation,
} = slowMovingStockApi;
