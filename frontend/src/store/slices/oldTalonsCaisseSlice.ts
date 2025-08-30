import { api } from '../api/apiSlice';
import type { OldTalonCaisse, CreateOldTalonCaisseData } from '../../types';

export const oldTalonsCaisseApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // Récupérer tous les anciens talons caisse
    getOldTalonsCaisse: builder.query<OldTalonCaisse[], void>({
      query: () => '/old-talons-caisse',
      providesTags: ['OldTalonCaisse'],
    }),

    // Récupérer un ancien talon caisse par ID
    getOldTalonCaisseById: builder.query<OldTalonCaisse, number>({
      query: (id) => `/old-talons-caisse/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'OldTalonCaisse', id }],
    }),

    // Créer un nouvel ancien talon caisse
    createOldTalonCaisse: builder.mutation<{ message: string; data: OldTalonCaisse }, CreateOldTalonCaisseData>({
      query: (data) => ({
        url: '/old-talons-caisse',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['OldTalonCaisse'],
    }),

    // Modifier un ancien talon caisse
    updateOldTalonCaisse: builder.mutation<{ message: string; data: OldTalonCaisse }, { id: number; data: Partial<CreateOldTalonCaisseData> }>({
      query: ({ id, data }) => ({
        url: `/old-talons-caisse/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'OldTalonCaisse', id },
        'OldTalonCaisse',
      ],
    }),

    // Supprimer un ancien talon caisse
    deleteOldTalonCaisse: builder.mutation<{ message: string }, { id: number }>({
      query: ({ id }) => ({
        url: `/old-talons-caisse/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'OldTalonCaisse', id },
        'OldTalonCaisse',
      ],
    }),

    // Changer le statut d'un ancien talon caisse
    changeOldTalonCaisseStatus: builder.mutation<{ message: string; data: OldTalonCaisse }, { id: number; validation: 'Validé' | 'En attente' | 'Refusé' | 'Annulé' }>({
      query: ({ id, validation }) => ({
        url: `/old-talons-caisse/${id}/status`,
        method: 'PUT',
        body: { validation },
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'OldTalonCaisse', id },
        'OldTalonCaisse',
      ],
    }),
  }),
});

export const {
  useGetOldTalonsCaisseQuery,
  useGetOldTalonCaisseByIdQuery,
  useCreateOldTalonCaisseMutation,
  useUpdateOldTalonCaisseMutation,
  useDeleteOldTalonCaisseMutation,
  useChangeOldTalonCaisseStatusMutation,
} = oldTalonsCaisseApi;
