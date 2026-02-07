import { api } from './apiSlice';

export const calcApi = api.injectEndpoints({
  endpoints: (builder) => ({
    previewMouvement: builder.mutation<
      { mouvement_calc: { profit: number; costBase: number; marginPct: number | null } },
      { type: string; items: any[] }
    >({
      query: (body) => ({
        url: '/calc/mouvement',
        method: 'POST',
        body,
      }),
    }),
  }),
});

export const { usePreviewMouvementMutation } = calcApi;
