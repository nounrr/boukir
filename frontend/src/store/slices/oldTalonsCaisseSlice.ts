import { api } from '../api/apiSlice';
import type { OldTalonCaisse, CreateOldTalonCaisseData } from '../../types';

export interface OldTalonsCaissePagedQueryArgs {
  page?: number;
  limit?: number;
  q?: string;
  date?: string;
  status?: string[];
  mode?: 'all' | 'Espèces' | 'Chèque' | 'Virement' | 'Traite';
  talonId?: string;
  onlyDueSoon?: boolean;
  sortField?: 'numero' | 'talon' | 'montant' | 'date' | 'echeance' | null;
  sortDir?: 'asc' | 'desc';
}

export interface OldTalonsCaissePagedResponse {
  data: OldTalonCaisse[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
  stats: {
    total: number;
    validés: number;
    enAttente: number;
    montantTotal: number;
    echeanceProche: number;
  };
}

export const oldTalonsCaisseApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // Récupérer tous les anciens talons caisse
    getOldTalonsCaisse: builder.query<OldTalonCaisse[], void>({
      query: () => '/old-talons-caisse',
      providesTags: ['OldTalonCaisse'],
    }),

    // Récupérer des anciens talons caisse avec pagination + stats (calculées backend)
    getOldTalonsCaissePaged: builder.query<OldTalonsCaissePagedResponse, OldTalonsCaissePagedQueryArgs>({
      query: (args) => {
        const params = new URLSearchParams();
        if (args.page) params.set('page', String(args.page));
        if (args.limit) params.set('limit', String(args.limit));
        if (args.q) params.set('q', args.q);
        if (args.date) params.set('date', args.date);
        if (args.mode && args.mode !== 'all') params.set('mode', args.mode);
        if (args.talonId) params.set('talonId', args.talonId);
        if (args.onlyDueSoon) params.set('onlyDueSoon', 'true');
        if (args.status && args.status.length > 0) params.set('status', args.status.join(','));
        if (args.sortField) params.set('sortField', args.sortField);
        if (args.sortDir && args.sortField) params.set('sortDir', args.sortDir);

        const qs = params.toString();
        return `/old-talons-caisse/paged${qs ? `?${qs}` : ''}`;
      },
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
  useGetOldTalonsCaissePagedQuery,
  useLazyGetOldTalonsCaissePagedQuery,
  useGetOldTalonCaisseByIdQuery,
  useCreateOldTalonCaisseMutation,
  useUpdateOldTalonCaisseMutation,
  useDeleteOldTalonCaisseMutation,
  useChangeOldTalonCaisseStatusMutation,
} = oldTalonsCaisseApi;
