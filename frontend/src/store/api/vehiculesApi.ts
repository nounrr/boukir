import { api } from './apiSlice';
import type { Vehicule, CreateVehiculeData } from '../../types';

const vehiculesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getVehicules: builder.query<Vehicule[], void>({
      query: () => '/vehicules',
      providesTags: ['Vehicule'],
    }),

    getVehiculesDisponibles: builder.query<Vehicule[], void>({
      query: () => '/vehicules/disponibles',
      providesTags: ['Vehicule'],
    }),

    getVehicule: builder.query<Vehicule, number>({
      query: (id) => ({ url: `/vehicules/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'Vehicule', id }],
    }),

    createVehicule: builder.mutation<Vehicule, CreateVehiculeData & { created_by: number }>({
      query: (body) => ({
        url: '/vehicules',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Vehicule'],
    }),

    updateVehicule: builder.mutation<Vehicule, Partial<Vehicule> & { id: number; updated_by: number }>({
      query: ({ id, ...patch }) => ({
        url: `/vehicules/${id}`,
        method: 'PUT',
        body: patch,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Vehicule', id }, 'Vehicule'],
    }),

    deleteVehicule: builder.mutation<void, { id: number }>({
      query: ({ id }) => ({
        url: `/vehicules/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Vehicule'],
    }),
  }),
});

export const {
  useGetVehiculesQuery,
  useGetVehiculesDisponiblesQuery,
  useGetVehiculeQuery,
  useCreateVehiculeMutation,
  useUpdateVehiculeMutation,
  useDeleteVehiculeMutation,
} = vehiculesApi;

export { vehiculesApi };
