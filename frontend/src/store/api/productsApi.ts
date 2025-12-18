import { api } from './apiSlice';
import type { Product, CreateProductData } from '../../types';

// API réelle vers le backend Express (/api/products)
const productsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getProducts: builder.query<Product[], void>({
      query: () => ({ url: '/products' }),
      providesTags: ['Product'],
    }),

    getProduct: builder.query<Product, number>({
      query: (id) => ({ url: `/products/${id}` }),
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
      { ids: number[]; commit?: boolean; force?: boolean; models?: { clean?: string; translate?: string } }
    >({
      query: (body) => ({
        url: '/ai/products/translate',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Product'],
    }),
  }),
});

export const {
  useGetProductsQuery,
  useGetProductQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,
  useUpdateStockMutation,
  useGetArchivedProductsQuery,
  useRestoreProductMutation,
  useTranslateProductsMutation,
} = productsApi;
