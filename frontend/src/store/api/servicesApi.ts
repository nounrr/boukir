import { apiSlice } from './apiSlice';
import type { SaveServiceData, Service } from '../../types';

export type ServiceStatusFilter = 'all' | 'active' | 'inactive';

export interface ServiceFilters {
  status: ServiceStatusFilter;
  q?: string;
  category_id?: number;
}

function toFormData(data: SaveServiceData) {
  const body = new FormData();
  body.append('nom', data.nom);
  body.append('nom_ar', data.nom_ar);
  body.append('description', data.description || '');
  body.append('description_ar', data.description_ar || '');
  body.append('is_active', String(data.is_active));
  body.append('category_ids', JSON.stringify(data.category_ids));
  body.append('remove_image', String(Boolean(data.remove_image)));
  if (data.image) body.append('image', data.image);
  return body;
}

export const servicesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getServices: builder.query<Service[], ServiceFilters>({
      query: ({ status, q, category_id }) => ({
        url: '/admin/services',
        params: {
          status,
          ...(q ? { q } : {}),
          ...(category_id ? { category_id } : {}),
        },
      }),
      providesTags: (result) => result
        ? [
            ...result.map(({ id }) => ({ type: 'Service' as const, id })),
            { type: 'Service' as const, id: 'LIST' },
          ]
        : [{ type: 'Service' as const, id: 'LIST' }],
    }),
    getServiceById: builder.query<Service, number>({
      query: (id) => ({ url: `/admin/services/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'Service', id }],
    }),
    getActiveServices: builder.query<Service[], void>({
      query: () => ({ url: '/services' }),
      providesTags: [{ type: 'Service', id: 'ACTIVE' }],
    }),
    createService: builder.mutation<Service, SaveServiceData>({
      query: (data) => ({ url: '/admin/services', method: 'POST', body: toFormData(data) }),
      invalidatesTags: [
        { type: 'Service', id: 'LIST' },
        { type: 'Service', id: 'ACTIVE' },
      ],
    }),
    updateService: builder.mutation<Service, { id: number; data: SaveServiceData }>({
      query: ({ id, data }) => ({
        url: `/admin/services/${id}`,
        method: 'PUT',
        body: toFormData(data),
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Service', id },
        { type: 'Service', id: 'LIST' },
        { type: 'Service', id: 'ACTIVE' },
      ],
    }),
    setServiceStatus: builder.mutation<Service, { id: number; is_active: boolean }>({
      query: ({ id, is_active }) => ({
        url: `/admin/services/${id}/status`,
        method: 'PATCH',
        body: { is_active },
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Service', id },
        { type: 'Service', id: 'LIST' },
        { type: 'Service', id: 'ACTIVE' },
      ],
    }),
    deleteService: builder.mutation<void, number>({
      query: (id) => ({ url: `/admin/services/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'Service', id },
        { type: 'Service', id: 'LIST' },
        { type: 'Service', id: 'ACTIVE' },
      ],
    }),
  }),
});

export const {
  useGetServicesQuery,
  useGetServiceByIdQuery,
  useGetActiveServicesQuery,
  useCreateServiceMutation,
  useUpdateServiceMutation,
  useSetServiceStatusMutation,
  useDeleteServiceMutation,
} = servicesApi;
