import { api } from './apiSlice';
import type { Product, CreateProductData, ProductFifoLayersResponse } from '../../types';

// API réelle vers le backend Express (/api/products)
const productsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getProducts: builder.query<Product[], void>({
      query: () => ({ url: '/products' }),
      providesTags: ['Product'],
    }),

    getProductsPaginated: builder.query<{ data: Product[]; meta: { total: number; page: number; limit: number; totalPages: number } }, { page: number; limit: number; q?: string; category_id?: number | string; brand_id?: number | string; missing_lang?: string }>({
      query: (params) => ({
        url: '/products/search',
        params,
      }),
      providesTags: ['Product'],
    }),

    getProduct: builder.query<Product, number>({
      query: (id) => ({ url: `/products/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'Product', id }],
    }),

    getProductFifoLayers: builder.query<ProductFifoLayersResponse, number>({
      query: (id) => ({ url: `/products/${id}/fifo-layers` }),
      providesTags: (_result, _error, id) => [{ type: 'Product', id }],
    }),

    createProduct: builder.mutation<Product, CreateProductData & { created_by: number }>({
      query: (body) => ({
        url: '/products',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Product'],
    }),

    updateProduct: builder.mutation<Product, { id: number; data: FormData | (Partial<Product> & { updated_by: number }) }>({
      query: ({ id, data }) => ({
        url: `/products/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Product', id }, 'Product'],
    }),

    deleteProduct: builder.mutation<{ success: boolean }, { id: number }>({
      query: ({ id }) => ({
        url: `/products/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Product'],
    }),

    updateStock: builder.mutation<Product, { id: number; quantite: number; updated_by?: number }>({
      query: ({ id, ...body }) => ({
        url: `/products/${id}/stock`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Product', id }, 'Product'],
    }),

    // archived (soft-deleted) products
    getArchivedProducts: builder.query<Partial<Product>[], void>({
      query: () => ({ url: '/products/archived/list' }),
      providesTags: ['Product'],
    }),
    restoreProduct: builder.mutation<Product, { id: number }>({
      query: ({ id }) => ({
        url: `/products/${id}/restore`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Product', id }, 'Product'],
    }),

    translateProducts: builder.mutation<
      { ok: boolean; results: any[] },
      {
        ids?: number[];
        commit?: boolean;
        force?: boolean;
        models?: { clean?: string; translate?: string };
        includeVariants?: boolean;
        variantIds?: number[];
      }
    >({
      query: (body) => ({
        url: '/ai/products/translate',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Product'],
    }),

    generateSpecs: builder.mutation<
      { ok: boolean; results: any[] },
      { ids: number[]; force?: boolean; model?: string; translate?: boolean }
    >({
      query: (body) => ({
        url: '/ai/products/generate-specs',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Product'],
    }),
  }),
});

export const {
  useGetProductsQuery,
  useGetProductsPaginatedQuery,
  useGetProductQuery,
  useGetProductFifoLayersQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,
  useUpdateStockMutation,
  useGetArchivedProductsQuery,
  useRestoreProductMutation,
  useTranslateProductsMutation,
  useGenerateSpecsMutation,
} = productsApi;
