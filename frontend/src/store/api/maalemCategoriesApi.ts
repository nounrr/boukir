import { apiSlice } from './apiSlice';
import type { MaalemCategory, SaveMaalemCategoryData } from '../../types';

export type MaalemCategoryStatusFilter = 'all' | 'active' | 'inactive';

export interface MaalemCategoryFilters {
  status: MaalemCategoryStatusFilter;
  q?: string;
}

export type ActiveMaalemCategory = Pick<
  MaalemCategory,
  'id' | 'nom' | 'nom_ar' | 'description'
>;

export const maalemCategoriesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getMaalemCategories: builder.query<MaalemCategory[], MaalemCategoryFilters>({
      query: ({ status, q }) => ({
        url: '/admin/maalem-categories',
        params: { status, ...(q ? { q } : {}) },
      }),
      providesTags: (result) => result
        ? [
            ...result.map(({ id }) => ({ type: 'MaalemCategory' as const, id })),
            { type: 'MaalemCategory' as const, id: 'LIST' },
          ]
        : [{ type: 'MaalemCategory' as const, id: 'LIST' }],
    }),
    getActiveMaalemCategories: builder.query<ActiveMaalemCategory[], void>({
      query: () => ({ url: '/maalem-categories/active' }),
      providesTags: [{ type: 'MaalemCategory', id: 'ACTIVE' }],
    }),
    createMaalemCategory: builder.mutation<MaalemCategory, SaveMaalemCategoryData>({
      query: (body) => ({ url: '/admin/maalem-categories', method: 'POST', body }),
      invalidatesTags: [
        { type: 'MaalemCategory', id: 'LIST' },
        { type: 'MaalemCategory', id: 'ACTIVE' },
      ],
    }),
    updateMaalemCategory: builder.mutation<
      MaalemCategory,
      { id: number; data: SaveMaalemCategoryData }
    >({
      query: ({ id, data }) => ({
        url: `/admin/maalem-categories/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'MaalemCategory', id },
        { type: 'MaalemCategory', id: 'LIST' },
        { type: 'MaalemCategory', id: 'ACTIVE' },
      ],
    }),
    setMaalemCategoryStatus: builder.mutation<
      MaalemCategory,
      { id: number; is_active: boolean }
    >({
      query: ({ id, is_active }) => ({
        url: `/admin/maalem-categories/${id}/status`,
        method: 'PATCH',
        body: { is_active },
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'MaalemCategory', id },
        { type: 'MaalemCategory', id: 'LIST' },
        { type: 'MaalemCategory', id: 'ACTIVE' },
      ],
    }),
  }),
});

export const {
  useGetMaalemCategoriesQuery,
  useGetActiveMaalemCategoriesQuery,
  useCreateMaalemCategoryMutation,
  useUpdateMaalemCategoryMutation,
  useSetMaalemCategoryStatusMutation,
} = maalemCategoriesApi;
