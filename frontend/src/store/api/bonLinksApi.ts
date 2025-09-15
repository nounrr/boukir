import { api } from './apiSlice';

export interface BonLink {
  id: number;
  relation_type: string; // 'duplication' | 'transformation' | ...
  source_bon_type: string;
  source_bon_id: number;
  target_bon_type: string;
  target_bon_id: number;
  created_by?: number | null;
  created_at?: string;
}

export const bonLinksApi = api.injectEndpoints({
  endpoints: (builder) => ({
    createBonLink: builder.mutation<BonLink, Omit<BonLink, 'id' | 'created_at'>>({
      query: (body) => ({ url: '/bon-links', method: 'POST', body }),
      invalidatesTags: (_res, _err, body) => [
        { type: 'Bon' as const, id: body.source_bon_id },
        { type: 'Bon' as const, id: body.target_bon_id },
      ],
    }),

    getBonLinksBatch: builder.mutation<Record<string, any>, { type: string; ids: number[] }>({
      query: (body) => ({ url: '/bon-links/batch', method: 'POST', body }),
    }),
  }),
});

export const { useCreateBonLinkMutation, useGetBonLinksBatchMutation } = bonLinksApi;
