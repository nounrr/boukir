import { apiSlice } from './apiSlice';
import type { Category, CreateCategoryData } from '../../types';

function toFormData(input: Record<string, any>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (value === null) {
      fd.append(key, '');
      continue;
    }
    if (value instanceof File) {
      fd.append(key, value);
      continue;
    }
    fd.append(key, String(value));
  }
  return fd;
}

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
      query: (body) => {
        const maybeBody = (body as any) || {};
        if (maybeBody.image instanceof File) {
          const { image, ...rest } = maybeBody;
          const fd = toFormData({ ...rest, image });
          return { url: '/categories', method: 'POST', body: fd };
        }
        return { url: '/categories', method: 'POST', body };
      },
      invalidatesTags: [{ type: 'Category', id: 'LIST' }, 'Category'],
    }),
    updateCategory: builder.mutation<Category, (Partial<Category> & { id: number; updated_by: number }) & { image?: File }>({
      query: ({ id, image, ...patch }) => {
        if (image instanceof File) {
          const fd = toFormData({ ...patch, image });
          return { url: `/categories/${id}`, method: 'PUT', body: fd };
        }
        return { url: `/categories/${id}`, method: 'PUT', body: patch };
      },
      invalidatesTags: (_res, _err, { id }) => [
        { type: 'Category', id },
        { type: 'Category', id: 'LIST' },
      ],
    }),
    generateCategoryImage: builder.mutation<Category, number>({
      query: (id) => ({ url: `/categories/${id}/generate-image`, method: 'POST' }),
      invalidatesTags: (_res, _err, id) => [
        { type: 'Category', id },
        { type: 'Category', id: 'LIST' },
      ],
    }),
    /** Image composed from our real products and brand logos (no AI). */
    composeCategoryImage: builder.mutation<Category & { cover_products?: number; cover_brands?: number }, number>({
      query: (id) => ({ url: `/categories/${id}/compose-image`, method: 'POST' }),
      invalidatesTags: (_res, _err, id) => [
        { type: 'Category', id },
        { type: 'Category', id: 'LIST' },
      ],
    }),
    reorderCategories: builder.mutation<Category[], { parent_id: number | null; ordered_ids: number[] }>({
      query: (body) => ({ url: '/categories/reorder', method: 'PUT', body }),
      async onQueryStarted({ parent_id, ordered_ids }, { dispatch, queryFulfilled }) {
        // Optimistic: move the rows immediately so the tree doesn't jump back during the request.
        const patch = dispatch(
          categoriesApi.util.updateQueryData('getCategories', undefined, (draft) => {
            const position = new Map(ordered_ids.map((id, index) => [id, index]));
            for (const cat of draft) {
              const index = position.get(cat.id);
              if (index !== undefined) {
                cat.parent_id = parent_id;
                cat.sort_order = index;
              }
            }
          })
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: [{ type: 'Category', id: 'LIST' }],
    }),
    deleteCategory: builder.mutation<{ success: boolean }, { id: number }>({
      query: ({ id }) => ({ url: `/categories/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Category', id: 'LIST' }, 'Category'],
    }),
    getCategoryUsage: builder.query<{ productCount: number; subcategoryCount: number; canDelete: boolean }, number>({
      query: (id) => ({ url: `/categories/${id}/usage` }),
    }),
  }),
});

export const {
  useGetCategoriesQuery,
  useGetCategoryByIdQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useGenerateCategoryImageMutation,
  useComposeCategoryImageMutation,
  useDeleteCategoryMutation,
  useReorderCategoriesMutation,
  useGetCategoryUsageQuery,
  useLazyGetCategoryUsageQuery,
} = categoriesApi;
