import { apiSlice } from './apiSlice';
import type { Category, CreateCategoryData } from '../../types';

export const categoriesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getCategories: builder.query<Category[], void>({
      query: () => ({ url: '/categories' }),
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'Category' as const, id })),
              { type: 'Category' as const, id: 'LIST' },
            ]
          : [{ type: 'Category' as const, id: 'LIST' }],
    }),
    getCategoryById: builder.query<Category, number>({
      query: (id) => ({ url: `/categories/${id}` }),
      providesTags: (_res, _err, id) => [{ type: 'Category', id }],
    }),
    createCategory: builder.mutation<Category, CreateCategoryData & { created_by: number }>({
      query: (body) => ({ url: '/categories', method: 'POST', body }),
      invalidatesTags: [{ type: 'Category', id: 'LIST' }, 'Category'],
    }),
    updateCategory: builder.mutation<Category, Partial<Category> & { id: number; updated_by: number }>({
      query: ({ id, ...patch }) => ({ url: `/categories/${id}`, method: 'PUT', body: patch }),
      invalidatesTags: (_res, _err, { id }) => [
        { type: 'Category', id },
        { type: 'Category', id: 'LIST' },
      ],
    }),
    deleteCategory: builder.mutation<{ success: boolean }, { id: number }>({
      query: ({ id }) => ({ url: `/categories/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Category', id: 'LIST' }, 'Category'],
    }),
  }),
});

export const {
  useGetCategoriesQuery,
  useGetCategoryByIdQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
} = categoriesApi;
