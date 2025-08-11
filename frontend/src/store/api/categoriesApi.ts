import { apiSlice } from './apiSlice';
import type { Category, CreateCategoryData } from '../../types';

export const categoriesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getCategories: builder.query<Category[], void>({
      query: () => ({ url: '/categories' }),
      providesTags: ['Category'],
    }),
    getCategoryById: builder.query<Category, number>({
      query: (id) => ({ url: `/categories/${id}` }),
      providesTags: (_res, _err, id) => [{ type: 'Category', id }],
    }),
    createCategory: builder.mutation<Category, CreateCategoryData & { created_by: number }>({
      query: (body) => ({ url: '/categories', method: 'POST', body }),
      invalidatesTags: ['Category'],
    }),
    updateCategory: builder.mutation<Category, Partial<Category> & { id: number; updated_by: number }>({
      query: ({ id, ...patch }) => ({ url: `/categories/${id}`, method: 'PUT', body: patch }),
      invalidatesTags: (_res, _err, { id }) => [{ type: 'Category', id }],
    }),
    deleteCategory: builder.mutation<{ success: boolean }, { id: number }>({
      query: ({ id }) => ({ url: `/categories/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Category'],
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
