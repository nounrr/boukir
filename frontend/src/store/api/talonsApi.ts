import { api } from './apiSlice';

export const talonsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getTalons: builder.query({
      query: () => '/talons',
      providesTags: ['Talon'],
    }),
    getTalonById: builder.query({
      query: (id) => `/talons/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Talon', id }],
    }),
    createTalon: builder.mutation({
      query: (newTalon) => ({
        url: '/talons',
        method: 'POST',
        body: newTalon,
      }),
      invalidatesTags: ['Talon'],
    }),
    updateTalon: builder.mutation({
      query: ({ id, ...patch }) => ({
        url: `/talons/${id}`,
        method: 'PUT',
        body: patch,
      }),
      invalidatesTags: ['Talon'],
    }),
    deleteTalon: builder.mutation({
      query: (id) => ({
        url: `/talons/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Talon'],
    }),
  }),
});

export const {
  useGetTalonsQuery,
  useGetTalonByIdQuery,
  useCreateTalonMutation,
  useUpdateTalonMutation,
  useDeleteTalonMutation,
} = talonsApi;
