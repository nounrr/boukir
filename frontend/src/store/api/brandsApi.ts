import { apiSlice } from './apiSlice';
import type { Brand } from '../../types';

export const brandsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getBrands: builder.query<Brand[], void>({
      query: () => ({ url: '/brands' }),
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'Brand' as const, id })),
              { type: 'Brand' as const, id: 'LIST' },
            ]
          : [{ type: 'Brand' as const, id: 'LIST' }],
    }),
    getBrandById: builder.query<Brand, number>({
      query: (id) => ({ url: `/brands/${id}` }),
      providesTags: (_res, _err, id) => [{ type: 'Brand', id }],
    }),
    createBrand: builder.mutation<Brand, FormData>({
      query: (body) => ({ url: '/brands', method: 'POST', body }),
      invalidatesTags: [{ type: 'Brand', id: 'LIST' }, 'Brand'],
    }),
    updateBrand: builder.mutation<Brand, { id: number; data: FormData }>({
      query: ({ id, data }) => ({ url: `/brands/${id}`, method: 'PUT', body: data }),
      invalidatesTags: (_res, _err, { id }) => [
        { type: 'Brand', id },
        { type: 'Brand', id: 'LIST' },
      ],
    }),
    deleteBrand: builder.mutation<{ success: boolean }, { id: number }>({
      query: ({ id }) => ({ url: `/brands/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Brand', id: 'LIST' }, 'Brand'],
    }),
  }),
});

export const {
  useGetBrandsQuery,
  useGetBrandByIdQuery,
  useCreateBrandMutation,
  useUpdateBrandMutation,
  useDeleteBrandMutation,
} = brandsApi;
