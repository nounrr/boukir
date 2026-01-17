import { apiSlice } from './apiSlice';

export const inventoryApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    createSnapshot: builder.mutation<{ ok: boolean; id: number; date: string; jsonUrl: string; csvUrl: string; totals: any }, void>({
      query: () => ({ url: '/inventory/snapshots', method: 'POST' }),
      invalidatesTags: ['Product'],
    }),
    listSnapshots: builder.query<{ ok: boolean; date: string; snapshots: Array<{ id: number; created_at: string; totals?: any; files: Array<{ type: 'json'|'csv'; url: string }> }> }, { date?: string }>({
      query: ({ date } = {}) => ({ url: `/inventory/snapshots${date ? `?date=${encodeURIComponent(date)}` : ''}` }),
    }),
    getSnapshot: builder.query<{ ok: boolean; snapshot: any }, { id: string; date?: string }>({
      query: ({ id, date }) => ({ url: `/inventory/snapshots/${encodeURIComponent(id)}${date ? `?date=${encodeURIComponent(date)}` : ''}` }),
    }),
  }),
});

export const { useCreateSnapshotMutation, useListSnapshotsQuery, useGetSnapshotQuery } = inventoryApi;
